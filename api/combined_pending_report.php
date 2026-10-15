<?php
/**
 * Combined Pending Report API
 * Computes monthly remaining pending backlog combining Old Work (< 2026-01-01) 
 * and New Work (>= 2026-01-01) for each department with 100% exact alignment 
 * to abm_report.php and old_work_backlog.php.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

try {
    $conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

    $requestedYear = $_GET['year'] ?? date('Y');
    if ($requestedYear < 2026) $requestedYear = 2026;

    $startYear = $requestedYear . '-01-01';
    $endYear = $requestedYear . '-12-31';

    $tableMap = [
        'academic' => ['table' => 'academic_works', 'name' => 'กลุ่มงานวิชาการที่ดิน', 'order' => 1],
        'registration' => ['table' => 'registration_works', 'name' => 'ฝ่ายทะเบียน', 'order' => 2],
        'survey' => ['table' => 'survey_works', 'name' => 'ฝ่ายรังวัด', 'order' => 3],
        'admin' => ['table' => 'administration_works', 'name' => 'ฝ่ายอำนวยการ', 'order' => 4]
    ];

    // ==========================================
    // 1. CALCULATION OF OLD WORK PENDING (< 2026-01-01)
    // ==========================================
    $academicBaseline = ['final_step' => 0, 'court_work' => 1, 'backlog' => 69];
    $surveyBaseline = ['final_step' => 0, 'court_work' => 0, 'backlog' => 545];

    $oldWorkData = [];
    foreach ($tableMap as $deptKey => $info) {
        $table = $info['table'];
        $sql = "SELECT progress_type, DATE_FORMAT(completion_date, '%Y-%m') as comp_month, COUNT(*) as cnt 
                FROM $table WHERE received_date < '2026-01-01' 
                GROUP BY progress_type, DATE_FORMAT(completion_date, '%Y-%m')";
        $stmt = $conn->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $oldWorkData[$deptKey] = [
            'type2_total' => 0,
            'type3_total' => 0,
            'type4_total' => 0,
            'type2_comps' => [],
            'type3_comps' => [],
            'type4_comps' => []
        ];

        foreach ($rows as $row) {
            $pt = (int)$row['progress_type'];
            $cm = $row['comp_month'] ?: 'none';
            $cnt = (int)$row['cnt'];
            if ($pt == 2) {
                $oldWorkData[$deptKey]['type2_total'] += $cnt;
                if ($cm !== 'none') $oldWorkData[$deptKey]['type2_comps'][$cm] = ($oldWorkData[$deptKey]['type2_comps'][$cm] ?? 0) + $cnt;
            }
            if ($pt == 3) {
                $oldWorkData[$deptKey]['type3_total'] += $cnt;
                if ($cm !== 'none') $oldWorkData[$deptKey]['type3_comps'][$cm] = ($oldWorkData[$deptKey]['type3_comps'][$cm] ?? 0) + $cnt;
            }
            if ($pt == 4) {
                $oldWorkData[$deptKey]['type4_total'] += $cnt;
                if ($cm !== 'none') $oldWorkData[$deptKey]['type4_comps'][$cm] = ($oldWorkData[$deptKey]['type4_comps'][$cm] ?? 0) + $cnt;
            }
        }
    }

    // ==========================================
    // 2. CALCULATION OF NEW WORK PENDING (>= 2026-01-01)
    // ==========================================
    $savedDataByMonthDept = [];
    $savedStmt = $conn->prepare("
        SELECT years_month, department, SUM(completed_within_30) as completed_within_30, SUM(completed_within_60) as completed_within_60
        FROM monthly_kpi_reports 
        WHERE years_month LIKE ? AND department IN ('survey', 'registration', 'academic')
        GROUP BY years_month, department
    ");
    $savedStmt->execute([$requestedYear . '-%']);
    while ($row = $savedStmt->fetch(PDO::FETCH_ASSOC)) {
        $savedDataByMonthDept[$row['years_month']][$row['department']] = $row;
    }

    $workStatsByMonthDept = [];
    foreach (['registration', 'academic'] as $deptKey) {
        $tableName = $tableMap[$deptKey]['table'];
        
        $sql1 = "SELECT 
            DATE_FORMAT(received_date, '%Y-%m') as month,
            COUNT(*) as current_received,
            SUM(CASE WHEN completion_date IS NOT NULL AND completion_date != '0000-00-00' 
                     AND completion_date <= CURDATE()
                     AND DATE_FORMAT(completion_date, '%Y-%m') = DATE_FORMAT(received_date, '%Y-%m') THEN 1 ELSE 0 END) as comp30,
            SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00')
                     OR (completion_date > CURDATE())
                     OR (DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')) THEN 1 ELSE 0 END) as pending
        FROM $tableName 
        WHERE received_date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(received_date, '%Y-%m')";

        $stmt = $conn->prepare($sql1);
        $stmt->execute([$startYear, $endYear]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $workStatsByMonthDept[$row['month']][$deptKey] = $row;
            $workStatsByMonthDept[$row['month']][$deptKey]['comp60'] = 0;
        }

        $sql2 = "SELECT 
            DATE_FORMAT(completion_date, '%Y-%m') as comp_month,
            COUNT(*) as comp60
        FROM $tableName 
        WHERE received_date >= '2026-01-01' AND received_date <= ?
          AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
          AND completion_date <= CURDATE()
          AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(received_date, '%Y-%m')
        GROUP BY DATE_FORMAT(completion_date, '%Y-%m')";

        $stmt = $conn->prepare($sql2);
        $stmt->execute([$endYear]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $compMonth = $row['comp_month'];
            if (!isset($workStatsByMonthDept[$compMonth][$deptKey])) {
                $workStatsByMonthDept[$compMonth][$deptKey] = ['current_received' => 0, 'comp30' => 0, 'comp60' => 0, 'pending' => 0];
            }
            $workStatsByMonthDept[$compMonth][$deptKey]['comp60'] = (int)$row['comp60'];
        }
    }

    // Survey new work stats matching abm_report.php
    $surveyIntakeByMonth = [];
    $surveyComp30ByMonth = [];
    $surveyComp60ByMonth = [];

    $sqlSurveyIntake = "SELECT DATE_FORMAT(survey_date, '%Y-%m') as month, COUNT(id) as intake_count
                        FROM survey_works 
                        WHERE received_date >= '2026-01-01' AND survey_date BETWEEN ? AND ?
                        GROUP BY DATE_FORMAT(survey_date, '%Y-%m')";
    $stmt = $conn->prepare($sqlSurveyIntake);
    $stmt->execute([$startYear, $endYear]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $surveyIntakeByMonth[$row['month']] = (int)$row['intake_count'];
    }

    $sqlSurveyComp = "SELECT 
            DATE_FORMAT(completion_date, '%Y-%m') as month,
            SUM(CASE WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00'
                     AND DATE_FORMAT(survey_date, '%Y-%m') = DATE_FORMAT(completion_date, '%Y-%m') THEN 1 ELSE 0 END) as comp30,
            SUM(CASE WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00'
                     AND DATE_FORMAT(survey_date, '%Y-%m') != DATE_FORMAT(completion_date, '%Y-%m') THEN 1 ELSE 0 END) as comp60
        FROM survey_works 
        WHERE received_date >= '2026-01-01'
          AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
          AND completion_date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(completion_date, '%Y-%m')";
    $stmt = $conn->prepare($sqlSurveyComp);
    $stmt->execute([$startYear, $endYear]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $surveyComp30ByMonth[$row['month']] = (int)$row['comp30'];
        $surveyComp60ByMonth[$row['month']] = (int)$row['comp60'];
    }

    // ==========================================
    // 3. COMBINE MONTHLY TREND
    // ==========================================
    $months = [];
    $thaiMonths = [
        1 => 'มกราคม', 2 => 'กุมภาพันธ์', 3 => 'มีนาคม', 4 => 'เมษายน',
        5 => 'พฤษภาคม', 6 => 'มิถุนายน', 7 => 'กรกฎาคม', 8 => 'สิงหาคม',
        9 => 'กันยายน', 10 => 'ตุลาคม', 11 => 'พฤศจิกายน', 12 => 'ธันวาคม'
    ];

    $deptNewRunningBal = ['academic' => 0, 'registration' => 0, 'survey' => 0, 'admin' => 0];

    $currentMonthIdx = (int)date('n');
    $currentYearNum = (int)date('Y');
    $maxM = ($requestedYear == $currentYearNum) ? max(1, $currentMonthIdx) : 12;

    for ($m = 1; $m <= $maxM; $m++) {
        $ym = sprintf('%04d-%02d', $requestedYear, $m);
        $monthLabel = $thaiMonths[$m] . ' ' . ($requestedYear + 543);
        $lastDay = date('t', strtotime("$ym-01"));
        $endDate = "$ym-$lastDay";

        $monthSummary = [
            'month' => $ym,
            'month_label' => $monthLabel,
            'depts' => [],
            'totals' => [
                'old_pending' => 0,
                'new_pending' => 0,
                'total_pending' => 0,
                'type2_total' => 0,
                'type3_total' => 0,
                'type23_total' => 0
            ]
        ];

        foreach ($tableMap as $deptKey => $info) {
            // A. Calculate Old Pending for month m (matching old_work_backlog.php)
            $cumOldComp2 = 0;
            $cumOldComp3 = 0;
            $cumOldComp4 = 0;
            for ($cm = 1; $cm <= $m; $cm++) {
                $cmKey = sprintf('%04d-%02d', $requestedYear, $cm);
                $cumOldComp2 += $oldWorkData[$deptKey]['type2_comps'][$cmKey] ?? 0;
                $cumOldComp3 += $oldWorkData[$deptKey]['type3_comps'][$cmKey] ?? 0;
                $cumOldComp4 += $oldWorkData[$deptKey]['type4_comps'][$cmKey] ?? 0;
            }

            $remOldType2 = max(0, $oldWorkData[$deptKey]['type2_total'] - $cumOldComp2);
            $remOldType3 = max(0, $oldWorkData[$deptKey]['type3_total'] - $cumOldComp3);

            if ($deptKey === 'academic') {
                $oldPending = max(0, $academicBaseline['backlog'] - $oldWorkData[$deptKey]['type2_total'] - $cumOldComp4);
            } elseif ($deptKey === 'survey') {
                $oldPending = max(0, $surveyBaseline['backlog'] - $oldWorkData[$deptKey]['type2_total'] - $cumOldComp4);
            } else {
                $oldPending = max(0, $oldWorkData[$deptKey]['type4_total'] - $cumOldComp4);
            }

            // B. Calculate New Pending for month m (matching abm_report.php)
            if ($deptKey === 'survey') {
                $sIntake = $surveyIntakeByMonth[$ym] ?? 0;
                $sComp30 = $surveyComp30ByMonth[$ym] ?? 0;
                $sComp60 = $surveyComp60ByMonth[$ym] ?? 0;

                $pendingMonth = $sIntake - $sComp30;
                $prevBal = $deptNewRunningBal['survey'];
                $prevBalNet = max(0, $prevBal - $sComp60);
                $newPending = $prevBalNet + $pendingMonth;
                $deptNewRunningBal['survey'] = $newPending;
            } elseif ($deptKey === 'admin') {
                $newPending = 0;
            } else {
                $wd = $workStatsByMonthDept[$ym][$deptKey] ?? ['comp60' => 0, 'pending' => 0];
                $sd = $savedDataByMonthDept[$ym][$deptKey] ?? [];
                $m60 = (int)($sd['completed_within_60'] ?? 0);
                $pendingMonth = (int)($wd['pending'] ?? 0);
                $comp60 = (int)($wd['comp60'] ?? 0) + $m60;

                $prevBal = $deptNewRunningBal[$deptKey];
                $prevBalNet = max(0, $prevBal - $comp60);
                $newPending = $prevBalNet + $pendingMonth;
                $deptNewRunningBal[$deptKey] = $newPending;
            }

            $totalPending = $oldPending + $newPending;
            $type23 = $remOldType2 + $remOldType3;

            $monthSummary['depts'][$deptKey] = [
                'name' => $info['name'],
                'order' => $info['order'],
                'old_pending' => $oldPending,
                'new_pending' => $newPending,
                'total_pending' => $totalPending,
                'final_step' => $remOldType2,
                'court_work' => $remOldType3,
                'type23_total' => $type23
            ];

            $monthSummary['totals']['old_pending'] += $oldPending;
            $monthSummary['totals']['new_pending'] += $newPending;
            $monthSummary['totals']['total_pending'] += $totalPending;
            $monthSummary['totals']['type2_total'] += $remOldType2;
            $monthSummary['totals']['type3_total'] += $remOldType3;
            $monthSummary['totals']['type23_total'] += $type23;
        }

        $months[] = $monthSummary;
    }

    echo json_encode([
        'status' => 'success',
        'year' => $requestedYear,
        'months' => $months
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
