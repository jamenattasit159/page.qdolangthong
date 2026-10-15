<?php
/**
 * Admin Backlog Summary API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

function monthKey(int $year, int $month): string
{
    return sprintf('%04d-%02d', $year, $month);
}

function thaiMonthShort(int $month): string
{
    $months = [
        1 => 'ม.ค.',
        2 => 'ก.พ.',
        3 => 'มี.ค.',
        4 => 'เม.ย.',
        5 => 'พ.ค.',
        6 => 'มิ.ย.',
        7 => 'ก.ค.',
        8 => 'ส.ค.',
        9 => 'ก.ย.',
        10 => 'ต.ค.',
        11 => 'พ.ย.',
        12 => 'ธ.ค.'
    ];

    return $months[$month] ?? '';
}

function toBuddhistYear(int $year): int
{
    return $year + 543;
}

function percentOf(int $numerator, int $denominator): float
{
    if ($denominator <= 0) {
        return 0.0;
    }

    return round(($numerator / $denominator) * 100, 2);
}

function zeroDateCondition(string $column): string
{
    return "($column IS NULL OR $column = '0000-00-00')";
}

function fetchMonthMap(PDO $conn, string $sql, array $params): array
{
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    $map = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $month = isset($row['month_num']) ? (int) $row['month_num'] : 0;
        $total = isset($row['total']) ? (int) $row['total'] : 0;
        if ($month >= 1 && $month <= 12) {
            $map[$month] = $total;
        }
    }

    return $map;
}

function fetchSavedMonthlyStats(PDO $conn, int $reportYear): array
{
    $sql = "
        SELECT
            years_month,
            department,
            SUM(completed_within_30) AS completed_within_30,
            SUM(completed_within_60) AS completed_within_60
        FROM monthly_kpi_reports
        WHERE years_month LIKE :year_prefix
          AND department IN ('registration', 'academic', 'survey')
        GROUP BY years_month, department
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        'year_prefix' => $reportYear . '-%'
    ]);

    $result = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $month = (int) substr((string) $row['years_month'], 5, 2);
        if ($month < 1 || $month > 12) {
            continue;
        }

        $result[$row['department']][$month] = [
            'completed_within_30' => (int) ($row['completed_within_30'] ?? 0),
            'completed_within_60' => (int) ($row['completed_within_60'] ?? 0)
        ];
    }

    return $result;
}

function fetchOldBacklogBaseline(PDO $conn, string $table, string $reportStartDate): int
{
    $sql = "
        SELECT COUNT(*) AS total
        FROM {$table}
        WHERE progress_type = 4
          AND received_date < :report_start_received
          AND (
            " . zeroDateCondition('completion_date') . "
            OR completion_date >= :report_start_completion
          )
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        'report_start_received' => $reportStartDate,
        'report_start_completion' => $reportStartDate
    ]);

    return (int) $stmt->fetchColumn();
}

function fetchOldBacklogCompletions(PDO $conn, string $table, string $reportStartDate, int $reportYear): array
{
    $sql = "
        SELECT
            MONTH(completion_date) AS month_num,
            COUNT(*) AS total
        FROM {$table}
        WHERE progress_type = 4
          AND received_date < :report_start
          AND completion_date IS NOT NULL
          AND completion_date != '0000-00-00'
          AND YEAR(completion_date) = :report_year
        GROUP BY MONTH(completion_date)
    ";

    return fetchMonthMap($conn, $sql, [
        'report_start' => $reportStartDate,
        'report_year' => $reportYear
    ]);
}

function fetchStandardDeptNewStats(PDO $conn, string $table, string $reportStartDate, int $reportYear, array $savedStats): array
{
    $receivedSql = "
        SELECT
            MONTH(received_date) AS month_num,
            COUNT(*) AS total
        FROM {$table}
        WHERE received_date >= :report_start
          AND YEAR(received_date) = :report_year
        GROUP BY MONTH(received_date)
    ";

    $comp30Sql = "
        SELECT
            MONTH(completion_date) AS month_num,
            COUNT(*) AS total
        FROM {$table}
        WHERE received_date >= :report_start
          AND completion_date IS NOT NULL
          AND completion_date != '0000-00-00'
          AND YEAR(received_date) = :received_report_year
          AND YEAR(completion_date) = :completed_report_year_same_month
          AND DATE_FORMAT(received_date, '%Y-%m') = DATE_FORMAT(completion_date, '%Y-%m')
        GROUP BY MONTH(completion_date)
    ";

    $comp60Sql = "
        SELECT
            MONTH(completion_date) AS month_num,
            COUNT(*) AS total
        FROM {$table}
        WHERE received_date >= :report_start
          AND completion_date IS NOT NULL
          AND completion_date != '0000-00-00'
          AND YEAR(received_date) = :received_report_year
          AND YEAR(completion_date) = :completed_report_year_cross_month
          AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(received_date, '%Y-%m')
        GROUP BY MONTH(completion_date)
    ";

    $rawReceived = fetchMonthMap($conn, $receivedSql, [
        'report_start' => $reportStartDate,
        'report_year' => $reportYear
    ]);

    $rawComp30 = fetchMonthMap($conn, $comp30Sql, [
        'report_start' => $reportStartDate,
        'received_report_year' => $reportYear,
        'completed_report_year_same_month' => $reportYear
    ]);

    $rawComp60 = fetchMonthMap($conn, $comp60Sql, [
        'report_start' => $reportStartDate,
        'received_report_year' => $reportYear,
        'completed_report_year_cross_month' => $reportYear
    ]);

    $received = [];
    $comp30 = [];
    $comp60 = [];

    for ($month = 1; $month <= 12; $month++) {
        $manual30 = (int) ($savedStats[$month]['completed_within_30'] ?? 0);
        $manual60 = (int) ($savedStats[$month]['completed_within_60'] ?? 0);

        $received[$month] = (int) ($rawReceived[$month] ?? 0) + $manual30 + $manual60;
        $comp30[$month] = (int) ($rawComp30[$month] ?? 0) + $manual30;
        $comp60[$month] = (int) ($rawComp60[$month] ?? 0) + $manual60;
    }

    return [
        'received' => $received,
        'completed_30' => $comp30,
        'completed_60' => $comp60
    ];
}

function fetchSurveyNewStats(PDO $conn, string $reportStartDate, int $reportYear): array
{
    $receivedSql = "
        SELECT
            MONTH(survey_date) AS month_num,
            COUNT(id) AS total
        FROM survey_works
        WHERE received_date >= :report_start
          AND survey_date IS NOT NULL
          AND survey_date != '0000-00-00'
          AND YEAR(survey_date) = :report_year
        GROUP BY MONTH(survey_date)
    ";

    $comp30Sql = "
        SELECT
            MONTH(completion_date) AS month_num,
            COUNT(*) AS total
        FROM survey_works
        WHERE received_date >= :report_start
          AND survey_date IS NOT NULL
          AND survey_date != '0000-00-00'
          AND completion_date IS NOT NULL
          AND completion_date != '0000-00-00'
          AND YEAR(completion_date) = :report_year
          AND DATE_FORMAT(survey_date, '%Y-%m') = DATE_FORMAT(completion_date, '%Y-%m')
        GROUP BY MONTH(completion_date)
    ";

    $comp60Sql = "
        SELECT
            MONTH(completion_date) AS month_num,
            COUNT(*) AS total
        FROM survey_works
        WHERE received_date >= :report_start
          AND survey_date IS NOT NULL
          AND survey_date != '0000-00-00'
          AND completion_date IS NOT NULL
          AND completion_date != '0000-00-00'
          AND YEAR(completion_date) = :report_year
          AND DATE_FORMAT(survey_date, '%Y-%m') != DATE_FORMAT(completion_date, '%Y-%m')
        GROUP BY MONTH(completion_date)
    ";

    return [
        'received' => fetchMonthMap($conn, $receivedSql, [
            'report_start' => $reportStartDate,
            'report_year' => $reportYear
        ]),
        'completed_30' => fetchMonthMap($conn, $comp30Sql, [
            'report_start' => $reportStartDate,
            'report_year' => $reportYear
        ]),
        'completed_60' => fetchMonthMap($conn, $comp60Sql, [
            'report_start' => $reportStartDate,
            'report_year' => $reportYear
        ])
    ];
}

function buildDepartmentReport(array $deptMeta, int $reportYear, int $endMonth, int $oldBaseline, array $oldCompletedMap, array $newStats): array
{
    $rows = [];
    $oldCompletedCum = 0;
    $newReceivedCum = 0;
    $newCompletedCum = 0;

    for ($month = 1; $month <= 12; $month++) {
        $isActiveMonth = $month <= $endMonth;

        $oldCompleted = $isActiveMonth ? (int) ($oldCompletedMap[$month] ?? 0) : null;
        $newReceived = $isActiveMonth ? (int) ($newStats['received'][$month] ?? 0) : null;
        $newCompleted30 = $isActiveMonth ? (int) ($newStats['completed_30'][$month] ?? 0) : null;
        $newCompleted60 = $isActiveMonth ? (int) ($newStats['completed_60'][$month] ?? 0) : null;

        if ($isActiveMonth) {
            $oldCompletedCum += (int) $oldCompleted;
            $newReceivedCum += (int) $newReceived;
            $newCompletedCum += (int) $newCompleted30 + (int) $newCompleted60;
        }

        $oldRemaining = max(0, $oldBaseline - $oldCompletedCum);
        $newRemaining = max(0, $newReceivedCum - $newCompletedCum);
        $allReceivedCum = $oldBaseline + $newReceivedCum;
        $allCompletedCum = $oldCompletedCum + $newCompletedCum;
        $allRemaining = max(0, $allReceivedCum - $allCompletedCum);

        $rows[] = [
            'month_index' => $month,
            'month_key' => monthKey($reportYear, $month),
            'month_label' => thaiMonthShort($month),
            'is_active_month' => $isActiveMonth,
            'old_completed' => $oldCompleted,
            'old_completed_cum' => $oldCompletedCum,
            'old_completed_pct' => percentOf($oldCompletedCum, $oldBaseline),
            'old_remaining' => $oldRemaining,
            'old_remaining_pct' => percentOf($oldRemaining, $oldBaseline),
            'new_received' => $newReceived,
            'new_completed_30' => $newCompleted30,
            'new_completed_60' => $newCompleted60,
            'new_received_cum' => $newReceivedCum,
            'new_completed_cum' => $newCompletedCum,
            'new_completed_pct' => percentOf($newCompletedCum, $newReceivedCum),
            'new_remaining' => $newRemaining,
            'new_remaining_pct' => percentOf($newRemaining, $newReceivedCum),
            'all_received_cum' => $allReceivedCum,
            'all_completed_cum' => $allCompletedCum,
            'all_completed_pct' => percentOf($allCompletedCum, $allReceivedCum),
            'all_remaining' => $allRemaining,
            'all_remaining_pct' => percentOf($allRemaining, $allReceivedCum)
        ];
    }

    $totals = [
        'old_completed_total' => $oldCompletedCum,
        'new_received_total' => $newReceivedCum,
        'new_completed_30_total' => array_sum(array_map('intval', array_slice($newStats['completed_30'], 0, $endMonth, true))),
        'new_completed_60_total' => array_sum(array_map('intval', array_slice($newStats['completed_60'], 0, $endMonth, true))),
        'new_completed_total' => $newCompletedCum,
        'all_received_total' => $oldBaseline + $newReceivedCum,
        'all_completed_total' => $oldCompletedCum + $newCompletedCum,
        'all_remaining_total' => max(0, ($oldBaseline + $newReceivedCum) - ($oldCompletedCum + $newCompletedCum)),
        'all_completed_pct' => percentOf($oldCompletedCum + $newCompletedCum, $oldBaseline + $newReceivedCum)
    ];

    $totals['all_remaining_pct'] = percentOf($totals['all_remaining_total'], $totals['all_received_total']);

    return [
        'key' => $deptMeta['key'],
        'label' => $deptMeta['label'],
        'short_label' => $deptMeta['short_label'],
        'table' => $deptMeta['table'],
        'accent' => $deptMeta['accent'],
        'old_baseline' => $oldBaseline,
        'rows' => $rows,
        'totals' => $totals
    ];
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $currentYear = (int) date('Y');
    $currentMonth = (int) date('n');

    $reportYear = isset($_GET['report_year']) ? (int) $_GET['report_year'] : $currentYear;
    if ($reportYear < 2026) {
        $reportYear = 2026;
    }
    if ($reportYear > ($currentYear + 1)) {
        $reportYear = $currentYear + 1;
    }

    $defaultEndMonth = $reportYear < $currentYear ? 12 : $currentMonth;
    $endMonth = isset($_GET['end_month']) ? (int) $_GET['end_month'] : $defaultEndMonth;
    if ($endMonth < 1) {
        $endMonth = 1;
    }
    if ($endMonth > 12) {
        $endMonth = 12;
    }

    $reportStartDate = sprintf('%04d-01-01', $reportYear);
    $baselineDate = date('Y-m-d', strtotime($reportStartDate . ' -1 day'));
    $selectedEndDate = date('Y-m-t', strtotime(sprintf('%04d-%02d-01', $reportYear, $endMonth)));

    $departments = [
        [
            'key' => 'registration',
            'label' => 'สำนักงานที่ดินจังหวัดอ่างทอง ฝ่ายทะเบียน',
            'short_label' => 'ฝ่ายทะเบียน',
            'table' => 'registration_works',
            'accent' => 'amber'
        ],
        [
            'key' => 'survey',
            'label' => 'สำนักงานที่ดินจังหวัดอ่างทอง ฝ่ายรังวัด',
            'short_label' => 'ฝ่ายรังวัด',
            'table' => 'survey_works',
            'accent' => 'sky'
        ],
        [
            'key' => 'academic',
            'label' => 'สำนักงานที่ดินจังหวัดอ่างทอง กลุ่มงานวิชาการที่ดิน',
            'short_label' => 'กลุ่มงานวิชาการที่ดิน',
            'table' => 'academic_works',
            'accent' => 'rose'
        ]
    ];

    $baselineOverrides = [
        2026 => [
            'survey' => 545,
            'academic' => 69
        ]
    ];

    $savedStats = fetchSavedMonthlyStats($conn, $reportYear);

    $departmentReports = [];
    $summary = [
        'old_baseline_total' => 0,
        'old_completed_total' => 0,
        'new_received_total' => 0,
        'new_completed_total' => 0,
        'all_received_total' => 0,
        'all_completed_total' => 0,
        'all_remaining_total' => 0
    ];

    foreach ($departments as $deptMeta) {
        $deptKey = $deptMeta['key'];
        $table = $deptMeta['table'];

        $oldBaseline = fetchOldBacklogBaseline($conn, $table, $reportStartDate);
        if (isset($baselineOverrides[$reportYear][$deptKey])) {
            $oldBaseline = (int) $baselineOverrides[$reportYear][$deptKey];
        }

        $oldCompletedMap = fetchOldBacklogCompletions($conn, $table, $reportStartDate, $reportYear);

        if ($deptKey === 'survey') {
            $newStats = fetchSurveyNewStats($conn, $reportStartDate, $reportYear);
        } else {
            $newStats = fetchStandardDeptNewStats(
                $conn,
                $table,
                $reportStartDate,
                $reportYear,
                $savedStats[$deptKey] ?? []
            );
        }

        $report = buildDepartmentReport(
            $deptMeta,
            $reportYear,
            $endMonth,
            $oldBaseline,
            $oldCompletedMap,
            $newStats
        );

        $departmentReports[] = $report;

        $summary['old_baseline_total'] += $report['old_baseline'];
        $summary['old_completed_total'] += $report['totals']['old_completed_total'];
        $summary['new_received_total'] += $report['totals']['new_received_total'];
        $summary['new_completed_total'] += $report['totals']['new_completed_total'];
        $summary['all_received_total'] += $report['totals']['all_received_total'];
        $summary['all_completed_total'] += $report['totals']['all_completed_total'];
        $summary['all_remaining_total'] += $report['totals']['all_remaining_total'];
    }

    $summary['all_completed_pct'] = percentOf(
        $summary['all_completed_total'],
        $summary['all_received_total']
    );
    $summary['all_remaining_pct'] = percentOf(
        $summary['all_remaining_total'],
        $summary['all_received_total']
    );

    echo json_encode([
        'status' => 'success',
        'meta' => [
            'report_year' => $reportYear,
            'report_year_be' => toBuddhistYear($reportYear),
            'end_month' => $endMonth,
            'baseline_date' => $baselineDate,
            'baseline_label' => 'ยอดยกมา ณ ' . date('d/m/Y', strtotime($baselineDate)),
            'selected_end_date' => $selectedEndDate,
            'generated_at' => date('Y-m-d H:i:s')
        ],
        'summary' => $summary,
        'departments' => $departmentReports
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
