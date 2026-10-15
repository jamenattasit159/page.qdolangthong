<?php
/**
 * Old Work Backlog Report API (Optimized)
 * รายงานงานค้างเก่า (ตั้งแต่ 31 ธ.ค. 2568 ลงไป)
 * แยกตามฝ่ายและประเภทงาน (สุดขั้นตอน/งานศาล/งานค้าง)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    // Get report type and months
    $reportType = isset($_GET['report_type']) ? trim($_GET['report_type']) : 'yearly';
    $startMonthParam = $_GET['start_month'] ?? null;
    $endMonthParam = $_GET['end_month'] ?? null;

    $requestedStartMonth = $startMonthParam ? (int) date('n', strtotime($startMonthParam . '-01')) : 1;
    $requestedEndMonth = $endMonthParam ? (int) date('n', strtotime($endMonthParam . '-01')) : (int) date('n');

    // Determine loop bounds
    if ($reportType === 'monthly') {
        $loopStart = $requestedStartMonth;
        $loopEnd = $requestedStartMonth;
    } elseif ($reportType === 'range') {
        $loopStart = $requestedStartMonth;
        $loopEnd = $requestedEndMonth;
    } else {
        // Yearly (สะสม)
        $loopStart = 1;
        $loopEnd = $requestedStartMonth;
    }

    // Baseline date: 31 Dec 2025 (BE 2568)
    $baselineDate = '2025-12-31';
    $reportYear = $_GET['year'] ?? ($startMonthParam ? date('Y', strtotime($startMonthParam . '-01')) : date('Y'));

    // Department mapping
    $deptMap = [
        'survey' => ['table' => 'survey_works', 'name' => 'ฝ่ายรังวัด', 'order' => 4],
        'registration' => ['table' => 'registration_works', 'name' => 'ฝ่ายทะเบียน', 'order' => 3],
        'academic' => ['table' => 'academic_works', 'name' => 'กลุ่มงานวิชาการที่ดิน', 'order' => 2],
        'admin' => ['table' => 'administration_works', 'name' => 'ฝ่ายอำนวยการ', 'order' => 1]
    ];

    // Base condition for "Old Work"
    $oldWorkCondition = "received_date < '2026-01-01'";

    // Fixed baseline for December 2568 (ยอดยกมา ณ 31 ธ.ค. 68)
    // These values are ONLY used for December display
    $academicBaseline = ['final_step' => 0, 'court_work' => 1, 'backlog' => 69];
    $surveyBaseline = ['final_step' => 0, 'court_work' => 0, 'backlog' => 545];

    // ============ OPTIMIZED: Pre-fetch all data in batch queries ============
    $allData = [];

    foreach ($deptMap as $deptKey => $deptInfo) {
        $table = $deptInfo['table'];

        // Single query to get all relevant data for this department
        $sql = "SELECT 
                    progress_type,
                    DATE_FORMAT(completion_date, '%Y-%m') as comp_month,
                    COUNT(*) as cnt
                FROM $table 
                WHERE $oldWorkCondition
                GROUP BY progress_type, DATE_FORMAT(completion_date, '%Y-%m')";

        $stmt = $conn->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $allData[$deptKey] = [
            'type2_total' => 0,
            'type3_total' => 0,
            'type4_total' => 0,
            'type2_comps' => [], // เก็บยอดที่เสร็จของ Type 2 แยกตามเดือน
            'type3_comps' => [], // เก็บยอดที่เสร็จของ Type 3 แยกตามเดือน
            'type4_comps' => []  // เก็บยอดที่เสร็จของ Type 4 แยกตามเดือน
        ];

        foreach ($rows as $row) {
            $pt = (int) $row['progress_type'];
            $compMonth = $row['comp_month'] ?: 'none';
            $cnt = (int) $row['cnt'];

            if ($pt == 2) {
                $allData[$deptKey]['type2_total'] += $cnt;
                if ($compMonth !== 'none') {
                    $allData[$deptKey]['type2_comps'][$compMonth] = ($allData[$deptKey]['type2_comps'][$compMonth] ?? 0) + $cnt;
                }
            } else if ($pt == 3) {
                $allData[$deptKey]['type3_total'] += $cnt;
                if ($compMonth !== 'none') {
                    $allData[$deptKey]['type3_comps'][$compMonth] = ($allData[$deptKey]['type3_comps'][$compMonth] ?? 0) + $cnt;
                }
            } else if ($pt == 4) {
                $allData[$deptKey]['type4_total'] += $cnt;
                if ($compMonth !== 'none') {
                    $allData[$deptKey]['type4_comps'][$compMonth] = ($allData[$deptKey]['type4_comps'][$compMonth] ?? 0) + $cnt;
                }
            }
        }
    }

    // Calculate total old work using baselines for Dec
    $totalOldWork = 0;
    foreach ($allData as $deptKey => $data) {
        if ($deptKey === 'academic') {
            $totalOldWork += $academicBaseline['backlog'];
        } elseif ($deptKey === 'survey') {
            $totalOldWork += $surveyBaseline['backlog'];
        } else {
            $totalOldWork += $data['type4_total'];
        }
    }

    // Initialize rolling state with December baseline values
    // For January onwards, this will be carried forward with actual completions
    $type4Rolling = [];
    foreach ($deptMap as $deptKey => $deptInfo) {
        if ($deptKey === 'academic') {
            $type4Rolling[$deptKey] = $academicBaseline['backlog'];  // 69
        } elseif ($deptKey === 'survey') {
            $type4Rolling[$deptKey] = $surveyBaseline['backlog'];    // 545
        } else {
            $type4Rolling[$deptKey] = $allData[$deptKey]['type4_total'];
        }
    }

    $months = [];

    // Add December baseline if yearly and starting from Jan
    if ($reportYear == 2026 && $reportType === 'yearly' && $loopStart == 1) {
        $startingMonth = [
            'month' => '2025-12',
            'month_label' => 'ธันวาคม 2568 (ยอดยกมา)',
            'departments' => []
        ];

        foreach ($deptMap as $deptKey => $deptInfo) {
            // December always uses baseline values
            if ($deptKey === 'academic') {
                $counts = [2 => $academicBaseline['final_step'], 3 => $academicBaseline['court_work']];
                $currentT4 = $academicBaseline['backlog'];
            } elseif ($deptKey === 'survey') {
                $counts = [2 => $surveyBaseline['final_step'], 3 => $surveyBaseline['court_work']];
                $currentT4 = $surveyBaseline['backlog'];
            } else {
                $counts = [2 => $allData[$deptKey]['type2_total'], 3 => $allData[$deptKey]['type3_total']];
                $currentT4 = $type4Rolling[$deptKey];
            }

            $startingMonth['departments'][$deptKey] = [
                'name' => $deptInfo['name'],
                'order' => $deptInfo['order'],
                'final_step' => $counts[2],
                'court_work' => $counts[3],
                'backlog_total' => $currentT4,
                'backlog_target' => round($currentT4 * 0.05),
                'completed_count' => 0,
                'completed_percentage' => 0,
                'remaining' => $currentT4
            ];
        }

        uasort($startingMonth['departments'], fn($a, $b) => $a['order'] - $b['order']);
        $months[] = $startingMonth;
    }

    // Generate monthly reports using pre-fetched data
    for ($m = 1; $m <= 12; $m++) {
        $yearMonth = sprintf('%04d-%02d', $reportYear, $m);

        $monthData = [
            'month' => $yearMonth,
            'month_label' => getThaiMonthName($m) . ' ' . ($reportYear + 543),
            'departments' => []
        ];

        foreach ($deptMap as $deptKey => $deptInfo) {
            // Calculate cumulative completions for all types up to this month
            $cumComp2 = 0;
            $cumComp3 = 0;
            $cumComp4 = 0;
            for ($cm = 1; $cm <= $m; $cm++) {
                $cmYearMonth = sprintf('%04d-%02d', $reportYear, $cm);
                $cumComp2 += $allData[$deptKey]['type2_comps'][$cmYearMonth] ?? 0;
                $cumComp3 += $allData[$deptKey]['type3_comps'][$cmYearMonth] ?? 0;
                $cumComp4 += $allData[$deptKey]['type4_comps'][$cmYearMonth] ?? 0;
            }

            // Get completions only for CURRENT month (for Type 4)
            $completedT4 = $allData[$deptKey]['type4_comps'][$yearMonth] ?? 0;

            // Type 2 & 3: Current Remaining = Total - Cumulative Completed
            $remainingT2 = max(0, $allData[$deptKey]['type2_total'] - $cumComp2);
            $remainingT3 = max(0, $allData[$deptKey]['type3_total'] - $cumComp3);

            $openingT4 = $type4Rolling[$deptKey];

            // Type 4: Remaining = baseline - (if needed) countsT2 - cumulative completed
            if ($deptKey === 'academic' || $deptKey === 'survey') {
                $baseline = ($deptKey === 'academic') ? $academicBaseline['backlog'] : $surveyBaseline['backlog'];
                // หมายเหตุ: กรณีฝ่ายวิชาการ/รังวัด baseline 69 หรือ 545 อาจรวมงานที่เป็น Type 2 ไปแล้ว
                // ดังนั้นต้องหัก Type 2 ที่เป็นยอดรวม (ไม่ใช่ยอดคงเหลือ) ออกด้วยตาม logic เดิมของคุณ
                $remainingT4 = max(0, $baseline - $allData[$deptKey]['type2_total'] - $cumComp4);

                if ($m == 1) {
                    $openingT4 = $baseline;
                }
            } else {
                $remainingT4 = max(0, $openingT4 - $completedT4);
            }

            $percentageT4 = $openingT4 > 0 ? round(($completedT4 / $openingT4) * 100, 2) : 0;
            $type4Rolling[$deptKey] = $remainingT4;

            $monthData['departments'][$deptKey] = [
                'name' => $deptInfo['name'],
                'order' => $deptInfo['order'],
                'final_step' => $remainingT2, // ยอดคงค้างหน้างานสุดขั้นตอน
                'court_work' => $remainingT3, // ยอดคงค้างหน้างานศาล
                'backlog_total' => $openingT4,
                'backlog_target' => round($openingT4 * 0.05),
                'completed_count' => $completedT4,
                'completed_percentage' => $percentageT4,
                'remaining' => $remainingT4
            ];
        }

        if ($m >= $loopStart && $m <= $loopEnd) {
            uasort($monthData['departments'], fn($a, $b) => $a['order'] - $b['order']);
            $months[] = $monthData;
        }

        if ($m > $loopEnd && $reportType !== 'yearly') {
            break;
        }
    }

    echo json_encode([
        'status' => 'success',
        'baseline_date' => $baselineDate,
        'baseline_label' => 'ยอดยกมา ณ วันที่ 31 ธ.ค. 68',
        'total_old_work' => $totalOldWork,
        'report_year' => $reportYear,
        'months' => $months
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function getThaiMonthName($month)
{
    $thaiMonths = [
        1 => 'มกราคม',
        2 => 'กุมภาพันธ์',
        3 => 'มีนาคม',
        4 => 'เมษายน',
        5 => 'พฤษภาคม',
        6 => 'มิถุนายน',
        7 => 'กรกฎาคม',
        8 => 'สิงหาคม',
        9 => 'กันยายน',
        10 => 'ตุลาคม',
        11 => 'พฤศจิกายน',
        12 => 'ธันวาคม'
    ];
    return $thaiMonths[$month] ?? '';
}
?>