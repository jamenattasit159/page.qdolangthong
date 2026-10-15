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
        WHEN survey_type LIKE '%ออกโฉนด%' THEN 'งานออกโฉนดที่ดินเฉพาะราย'
        WHEN survey_type LIKE '%แบ่ง%' OR survey_type LIKE '%สอบเขต%' OR survey_type LIKE '%รวมโฉนด%' THEN 'งานแบ่งแยก/สอบเขต/รวมโฉนด'
        ELSE 'งาน นสล./อื่นๆ'
    END";

    $categoryOrderCase = "CASE
        WHEN survey_type LIKE '%ออกโฉนด%' THEN 1
        WHEN survey_type LIKE '%แบ่ง%' OR survey_type LIKE '%สอบเขต%' OR survey_type LIKE '%รวมโฉนด%' THEN 2
        ELSE 3
    END";

    $statusTextExpr = "TRIM(CONCAT_WS(' ', COALESCE(status_cause, ''), COALESCE(summary, '')))";

    // --- Summary SQL ---
    $summarySql = "SELECT
        category,
        category_order,
        SUM(CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            THEN 1 ELSE 0
        END) AS completed_count,
        SUM(CASE
            WHEN received_date < {$startDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 1 ELSE 0
        END) AS carry_forward_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND (
                    (survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date > {$endDateQuoted})
                    OR {$statusTextExpr} LIKE '%ยังไม่ถึง%'
                )
            THEN 1 ELSE 0
        END) AS not_yet_survey_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted}
                AND DATEDIFF({$endDateQuoted}, survey_date) > 30
                AND {$statusTextExpr} NOT LIKE '%ตรวจ%'
                AND {$statusTextExpr} NOT LIKE '%งด%'
            THEN 1 ELSE 0
        END) AS over_30_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted}
                AND DATEDIFF({$endDateQuoted}, survey_date) <= 30
                AND {$statusTextExpr} NOT LIKE '%ตรวจ%'
                AND {$statusTextExpr} NOT LIKE '%งด%'
            THEN 1 ELSE 0
        END) AS within_30_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND {$statusTextExpr} LIKE '%ตรวจ%'
            THEN 1 ELSE 0
        END) AS inspect_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND {$statusTextExpr} LIKE '%งด%'
            THEN 1 ELSE 0
        END) AS cancel_survey_count,
        SUM(CASE
            WHEN (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
                AND (survey_date IS NULL OR survey_date = '0000-00-00' OR survey_date <= {$endDateQuoted})
                AND NOT (
                    (survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date > {$endDateQuoted})
                    OR {$statusTextExpr} LIKE '%ยังไม่ถึง%'
                )
                AND NOT (survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted} AND DATEDIFF({$endDateQuoted}, survey_date) > 30 AND {$statusTextExpr} NOT LIKE '%ตรวจ%' AND {$statusTextExpr} NOT LIKE '%งด%')
                AND NOT (survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted} AND DATEDIFF({$endDateQuoted}, survey_date) <= 30 AND {$statusTextExpr} NOT LIKE '%ตรวจ%' AND {$statusTextExpr} NOT LIKE '%งด%')
                AND {$statusTextExpr} NOT LIKE '%ตรวจ%'
                AND {$statusTextExpr} NOT LIKE '%งด%'
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
            survey_date,
            survey_type,
            progress_type,
            {$categoryCase} AS category,
            {$categoryOrderCase} AS category_order
        FROM survey_works
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

    // --- Details SQL ---
    $detailsSql = "SELECT
        id,
        received_seq,
        received_date,
        survey_type,
        applicant,
        summary,
        status_cause,
        {$statusTextExpr} AS status_text,
        completion_date,
        survey_date,
        men,
        rv_12,
        progress_type,
        {$categoryCase} AS category,
        {$categoryOrderCase} AS category_order,
        CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            THEN 'งานเสร็จ'
            WHEN received_date < {$startDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 'งานค้างยกไป'
            WHEN received_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
                AND (completion_date IS NULL OR completion_date = '0000-00-00' OR completion_date > {$endDateQuoted})
            THEN 'งานค้าง'
            ELSE 'อื่นๆ'
        END AS work_state,
        CASE
            WHEN completion_date IS NOT NULL
                AND completion_date != '0000-00-00'
                AND completion_date BETWEEN {$startDateQuoted} AND {$endDateQuoted}
            THEN 'งานเสร็จ'
            WHEN {$statusTextExpr} LIKE '%งด%'
            THEN 'งดรังวัด'
            WHEN {$statusTextExpr} LIKE '%ตรวจ%'
            THEN 'ตรวจ'
            WHEN (survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date > {$endDateQuoted})
                OR {$statusTextExpr} LIKE '%ยังไม่ถึง%'
            THEN 'ยังไม่ถึงวันนัดรังวัด'
            WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted}
                AND DATEDIFF({$endDateQuoted}, survey_date) > 30
            THEN 'เกิน 30 วัน'
            WHEN survey_date IS NOT NULL AND survey_date != '0000-00-00' AND survey_date <= {$endDateQuoted}
                AND DATEDIFF({$endDateQuoted}, survey_date) <= 30
            THEN 'ไม่เกิน 30 วัน'
            ELSE 'อื่นๆ'
        END AS status_group
    FROM survey_works
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
        'source' => 'survey_classification_stats',
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
