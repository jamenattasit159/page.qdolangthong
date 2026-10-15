<?php
/**
 * ABM Details API
 * แสดงรายการงานตามเงื่อนไข ABM (Drill-down)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

include_once 'db.php';

// Enable emulated prepares so named params can be reused in the same query
$conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

try {
    $department = $_GET['department'] ?? null;
    $yearMonth = $_GET['year_month'] ?? null; // Format: YYYY-MM
    $type = $_GET['type'] ?? 'pending';

    if (!$department || !$yearMonth) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required parameters']);
        exit;
    }

    $tableMap = [
        'survey' => 'survey_works',
        'registration' => 'registration_works',
        'academic' => 'academic_works',
        'admin' => 'administration_works'
    ];

    if (!isset($tableMap[$department])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid department']);
        exit;
    }

    $table = $tableMap[$department];

    // Column mapping based on table
    $applicantCol = 'related_person';
    $workNameCol = 'subject';
    $seqCol = 'seq_no';

    if ($department === 'survey') {
        $applicantCol = 'applicant';
        $workNameCol = 'survey_type';
        $seqCol = 'id'; // survey_works doesn't have seq_no, use id instead
    }

    // Calculate end of the selected month
    $endDate = date('Y-m-t', strtotime($yearMonth . '-01'));
    // งานใหม่ = received_date >= 2026-01-01 (เริ่มนับใหม่ตั้งแต่ปีงบ 69)
    $startDate = '2026-01-01';

    $sql = "";
    if ($type === 'pending') {
        if ($department === 'survey') {
            // ฝ่ายรังวัด: งานค้างสะสมทั้งหมด ณ สิ้นเดือนที่เลือก
            // = งานที่นับเป็น Intake (survey_date ตั้งแต่ต้นปี 69 ถึงสิ้นเดือนนั้น) ที่ยังไม่เสร็จ ณ สิ้นเดือนนั้น
            $sql = "SELECT id, received_date, survey_date, $applicantCol AS applicant_name, $workNameCol AS work_name, status_cause, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE survey_date >= '2026-01-01'
                    AND survey_date <= :end_date
                    AND (
                        status_cause LIKE '%นัดรังวัด%' 
                        OR (completion_date IS NOT NULL AND completion_date != '0000-00-00')
                    )
                    AND (
                        completion_date IS NULL 
                        OR completion_date = '0000-00-00' 
                        OR completion_date > :end_date2
                    )
                    ORDER BY survey_date DESC";
        } else {
            // ฝ่ายทะเบียน/วิชาการ: ค้างสะสม = รับเข้าระบบตั้งแต่ต้นปี จนถึงสิ้นเดือนนี้
            // หักออกเฉพาะงานที่เสร็จใน 30 วัน (เดือนรับ) และ 60 วัน (เดือนถัดมา)
            $sql = "SELECT id, received_date, $applicantCol AS applicant_name, $workNameCol AS work_name, status_cause, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE received_date >= :start_date
                    AND received_date <= :end_date
                    AND NOT (
                        -- งานที่เสร็จแบบ 30 วัน (เดือนเดียวกับที่รับ)
                        completion_date IS NOT NULL 
                        AND completion_date != '0000-00-00'
                        AND DATE_FORMAT(completion_date, '%Y-%m') = DATE_FORMAT(received_date, '%Y-%m')
                        AND completion_date <= :end_date2
                    )
                    AND NOT (
                        -- งานที่เสร็จแบบ 60 วัน (งานค้างยกมาแล้วเสร็จข้ามเดือน)
                        completion_date IS NOT NULL 
                        AND completion_date != '0000-00-00'
                        AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(received_date, '%Y-%m')
                        AND completion_date <= :end_date2
                    )
                    ORDER BY received_date DESC";
        }
    } else if ($type === 'comp30') {
        if ($department === 'survey') {
            // งานปี 69 (received_date >= 2026-01-01) ที่เสร็จในเดือนนี้
            $sql = "SELECT id, received_date, survey_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE received_date >= :new_work_start 
                    AND completion_date BETWEEN :start_day_month AND :end_date
                    AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
                    ORDER BY completion_date DESC";
            $params = [
                'new_work_start' => '2026-01-01',
                'start_day_month' => $yearMonth . '-01',
                'end_date' => $endDate
            ];
        } else {
            $sql = "SELECT id, received_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE received_date BETWEEN :start_day_month AND :end_date
                    AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
                    AND DATEDIFF(completion_date, received_date) <= 30
                    ORDER BY received_date DESC";
            $startDayMonth = $yearMonth . '-01';
            $params = ['start_day_month' => $startDayMonth, 'end_date' => $endDate];
        }
    } else if ($type === 'comp60') {
        if ($department === 'survey') {
            $sql = "SELECT id, received_date, survey_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE survey_date >= :start_date
                    AND DATE_FORMAT(completion_date, '%Y-%m') = :comp_month
                    AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
                    AND survey_date IS NOT NULL AND survey_date != '0000-00-00'
                    AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(survey_date, '%Y-%m')
                    ORDER BY completion_date DESC, survey_date DESC";
        } else {
            $sql = "SELECT id, received_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE received_date >= :start_date
                    AND DATE_FORMAT(completion_date, '%Y-%m') = :comp_month
                    AND completion_date IS NOT NULL AND completion_date != '0000-00-00'
                    AND DATE_FORMAT(completion_date, '%Y-%m') > DATE_FORMAT(received_date, '%Y-%m')
                    ORDER BY completion_date DESC, received_date DESC";
        }
        $params = [
            'start_date' => $startDate,
            'comp_month' => $yearMonth
        ];
    } else if ($type === 'all') {
        if ($department === 'survey') {
            $sql = "SELECT id, received_date, survey_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE survey_date BETWEEN :start_date AND :end_date
                    ORDER BY survey_date DESC";
            $params = []; // Handled below
        } else {
            $sql = "SELECT id, received_date, $applicantCol AS applicant_name, $workNameCol AS work_name, completion_date, progress_type, $seqCol AS seq_no 
                    FROM $table 
                    WHERE received_date BETWEEN :start_day_month AND :end_date
                    ORDER BY received_date DESC";
            $startDayMonth = $yearMonth . '-01';
            $params = ['start_day_month' => $startDayMonth, 'end_date' => $endDate];
        }
    }

    if (!$sql) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid type']);
        exit;
    }

    $stmt = $conn->prepare($sql);
    if ($department === 'survey') {
        // Special parameters for Survey
        if ($type === 'pending') {
            $stmt->execute(['end_date' => $endDate, 'end_date2' => $endDate]);
        } else if ($type === 'comp30') {
            // comp30 uses default params defined above
            $stmt->execute($params);
        } else if ($type === 'comp60') {
            $stmt->execute($params);
        } else {
            // all
            $stmt->execute(['start_date' => $yearMonth . '-01', 'end_date' => $endDate]);
        }
    } else {
        // Standard parameters for others
        if ($type === 'pending') {
            $stmt->execute([
                'start_date' => $startDate,
                'end_date' => $endDate,
                'end_date2' => $endDate
            ]);
        } else {
            $stmt->execute($params);
        }
    }

    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'count' => count($results),
        'data' => $results,
        'meta' => [
            'department' => $department,
            'year_month' => $yearMonth,
            'type' => $type,
            'start_date' => ($type === 'pending' ? $startDate : $startDayMonth),
            'end_date' => $endDate
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
