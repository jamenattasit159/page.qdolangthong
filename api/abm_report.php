<?php
/**
 * ABM Report API
 * Handles monthly ABM report data for old work and new work tracking
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

// Enable Emulate Prepares to allow duplicate named parameters in queries
$conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Get ABM report data
            $yearMonth = $_GET['years_month'] ?? null;
            $department = $_GET['department'] ?? 'all';

            // 1. Get saved user input data (Completed Work from monthly_kpi_reports)

            // Define departments
            $departments = ['survey', 'registration', 'academic', 'admin'];

            // Helper function to get stats for a specific department
            function getDepartmentStats($conn, $dept, $baselineDateCE, $yearMonth)
            {
                // Define Month Range
                $startMonth = $yearMonth . '-01';
                $endMonth = date('Y-m-t', strtotime($startMonth));

                // Get Saved Data (Aggregated if duplicates exist)
                $saved = [
                    'old_work_baseline' => 0,
                    'new_work_received' => 0,
                    'new_work_completed' => 0,
                    'completed_within_30' => 0,
                    'completed_within_60' => 0,
                    'completed_over_60' => 0,
                    'notes' => ''
                ];
                if ($yearMonth) {
                    $stmt = $conn->prepare("
                        SELECT 
                            SUM(old_work_baseline) as old_work_baseline,
                            SUM(new_work_received) as new_work_received,
                            SUM(new_work_completed) as new_work_completed,
                            SUM(completed_within_30) as completed_within_30,
                            SUM(completed_within_60) as completed_within_60,
                            SUM(completed_over_60) as completed_over_60,
                            SUM(survey_received_from_reg) as survey_reg,
                            MAX(notes) as notes
                        FROM monthly_kpi_reports 
                        WHERE years_month = ? AND department = ?
                        GROUP BY years_month, department
                    ");
                    $stmt->execute([$yearMonth, $dept]);
                    $fetched = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($fetched) {
                        $saved = $fetched;
                    }
                }

                $tableMap = [
                    'survey' => 'survey_works',
                    'registration' => 'registration_works',
                    'academic' => 'academic_works',
                    'admin' => 'administration_works'
                ];

                $table = $tableMap[$dept] ?? null;

                if (!$table) {
                    return [
                        'saved' => $saved,
                        'current_received' => 0,
                        'current_completed' => 0,
                        'current_pending' => 0,
                        'prev_resolved' => 0,
                        'prev_pending' => 0,
                        'old_pending' => 0
                    ];
                }

                // New Work Stats with same-month logic
                // comp30 = received AND completed in the SAME month
                // pending = received this month AND not completed within the same month
                $sql = "SELECT 
                    -- Intake of Requested Month
                    SUM(CASE WHEN received_date BETWEEN :start_m AND :end_m THEN 1 ELSE 0 END) as current_received,
                    
                    -- (7) Completed within the same month as received (เสร็จภายในเดือนที่รับ)
                    SUM(CASE WHEN received_date BETWEEN :start_m AND :end_m 
                             AND completion_date IS NOT NULL AND completion_date != '0000-00-00' 
                             AND DATE_FORMAT(completion_date, '%Y-%m') = DATE_FORMAT(received_date, '%Y-%m') THEN 1 ELSE 0 END) as current_completed_30,
                    
                    -- (8) comp60 will be calculated separately (งานเดือนก่อนเสร็จเดือนนี้)
                    0 as current_completed_60,
                    
                    -- (9) Pending: not completed within the same month (งานค้างยกไปเดือนหน้า)
                    SUM(CASE WHEN received_date BETWEEN :start_m AND :end_m 
                             AND (completion_date IS NULL OR completion_date = '0000-00-00' 
                                  OR DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')) THEN 1 ELSE 0 END) as count_pending,

                    -- Breakdown of Pending (Month's Intake)
                    SUM(CASE WHEN received_date BETWEEN :start_m AND :end_m 
                             AND ((completion_date IS NULL OR completion_date = '0000-00-00' 
                                  OR DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')))
                             AND progress_type = 2 THEN 1 ELSE 0 END) as pending_type2,
                             
                    SUM(CASE WHEN received_date BETWEEN :start_m AND :end_m 
                             AND ((completion_date IS NULL OR completion_date = '0000-00-00' 
                                  OR DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')))
                             AND progress_type = 4 THEN 1 ELSE 0 END) as pending_type4
                FROM $table WHERE received_date BETWEEN :start_m AND :end_m";

                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    'start_m' => $startMonth,
                    'end_m' => $endMonth
                ]);
                $stats = $stmt->fetch(PDO::FETCH_ASSOC);

                // Old Work Stats (Baseline) - Keep for main view if needed
                $oldPendingSQL = "SELECT COUNT(*) as pending FROM $table WHERE received_date < :baseline AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date >= :start_m)";
                $stmt = $conn->prepare($oldPendingSQL);
                $stmt->execute(['baseline' => $baselineDateCE, 'start_m' => $startMonth]);
                $oldPending = $stmt->fetch(PDO::FETCH_ASSOC)['pending'];

                if ($dept === 'survey') {
                    return [
                        'saved' => $saved,
                        'current_received' => 0,
                        'current_completed_30' => 0,
                        'current_completed_60' => 0,
                        'current_pending' => 0,
                        'pending_type2' => 0,
                        'pending_type4' => 0,
                        'old_pending' => 0
                    ];
                }

                return [
                    'saved' => $saved,
                    'current_received' => (int) ($stats['current_received'] ?? 0),
                    'current_completed_30' => (int) ($stats['current_completed_30'] ?? 0),
                    'current_completed_60' => (int) ($stats['current_completed_60'] ?? 0),
                    'current_pending' => (int) ($stats['count_pending'] ?? 0),
                    'pending_type2' => (int) ($stats['pending_type2'] ?? 0),
                    'pending_type4' => (int) ($stats['pending_type4'] ?? 0),
                    'old_pending' => (int) $oldPending
                ];
            }

            $baselineDateCE = '2026-01-01';

            $breakdown = [];
            foreach ($departments as $dept) {
                if ($dept === 'admin')
                    continue; // Admin ใช้เฉพาะงานเกิดเสร็จวันเดียว ไม่มีรายงาน Trend/ABM
                $breakdown[$dept] = getDepartmentStats($conn, $dept, $baselineDateCE, $yearMonth);
            }

            // Calculate Monthly Trend Breakdown by Department - OPTIMIZED VERSION
            $trend = [];
            $reportType = isset($_GET['report_type']) ? trim($_GET['report_type']) : 'yearly'; // 'monthly' or 'yearly'
            $requestedYear = $yearMonth ? date('Y', strtotime($yearMonth . '-01')) : date('Y');
            $requestedMonth = $yearMonth ? (int) date('n', strtotime($yearMonth . '-01')) : (int) date('n');
            $currentYear = date('Y');
            $currentMonth = (int) date('n');

            // Determine months to show
            if ($reportType === 'monthly') {
                $startMonthIdx = $requestedMonth;
                $maxMonthIdx = $requestedMonth;
            } elseif ($reportType === 'range') {
                $startMonthIdx = $requestedMonth;
                $endMonth = $_GET['end_month'] ?? $yearMonth;
                $maxMonthIdx = (int) date('n', strtotime($endMonth . '-01'));

                // Ensure max >= start and prevent year overflow if not handled
                if ($maxMonthIdx < $startMonthIdx)
                    $maxMonthIdx = $startMonthIdx;
            } else {
                $startMonthIdx = 1;
                // Determine max month to show for yearly view
                if ($requestedYear < $currentYear) {
                    $maxMonthIdx = 12;
                } elseif ($requestedYear == $currentYear) {
                    $maxMonthIdx = max($currentMonth, $requestedMonth);
                } else {
                    $maxMonthIdx = $requestedMonth;
                }
            }

            // Pre-fetch all saved manual KPI data for the year in one query (Aggregated)
            $savedDataByMonthDept = [];
            $savedStmt = $conn->prepare("
                SELECT 
                    years_month, 
                    department,
                    SUM(completed_within_30) as completed_within_30,
                    SUM(completed_within_60) as completed_within_60,
                    SUM(survey_received_from_reg) as survey_reg,
                    MAX(notes) as notes
                FROM monthly_kpi_reports 
                WHERE years_month LIKE ? AND department IN ('survey', 'registration', 'academic')
                GROUP BY years_month, department
            ");
            $savedStmt->execute([$requestedYear . '-%']);
            while ($row = $savedStmt->fetch(PDO::FETCH_ASSOC)) {
                $savedDataByMonthDept[$row['years_month']][$row['department']] = $row;
            }

            // Pre-fetch all work stats for all months in ONE query per table
            $tableMap = [
                'survey' => 'survey_works',
                'registration' => 'registration_works',
                'academic' => 'academic_works',
                'admin' => 'administration_works'
            ];

            $startYear = $requestedYear . '-01-01';
            $endYear = $requestedYear . '-12-31';

            // Pre-fetch same-day completion data by month/department.
            // Use the log table as the source of truth; monthly_kpi_reports can drift when old rows exist.
            $samedayByMonthDept = [];
            $samedayStmt = $conn->prepare("
                SELECT DATE_FORMAT(record_date, '%Y-%m') as month, department, SUM(count) as total
                FROM sameday_completion_logs
                WHERE record_date BETWEEN ? AND ?
                GROUP BY DATE_FORMAT(record_date, '%Y-%m'), department
            ");
            $samedayStmt->execute([$startYear, $endYear]);
            while ($row = $samedayStmt->fetch(PDO::FETCH_ASSOC)) {
                $samedayByMonthDept[$row['month']][$row['department']] = (int) $row['total'];
            }

            $workStatsByMonthDept = [];
            foreach ($tableMap as $deptKey => $tableName) {
                if ($deptKey === 'admin')
                    continue; // admin ใช้ข้อมูลจาก sameday_completion_logs แทน
                // Updated logic:
                // comp30 = Received AND completed in the SAME month (เสร็จภายในเดือนที่รับ)
                // comp60 = Received in PREVIOUS month AND completed in THIS month (งานเดือนก่อนเสร็จเดือนนี้)
                // pending = Received this month AND not completed by end of this month (งานค้างยกไปเดือนหน้า)

                // Query 1: Get stats by received month
                $sql = "SELECT 
                    DATE_FORMAT(received_date, '%Y-%m') as month,
                    COUNT(*) as current_received,
                    
                    -- comp30: Received AND completed in the SAME month (เสร็จภายในเดือนที่รับ)
                    SUM(CASE WHEN completion_date IS NOT NULL AND completion_date != '0000-00-00' 
                             AND completion_date <= CURDATE()
                             AND DATE_FORMAT(completion_date, '%Y-%m') = DATE_FORMAT(received_date, '%Y-%m') THEN 1 ELSE 0 END) as comp30,
                    
                    -- pending: Received this month AND not completed within the same month (งานค้างยกไปเดือนหน้า)
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00')
                             OR (completion_date > CURDATE())
                             OR (DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')) THEN 1 ELSE 0 END) as pending,
                    
                    -- pending breakdown by progress_type
                    SUM(CASE WHEN ((completion_date IS NULL OR completion_date = '0000-00-00')
                                 OR (completion_date > CURDATE())
                                 OR (DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')))
                             AND progress_type = 2 THEN 1 ELSE 0 END) as pending_type2,
                    SUM(CASE WHEN ((completion_date IS NULL OR completion_date = '0000-00-00')
                                 OR (completion_date > CURDATE())
                                 OR (DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')))
                             AND progress_type = 3 THEN 1 ELSE 0 END) as pending_type3,
                    SUM(CASE WHEN ((completion_date IS NULL OR completion_date = '0000-00-00')
                                 OR (completion_date > CURDATE())
                                 OR (DATE_FORMAT(completion_date, '%Y-%m') != DATE_FORMAT(received_date, '%Y-%m')))
                             AND progress_type = 4 THEN 1 ELSE 0 END) as pending_type4
                FROM $tableName 
                WHERE received_date BETWEEN ? AND ?
                GROUP BY DATE_FORMAT(received_date, '%Y-%m')
                ORDER BY month";

                $stmt = $conn->prepare($sql);
                $stmt->execute([$startYear, $endYear]);
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $workStatsByMonthDept[$row['month']][$deptKey] = $row;
                    $workStatsByMonthDept[$row['month']][$deptKey]['comp60'] = 0; // Will be calculated separately
                }

                // Query 2: Get comp60 by COMPLETION month (งานข้ามเดือนที่เสร็จเดือนนี้)
                $sqlComp60 = "SELECT 
                    DATE_FORMAT(completion_date, '%Y-%m') as comp_month,
                    COUNT(*) as comp60
                FROM $tableName 
                WHERE received_date >= '2026-01-01' AND received_date <= ?
                  AND completion_date IS NOT NULL 
                  AND completion_date != '0000-00-00'
                  AND completion_date <= CURDATE()
                  AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(received_date, '%Y-%m')
                GROUP BY DATE_FORMAT(completion_date, '%Y-%m')";

                $stmt = $conn->prepare($sqlComp60);
                $stmt->execute([$endYear]);
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $compMonth = $row['comp_month'];
                    if (!isset($workStatsByMonthDept[$compMonth][$deptKey])) {
                        $workStatsByMonthDept[$compMonth][$deptKey] = [
                            'current_received' => 0,
                            'comp30' => 0,
                            'comp60' => 0,
                            'pending' => 0,
                            'pending_type2' => 0,
                            'pending_type4' => 0
                        ];
                    }
                    $workStatsByMonthDept[$compMonth][$deptKey]['comp60'] = (int) $row['comp60'];
                }
            }

            // Query for Survey: งานรับใหม่, งานเสร็จ, และงานรับจากทะเบียน
            // งานใหม่ = received_date >= 2026-01-01
            $surveyIntakeByMonth = [];
            $surveyCompletedByMonth = [];
            $surveyReceivedByMonth = []; // งานรับจากทะเบียน (นับจาก received_date)

            // Query 0: นับงานรับจากทะเบียน (นับทุกงานที่เข้ามาในเดือนนั้น)
            $sqlSurveyReceived = "SELECT 
                DATE_FORMAT(received_date, '%Y-%m') as month,
                COUNT(*) as received_count
            FROM survey_works 
            WHERE received_date >= '2026-01-01'
              AND received_date BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(received_date, '%Y-%m')";

            $stmt = $conn->prepare($sqlSurveyReceived);
            $stmt->execute([$startYear, $endYear]);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $surveyReceivedByMonth[$row['month']] = (int) $row['received_count'];
            }

            // Query 1: นับงานรับใหม่ (Intake) - unique jobs ที่มี (status_cause = นัดรังวัด OR completion_date IS NOT NULL)
            // ถ้างานมีทั้งสองอย่าง = นับเป็น 1 งาน
            // Group by survey_date month
            $sqlSurveyIntake = "SELECT 
                DATE_FORMAT(survey_date, '%Y-%m') as month,
                COUNT(id) as intake_count
            FROM survey_works 
            WHERE received_date >= '2026-01-01'
              AND survey_date BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(survey_date, '%Y-%m')";

            $stmt = $conn->prepare($sqlSurveyIntake);
            $stmt->execute([$startYear, $endYear]);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $surveyIntakeByMonth[$row['month']] = (int) $row['intake_count'];
            }

            // Query 2: นับงานรังวัด (รับตั้งแต่ 1 ม.ค. 69) ที่เสร็จในแต่ละเดือน (ยึดตามเดือนที่เสร็จ)
            // comp30: survey_date AND completion_date อยู่ในเดือนเดียวกัน (เสร็จในวันนัดรังวัดเดียวกัน)
            // comp60: survey_date อยู่คนละเดือนกับ completion_date (ค้างมาแล้วเสร็จเดือนถัดไป)
            $surveyComp30ByMonth = [];
            $surveyComp60ByMonth = [];
            $sqlSurveyCompleted = "SELECT 
                DATE_FORMAT(completion_date, '%Y-%m') as month,
                -- comp30: survey_date AND completion_date ในเดือนเดียวกัน
                SUM(CASE
                    WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00'
                         AND DATE_FORMAT(survey_date, '%Y-%m') = DATE_FORMAT(completion_date, '%Y-%m')
                    THEN 1 ELSE 0
                END) as comp30,
                -- comp60: survey_date ต่างเดือนกับ completion_date (งานค้างมาเสร็จเดือนถัดไป)
                -- ❌ ไม่นับงานที่ survey_date เป็น NULL หรือ 0000-00-00
                SUM(CASE
                    WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00'
                         AND DATE_FORMAT(survey_date, '%Y-%m') != DATE_FORMAT(completion_date, '%Y-%m')
                    THEN 1 ELSE 0
                END) as comp60
            FROM survey_works 
            WHERE received_date >= '2026-01-01'
              AND completion_date IS NOT NULL 
              AND completion_date != '0000-00-00'
              AND completion_date BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(completion_date, '%Y-%m')";

            $stmt = $conn->prepare($sqlSurveyCompleted);
            $stmt->execute([$startYear, $endYear]);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $surveyCompletedByMonth[$row['month']] = (int) $row['comp30'] + (int) $row['comp60'];
                $surveyComp30ByMonth[$row['month']] = (int) $row['comp30'];
                $surveyComp60ByMonth[$row['month']] = (int) $row['comp60'];
            }

            // --- Pre-fetch Old Work (Before 2026) for cumulative totals ---
            $oldWorkStats = [];
            foreach ($tableMap as $deptKey => $tableName) {
                // Get totals for each type
                $sqlOld = "SELECT 
                            progress_type,
                            DATE_FORMAT(completion_date, '%Y-%m') as comp_month,
                            COUNT(*) as cnt
                          FROM $tableName 
                          WHERE received_date < '2026-01-01'
                          GROUP BY progress_type, DATE_FORMAT(completion_date, '%Y-%m')";

                $stmt = $conn->query($sqlOld);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $oldWorkStats[$deptKey] = [
                    'type2_total' => 0,
                    'type3_total' => 0,
                    'type4_total' => 0,
                    'type2_comps' => [],
                    'type3_comps' => [],
                    'type4_comps' => []
                ];

                foreach ($rows as $row) {
                    $pt = (int) $row['progress_type'];
                    $cm = $row['comp_month'] ?: 'none';
                    $cnt = (int) $row['cnt'];
                    if ($pt == 2) {
                        $oldWorkStats[$deptKey]['type2_total'] += $cnt;
                        if ($cm !== 'none')
                            $oldWorkStats[$deptKey]['type2_comps'][$cm] = ($oldWorkStats[$deptKey]['type2_comps'][$cm] ?? 0) + $cnt;
                    } else if ($pt == 3) {
                        $oldWorkStats[$deptKey]['type3_total'] += $cnt;
                        if ($cm !== 'none')
                            $oldWorkStats[$deptKey]['type3_comps'][$cm] = ($oldWorkStats[$deptKey]['type3_comps'][$cm] ?? 0) + $cnt;
                    } else if ($pt == 4) {
                        $oldWorkStats[$deptKey]['type4_total'] += $cnt;
                        if ($cm !== 'none')
                            $oldWorkStats[$deptKey]['type4_comps'][$cm] = ($oldWorkStats[$deptKey]['type4_comps'][$cm] ?? 0) + $cnt;
                    }
                }
            }
            // -------------------------------------------------------------

            // Cumulative Counters for Survey
            $surveyCumulativeIntake = 0;
            $surveyCumulativeCompleted = 0;

            // Note: To be perfectly accurate for "Pending End of Month", we need:
            // Cumulative Intake (Jan -> Month M) - Cumulative Completed (Jan -> Month M)
            // But we only have $surveyCompletedByMonth which is "Completed IN Month M" for New Work.
            // So we can sum up $surveyCompletedByMonth.

            // Pre-calculate initial balances for months BEFORE startMonthIdx
            // This is needed for monthly/range views where the loop doesn't start from Jan
            // Must use the exact same formula as the JS frontend:
            //   currentBal = max(0, prevBal - comp60 + pending)
            $initialBalances = ['survey' => 0, 'registration' => 0, 'academic' => 0, 'admin' => 0];
            if ($startMonthIdx > 1) {
                foreach (['survey', 'registration', 'academic', 'admin'] as $dept) {
                    $bal = 0;
                    for ($pm = 1; $pm < $startMonthIdx; $pm++) {
                        $pmKey = $requestedYear . '-' . str_pad($pm, 2, '0', STR_PAD_LEFT);
                        if ($dept === 'survey') {
                            $sIntake = $surveyIntakeByMonth[$pmKey] ?? 0;
                            $sComp30 = $surveyComp30ByMonth[$pmKey] ?? 0;
                            $sComp60 = $surveyComp60ByMonth[$pmKey] ?? 0;
                            // ใช้สูตรเดียวกับ trend loop: pending = intake - comp30 (ไม่หัก comp60)
                            $pending = $sIntake - $sComp30;
                            $comp60 = $sComp60;
                        } elseif ($dept === 'admin') {
                            $pending = 0;
                            $comp60 = 0;
                        } else {
                            $wd = $workStatsByMonthDept[$pmKey][$dept] ?? [];
                            $sd = $savedDataByMonthDept[$pmKey][$dept] ?? [];
                            $m30 = (int) ($sd['completed_within_30'] ?? 0);
                            $m60 = (int) ($sd['completed_within_60'] ?? 0);
                            $pending = (int) ($wd['pending'] ?? 0);
                            $comp60 = (int) ($wd['comp60'] ?? 0) + $m60;
                        }
                        $bal = max(0, $bal - $comp60 + $pending);
                    }
                    $initialBalances[$dept] = $bal;
                }
            }

            // Build trend array efficiently
            for ($m = $startMonthIdx; $m <= $maxMonthIdx; $m++) {
                $loopMonth = $requestedYear . '-' . str_pad($m, 2, '0', STR_PAD_LEFT);
                $monthStats = [
                    'month' => $loopMonth,
                    'depts' => []
                ];

                foreach (['survey', 'registration', 'academic'] as $dept) {
                    $workData = $workStatsByMonthDept[$loopMonth][$dept] ?? ['current_received' => 0, 'comp30' => 0, 'comp60' => 0, 'pending' => 0];
                    $savedData = $savedDataByMonthDept[$loopMonth][$dept] ?? [];

                    $loggedSameDay = $samedayByMonthDept[$loopMonth][$dept] ?? null;
                    $manual30 = $loggedSameDay !== null
                        ? (int) $loggedSameDay
                        : (int) ($savedData['completed_within_30'] ?? 0);
                    $manual60 = (int) ($savedData['completed_within_60'] ?? 0);
                    $surveyReg = ($dept === 'survey') ? (int) ($savedData['survey_reg'] ?? 0) : 0;

                    // Calculate remaining Old Work (Before 2026) at this point in time
                    $cumOldComp2 = 0;
                    $cumOldComp3 = 0;
                    $cumOldComp4 = 0;
                    for ($cm = 1; $cm <= $m; $cm++) {
                        $cmKey = $requestedYear . '-' . str_pad($cm, 2, '0', STR_PAD_LEFT);
                        $cumOldComp2 += $oldWorkStats[$dept]['type2_comps'][$cmKey] ?? 0;
                        $cumOldComp3 += $oldWorkStats[$dept]['type3_comps'][$cmKey] ?? 0;
                        $cumOldComp4 += $oldWorkStats[$dept]['type4_comps'][$cmKey] ?? 0;
                    }
                    $remOld2 = max(0, $oldWorkStats[$dept]['type2_total'] - $cumOldComp2);
                    $remOld3 = max(0, $oldWorkStats[$dept]['type3_total'] - $cumOldComp3);
                    $remOld4 = max(0, $oldWorkStats[$dept]['type4_total'] - $cumOldComp4);

                    if ($dept === 'survey') {
                        $surveyReceived = $surveyReceivedByMonth[$loopMonth] ?? 0;
                        $surveyIntake = $surveyIntakeByMonth[$loopMonth] ?? 0; // Intake in this month (Survey Date)
                        $surveyCompleted = $surveyCompletedByMonth[$loopMonth] ?? 0; // Completed in this month (Completion Date)

                        // Update Cumulative
                        // But wait! If we start report from Feb (e.g. range view), we miss Jan's initial cumulative.
                        // Ideally, we should loop from Month 1 to calculate cumulative correctly, even if we don't display Month 1.
                        // However, the current logic starts loop from $startMonthIdx. 
                        // For correct cumulative, we must pre-calculate if $startMonthIdx > 1.

                        // NOTE: For simplicity and assuming typical Yearly view starting Jan, this works.
                        // If Monthly view is requested for "Feb", we need previous pending.

                        // Let's recalculate cumulative from Jan up to current loop month ON THE FLY to be safe
                        // This is inefficient but safer if $startMonthIdx > 1
                        $cumIntake = 0;
                        $cumComp = 0;
                        for ($cm = 1; $cm <= $m; $cm++) {
                            $cmKey = $requestedYear . '-' . str_pad($cm, 2, '0', STR_PAD_LEFT);
                            $cumIntake += $surveyIntakeByMonth[$cmKey] ?? 0;
                            $cumComp += $surveyCompletedByMonth[$cmKey] ?? 0;
                        }

                        $pendingTotal = max(0, $cumIntake - $cumComp);
                        // Pending Total = (All Intake so far) - (All Completed so far)
                        // This represents the "Active Backlog" at the end of Month M

                        $intake = $surveyIntake;
                        $comp30 = $surveyComp30ByMonth[$loopMonth] ?? 0; // เสร็จเดือนเดียวกับที่รับ
                        $comp60 = $surveyComp60ByMonth[$loopMonth] ?? 0; // รับเดือนก่อน เสร็จเดือนนี้
                        $compPercent = ($intake > 0) ? round(($comp30 / $intake) * 100, 2) : 0;

                        // pending = intake - comp30 เท่านั้น
                        // comp60 คือ งานค้างจาก prevBal ที่มาเสร็จเดือนนี้ — JS จะหักออกจาก prevBal เอง
                        // ถ้าหัก comp60 ที่นี่ด้วย จะทำให้ JS double-subtract ผิดพลาด
                        $pendingThisMonth = $intake - $comp30;

                        $monthStats['depts'][$dept] = [
                            'intake' => $intake,
                            'comp30' => $comp30,
                            'comp60' => $comp60,
                            'pending' => $pendingThisMonth, // Net pending this month (FE accumulates)
                            'pending_type2' => (int) ($workData['pending_type2'] ?? 0) + $remOld2,
                            'pending_type3' => (int) ($workData['pending_type3'] ?? 0) + $remOld3,
                            'pending_type4' => (int) ($workData['pending_type4'] ?? 0) + $remOld4,
                            'survey_reg' => $surveyReceived,
                            'survey_completed' => $surveyCompleted,
                            'comp_percent' => $compPercent,
                            'notes' => $savedData['notes'] ?? ''
                        ];
                    } else {
                        $intake = (int) $workData['current_received'] + $manual30 + $manual60 + $surveyReg;
                        $monthStats['depts'][$dept] = [
                            'intake' => $intake,
                            'comp30' => (int) $workData['comp30'] + $manual30,
                            'comp60' => (int) $workData['comp60'] + $manual60,
                            'pending' => (int) $workData['pending'],
                            'pending_type2' => (int) ($workData['pending_type2'] ?? 0) + $remOld2,
                            'pending_type3' => (int) ($workData['pending_type3'] ?? 0) + $remOld3,
                            'pending_type4' => (int) ($workData['pending_type4'] ?? 0) + $remOld4,
                            'survey_reg' => $surveyReg,
                            'notes' => $savedData['notes'] ?? ''
                        ];
                    }
                }
                // Inject admin dept data from sameday_completion_logs
                $adminCount = $samedayByMonthDept[$loopMonth]['admin'] ?? 0;
                $monthStats['depts']['admin'] = [
                    'intake' => $adminCount,
                    'comp30' => $adminCount,  // งานเกิดเสร็จวันเดียว = เสร็จทันที
                    'comp60' => 0,
                    'pending' => 0,
                    'pending_type2' => 0,
                    'pending_type3' => 0,
                    'pending_type4' => 0,
                    'survey_reg' => 0,
                    'notes' => ''
                ];
                $trend[] = $monthStats;
            }

            // Calculate totals for 'all'
            $totalNewPending = 0;
            foreach ($breakdown as $deptData) {
                $totalNewPending += ($deptData['current_pending'] ?? 0) + ($deptData['prev_pending'] ?? 0);
            }

            // Get Combined Saved Data for 'all' (if exists, or sum up)
            $savedAll = [];
            if ($yearMonth) {
                $stmt = $conn->prepare("SELECT * FROM monthly_kpi_reports WHERE years_month = ? AND department = 'all'");
                $stmt->execute([$yearMonth]);
                $savedAll = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            // Re-use logic for Old Work Baseline/Total (Global)
            // ... (Keep existing Old Work Logic for overall baseline if needed, or breakdown)

            // Fetch Global Old Work Data (Keep existing logic for backward compatibility or overview)
            // Count old work (received before 2026-01-01)
            $oldWorkSQL = "
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN completion_date IS NOT NULL AND completion_date != '0000-00-00' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') THEN 1 ELSE 0 END) as pending
                FROM (
                    SELECT id, received_date, completion_date FROM survey_works WHERE received_date < ?
                    UNION ALL
                    SELECT id, received_date, completion_date FROM registration_works WHERE received_date < ?
                    UNION ALL
                    SELECT id, received_date, completion_date FROM academic_works WHERE received_date < ?
                    UNION ALL
                    SELECT id, received_date, completion_date FROM administration_works WHERE received_date < ?
                ) AS old_work
            ";
            $stmt = $conn->prepare($oldWorkSQL);
            $stmt->execute([$baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE]);
            $oldWork = $stmt->fetch(PDO::FETCH_ASSOC);

            // Monthly Old Work Completed
            $monthlyOldWorkSQL = "
                SELECT 
                    DATE_FORMAT(completion_date, '%Y-%m') as month,
                    COUNT(*) as completed
                FROM (
                    SELECT completion_date FROM survey_works WHERE received_date < ? AND completion_date IS NOT NULL AND completion_date != '0000-00-00' AND completion_date >= ?
                    UNION ALL
                    SELECT completion_date FROM registration_works WHERE received_date < ? AND completion_date IS NOT NULL AND completion_date != '0000-00-00' AND completion_date >= ?
                    UNION ALL
                    SELECT completion_date FROM academic_works WHERE received_date < ? AND completion_date IS NOT NULL AND completion_date != '0000-00-00' AND completion_date >= ?
                    UNION ALL
                    SELECT completion_date FROM administration_works WHERE received_date < ? AND completion_date IS NOT NULL AND completion_date != '0000-00-00' AND completion_date >= ?
                ) AS monthly_completed
                GROUP BY DATE_FORMAT(completion_date, '%Y-%m')
                ORDER BY month ASC
            ";
            $stmt = $conn->prepare($monthlyOldWorkSQL);
            $stmt->execute([$baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE, $baselineDateCE]);
            $monthlyOldWork = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $baselineCount = $oldWork['total'];

            echo json_encode([
                'status' => 'success',
                'requested_params' => [
                    'years_month' => $yearMonth,
                    'report_type' => $reportType,
                    'startMonth' => $startMonthIdx,
                    'maxMonth' => $maxMonthIdx
                ],
                'initial_balances' => $initialBalances,
                'savedAll' => $savedAll,
                'breakdown' => $breakdown,
                'trend' => $trend,
                'autoData' => [
                    'oldWork' => [
                        'baseline' => (int) $baselineCount,
                        'total' => (int) $oldWork['total'],
                        'completed' => (int) $oldWork['completed'],
                        'pending' => (int) $oldWork['pending'],
                        'monthlyCompleted' => $monthlyOldWork
                    ],
                    'newWork' => [
                        'pending' => $totalNewPending // Use summed pending
                    ]
                ]
            ]);
            break;

        case 'POST':
        case 'PUT':
            // Save or update KPI report data
            $data = json_decode(file_get_contents('php://input'), true);

            $yearMonth = $data['years_month'] ?? null;
            $department = $data['department'] ?? 'all';

            if (!$yearMonth) {
                http_response_code(400);
                echo json_encode(['error' => 'years_month is required']);
                exit;
            }

            // Define allowable fields for mass assignment
            // Numeric fields that should ADD to existing values
            $numericFields = [
                'new_work_completed',
                'completed_within_30',
                'completed_within_60',
                'completed_over_60'
            ];

            // Fields that should REPLACE existing values
            $replaceFields = [
                'old_work_baseline',
                'new_work_received',
                'notes',
                'created_by'
            ];

            $allFields = array_merge($numericFields, $replaceFields);

            $updateFields = [];
            $insertCols = ['years_month', 'department'];
            $insertPlaceholders = ['?', '?'];
            $params = [$yearMonth, $department];

            foreach ($allFields as $field) {
                if (isset($data[$field])) {
                    $insertCols[] = $field;
                    $insertPlaceholders[] = '?';
                    $params[] = $data[$field];

                    // For all fields, replace the value
                    $updateFields[] = "$field = VALUES($field)";
                }
            }

            if (empty($updateFields)) {
                echo json_encode(['status' => 'success', 'message' => 'No fields to update']);
                exit;
            }

            $sql = "INSERT INTO monthly_kpi_reports (" . implode(', ', $insertCols) . ")
                    VALUES (" . implode(', ', $insertPlaceholders) . ")
                    ON DUPLICATE KEY UPDATE " . implode(', ', $updateFields) . ", updated_at = CURRENT_TIMESTAMP";

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);

            echo json_encode([
                'status' => 'success',
                'message' => 'บันทึกข้อมูล ABM สำเร็จ'
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
