<?php
header('Content-Type: application/json; charset=utf-8');
include_once 'db.php';

try {
    $months = [];
    for ($i = 5; $i >= 0; $i--) {
        $months[] = date('Y-m', strtotime("-$i months"));
    }

    $trendData = [];
    $tableMap = [
        'survey' => 'survey_works',
        'registration' => 'registration_works',
        'academic' => 'academic_works'
    ];

    $deptFilter = isset($_GET['dept']) ? $_GET['dept'] : 'all';

    foreach ($months as $month) {
        $monthLabel = date('M Y', strtotime($month . '-01'));
        $data = [
            'month' => $monthLabel,
            'total' => 0,
            'completed' => 0,
            'pending' => 0
        ];

        foreach ($tableMap as $key => $table) {
            if ($deptFilter !== 'all' && $deptFilter !== $key) {
                continue;
            }

            $sql = "SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN (completion_date IS NOT NULL AND completion_date != '0000-00-00') AND LEFT(completion_date, 7) = :month1 THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') AND LEFT(received_date, 7) <= :month2 THEN 1 ELSE 0 END) as pending
                    FROM $table 
                    WHERE LEFT(received_date, 7) <= :month3";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                'month1' => $month,
                'month2' => $month,
                'month3' => $month
            ]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            $data['total'] += (int) $row['total'];
            $data['completed'] += (int) $row['completed'];
            $data['pending'] += (int) $row['pending'];
        }
        $trendData[] = $data;
    }

    echo json_encode($trendData);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>