<?php
header('Content-Type: application/json; charset=utf-8');
include_once 'db.php';

if (php_sapi_name() === 'cli') {
    $_SERVER['REQUEST_METHOD'] = 'GET';
}

function isValidDate($date)
{
    if (!$date) {
        return false;
    }

    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

try {
    $today = new DateTime();
    $defaultStart = $today->format('Y-m-01');
    $defaultEnd = $today->format('Y-m-t');

    $startDate = $_GET['start_date'] ?? $defaultStart;
    $endDate = $_GET['end_date'] ?? $defaultEnd;

    if (!isValidDate($startDate) || !isValidDate($endDate)) {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'รูปแบบวันที่ไม่ถูกต้อง กรุณาใช้ YYYY-MM-DD'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($startDate > $endDate) {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $startDateQuoted = $conn->quote($startDate);
    $endDateQuoted = $conn->quote($endDate);

    $categoryCase = "CASE
        WHEN subject LIKE '%ออกโฉนด%' THEN 'งานออกโฉนดที่ดินเฉพาะราย (ไม่รวมงาน ส.ค.๑ ตามข้อ ๑.๔)'
        WHEN subject LIKE '%สอบเขต%' OR subject LIKE '%แบ่ง%' OR subject LIKE '%รวมโฉนด%' THEN 'งานแบ่งแยก/ สอบเขต/รวมโฉนด'
        WHEN subject LIKE '%มรดก%' OR summary LIKE '%มรดก%' THEN 'งานมรดก'
        WHEN subject LIKE '%ใบแทน%' OR summary LIKE '%ใบแทน%' THEN 'งานใบแทน'
        ELSE 'งานจดทะเบียนสิทธิและนิติกรรมอื่นๆ (ที่ต้องดำเนินการประกาศ) เช่น ขาย/จำนอง/ให้เช่า/งานโรงเรือน ฯลฯ เป็นต้น'
    END";

    $categoryOrderCase = "CASE
        WHEN subject LIKE '%ออกโฉนด%' THEN 1
        WHEN subject LIKE '%สอบเขต%' OR subject LIKE '%แบ่ง%' OR subject LIKE '%รวมโฉนด%' THEN 2
        WHEN subject LIKE '%มรดก%' OR summary LIKE '%มรดก%' THEN 3
        WHEN subject LIKE '%ใบแทน%' OR summary LIKE '%ใบแทน%' THEN 4
        ELSE 5
    END";

    $statusTextExpr = "TRIM(CONCAT_WS(' ', COALESCE(status_cause, ''), COALESCE(summary, '')))";
    $announceExpr = "({$statusTextExpr} LIKE '%ระหว่างประกาศ%' OR {$statusTextExpr} LIKE '%ประกาศ%')";

    $summarySql = "SELECT
        category,
        category_order,
        SUM(CASE
            WHEN received_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 1 ELSE 0
        END) AS pending_count,
        SUM(CASE
            WHEN received_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
                AND completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date <= {$endDateQuoted}
            THEN 1 ELSE 0
        END) AS completed_count,
        SUM(CASE
            WHEN received_date <= {$endDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 1 ELSE 0
        END) AS carry_forward_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND {$announceExpr}
            THEN 1 ELSE 0
        END) AS announce_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND (
                    {$statusTextExpr} LIKE '%แจ้งครั้งที่ 1%'
                    OR {$statusTextExpr} LIKE '%แจ้งครั้งที่1%'
                    OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่ 1%'
                    OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่1%'
                )
            THEN 1 ELSE 0
        END) AS notice_1_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND (
                    {$statusTextExpr} LIKE '%แจ้งครั้งที่ 2%'
                    OR {$statusTextExpr} LIKE '%แจ้งครั้งที่2%'
                    OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่ 2%'
                    OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่2%'
                )
            THEN 1 ELSE 0
        END) AS notice_2_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND {$statusTextExpr} LIKE '%แจ้งสิทธิ%'
            THEN 1 ELSE 0
        END) AS rights_notice_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND {$statusTextExpr} LIKE '%อุทธรณ์%'
            THEN 1 ELSE 0
        END) AS appeal_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND (progress_type = 3 OR {$statusTextExpr} LIKE '%ศาล%')
            THEN 1 ELSE 0
        END) AS court_count,
        SUM(CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date <= {$endDateQuoted}
            THEN 0
            WHEN {$statusTextExpr} = ''
                OR (
                    {$statusTextExpr} NOT LIKE '%ระหว่างประกาศ%'
                    AND {$statusTextExpr} NOT LIKE '%ประกาศ%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งครั้งที่ 1%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งครั้งที่1%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งเตือนครั้งที่ 1%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งเตือนครั้งที่1%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งครั้งที่ 2%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งครั้งที่2%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งเตือนครั้งที่ 2%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งเตือนครั้งที่2%'
                    AND {$statusTextExpr} NOT LIKE '%แจ้งสิทธิ%'
                    AND {$statusTextExpr} NOT LIKE '%อุทธรณ์%'
                    AND {$statusTextExpr} NOT LIKE '%ศาล%'
                    AND progress_type != 3
                )
            THEN 1 ELSE 0
        END) AS other_count,
        COUNT(*) AS total_rows
    FROM (
        SELECT
            id,
            received_date,
            completion_date,
            status_cause,
            summary,
            progress_type,
            {$categoryCase} AS category,
            {$categoryOrderCase} AS category_order
        FROM registration_works
        WHERE
            received_date <= {$endDateQuoted}
            AND (
                received_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
                OR (
                    received_date < {$startDateQuoted}
                    AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date >= {$startDateQuoted})
                )
            )
    ) classified
    GROUP BY category, category_order
    ORDER BY category_order ASC";

    $summaryStmt = $conn->prepare($summarySql);
    $summaryStmt->execute();
    $summary = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);

    $detailsSql = "SELECT
        id,
        seq_no,
        received_date,
        subject,
        related_person,
        summary,
        status_cause,
        {$statusTextExpr} AS status_text,
        responsible_person,
        completion_date,
        progress_type,
        {$categoryCase} AS category,
        {$categoryOrderCase} AS category_order,
        CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            THEN 'งานเสร็จ'
            WHEN received_date < {$startDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date >= {$startDateQuoted})
            THEN 'งานค้าง'
            WHEN received_date <= {$endDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 'งานค้างยกไป'
            ELSE 'อื่นๆ'
        END AS work_state,
        CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            THEN 'งานเสร็จ'
            WHEN {$announceExpr}
            THEN 'อยู่ระหว่างประกาศ'
            WHEN {$statusTextExpr} LIKE '%แจ้งครั้งที่ 1%'
                OR {$statusTextExpr} LIKE '%แจ้งครั้งที่1%'
                OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่ 1%'
                OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่1%'
            THEN 'แจ้งครั้งที่ 1'
            WHEN {$statusTextExpr} LIKE '%แจ้งครั้งที่ 2%'
                OR {$statusTextExpr} LIKE '%แจ้งครั้งที่2%'
                OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่ 2%'
                OR {$statusTextExpr} LIKE '%แจ้งเตือนครั้งที่2%'
            THEN 'แจ้งครั้งที่ 2'
            WHEN {$statusTextExpr} LIKE '%แจ้งสิทธิ%'
            THEN 'แจ้งสิทธิ์'
            WHEN {$statusTextExpr} LIKE '%อุทธรณ์%'
            THEN 'อุทธรณ์'
            WHEN progress_type = 3 OR {$statusTextExpr} LIKE '%ศาล%'
            THEN 'งานศาล'
            ELSE 'อื่นๆ'
        END AS status_group
    FROM registration_works
    WHERE
        received_date <= {$endDateQuoted}
        AND (
            received_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            OR (
                received_date < {$startDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date >= {$startDateQuoted})
            )
        )
    ORDER BY category_order ASC, received_date DESC, id DESC";

    $detailsStmt = $conn->prepare($detailsSql);
    $detailsStmt->execute();
    $details = $detailsStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'summary' => $summary,
        'details' => $details,
        'meta' => [
            'start_date' => $startDate,
            'end_date' => $endDate,
            'generated_at' => date('Y-m-d H:i:s')
        ]
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    AppErrorLogger::logException($e, [
        'source' => 'registration_classification_stats',
        'start_date' => $startDate ?? null,
        'end_date' => $endDate ?? null,
    ], 'backend');
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
