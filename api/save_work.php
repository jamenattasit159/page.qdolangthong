<?php
include_once 'db.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
    exit;
}

$type = $_POST['type'] ?? '';
$isCompleted = isset($_POST['is_completed']) && $_POST['is_completed'] === '1';

// Lockdown Check Logic
require_once 'utils/lockdown.php';

// Validate completion date if is_completed is set
if ($isCompleted) {
    $completionDate = $_POST['received_date'] ?? date('Y-m-d');
    if (isLockdownActive($completionDate, $type)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'ระบบล็อคการบันทึกงานย้อนหลังเดือนก่อนหน้าแล้ว (เลยกำหนดแจ้งงานประจำเดือนทุกวันที่ 5)']);
        exit;
    }
}

// Debug log
file_put_contents('save_debug.txt', date('[Y-m-d H:i:s] ') . "POST: " . json_encode($_POST) . "\n", FILE_APPEND);

try {
    if ($type === 'survey') {
        // Survey Work
        // Auto-increment logic
        $year = date('Y') + 543; // Thai Year
        $currentDate = $_POST['received_date'] ?? date('Y-m-d');

        // Find Max ID to increment
        $maxSql = "SELECT MAX(CAST(received_seq AS UNSIGNED)) as max_seq FROM survey_works";
        $maxStmt = $conn->prepare($maxSql);
        $maxStmt->execute();
        $row = $maxStmt->fetch(PDO::FETCH_ASSOC);
        $nextSeq = ($row['max_seq'] ?? 0) + 1;

        // ถ้าเป็นงานเสร็จ ให้ใส่ completion_date และ progress_type
        if ($isCompleted) {
            $sql = "INSERT INTO survey_works 
                    (received_seq, received_date, rv_12, survey_type, applicant, men, status_cause, completion_date, progress_type, survey_date, created_at, updated_at) 
                    VALUES 
                    (:received_seq, :received_date, :rv_12, :survey_type, :applicant, :men, :status_cause, :completion_date, :progress_type, :survey_date, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':received_seq' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':rv_12' => $_POST['rv_12'] ?? $_POST['rw12_no'] ?? '',
                ':survey_type' => $_POST['survey_type'] ?? '',
                ':applicant' => $_POST['applicant'],
                ':men' => $_POST['men'] ?? '',
                ':status_cause' => 'เสร็จสิ้น',
                ':completion_date' => $_POST['received_date'], // ใช้วันที่รับเรื่องเป็นวันเสร็จ
                ':progress_type' => $_POST['progress_type'] ?? 1, // ประเภทงานที่เลือกมา (ปกติ/สุดขั้นตอน/ศาล)
                ':survey_date' => !empty($_POST['survey_date']) ? $_POST['survey_date'] : null
            ]);
        } else {
            $sql = "INSERT INTO survey_works 
                    (received_seq, received_date, rv_12, survey_type, applicant, men, status_cause, progress_type, survey_date, created_at, updated_at) 
                    VALUES 
                    (:received_seq, :received_date, :rv_12, :survey_type, :applicant, :men, :status_cause, :progress_type, :survey_date, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':received_seq' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':rv_12' => $_POST['rv_12'] ?? $_POST['rw12_no'] ?? '',
                ':survey_type' => $_POST['survey_type'] ?? '',
                ':applicant' => $_POST['applicant'],
                ':men' => $_POST['men'] ?? '',
                ':status_cause' => $_POST['status'] ?? $_POST['status_cause'] ?? 'pending',
                ':progress_type' => $_POST['progress_type'] ?? null, // ส่งค่าประเภทงานมาด้วย (ถ้ามี)
                ':survey_date' => !empty($_POST['survey_date']) ? $_POST['survey_date'] : null
            ]);
        }

    } elseif ($type === 'registration') {
        // Registration Work

        // Auto-increment
        $maxSql = "SELECT MAX(CAST(seq_no AS UNSIGNED)) as max_seq FROM registration_works";
        $maxStmt = $conn->prepare($maxSql);
        $maxStmt->execute();
        $row = $maxStmt->fetch(PDO::FETCH_ASSOC);
        $nextSeq = ($row['max_seq'] ?? 0) + 1;

        if ($isCompleted) {
            $sql = "INSERT INTO registration_works 
                    (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, completion_date, progress_type, created_at, updated_at) 
                    VALUES 
                    (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :completion_date, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => 'เสร็จสิ้น',
                ':completion_date' => $_POST['received_date'], // ใช้วันที่รับเรื่องเป็นวันเสร็จ
                ':progress_type' => $_POST['progress_type'] ?? 1 // ประเภทงานที่เลือกมา (ปกติ/สุดขั้นตอน/ศาล)
            ]);
        } else {
            $sql = "INSERT INTO registration_works 
                    (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, progress_type, created_at, updated_at) 
                    VALUES 
                    (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => $_POST['status_cause'] ?? 'pending',
                ':progress_type' => $_POST['progress_type'] ?? null
            ]);
        }

    } elseif ($type === 'academic') {
        // Academic Work
        // Auto-increment
        $maxSql = "SELECT MAX(CAST(seq_no AS UNSIGNED)) as max_seq FROM academic_works";
        $maxStmt = $conn->prepare($maxSql);
        $maxStmt->execute();
        $row = $maxStmt->fetch(PDO::FETCH_ASSOC);
        $nextSeq = ($row['max_seq'] ?? 0) + 1;

        if ($isCompleted) {
            $sql = "INSERT INTO academic_works 
                (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, completion_date, progress_type, created_at, updated_at) 
                VALUES 
                (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :completion_date, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => 'เสร็จสิ้น',
                ':completion_date' => $_POST['received_date'], // ใช้วันที่รับเรื่องเป็นวันเสร็จ
                ':progress_type' => $_POST['progress_type'] ?? 1 // ประเภทงานที่เลือกมา (ปกติ/สุดขั้นตอน/ศาล)
            ]);
        } else {
            $sql = "INSERT INTO academic_works 
                (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, progress_type, created_at, updated_at) 
                VALUES 
                (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => $_POST['status_cause'] ?? 'pending',
                ':progress_type' => $_POST['progress_type'] ?? null
            ]);
        }

    } elseif ($type === 'admin') {
        // Admin Work
        // Auto-increment
        $maxSql = "SELECT MAX(CAST(seq_no AS UNSIGNED)) as max_seq FROM administration_works";
        $maxStmt = $conn->prepare($maxSql);
        $maxStmt->execute();
        $row = $maxStmt->fetch(PDO::FETCH_ASSOC);
        $nextSeq = ($row['max_seq'] ?? 0) + 1;

        if ($isCompleted) {
            $sql = "INSERT INTO administration_works 
                (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, completion_date, progress_type, created_at, updated_at) 
                VALUES 
                (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :completion_date, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => 'เสร็จสิ้น',
                ':completion_date' => $_POST['received_date'],
                ':progress_type' => $_POST['progress_type'] ?? 1
            ]);
        } else {
            $sql = "INSERT INTO administration_works 
                (seq_no, received_date, subject, related_person, summary, responsible_person, status_cause, progress_type, created_at, updated_at) 
                VALUES 
                (:seq_no, :received_date, :subject, :related_person, :summary, :responsible_person, :status_cause, :progress_type, NOW(), NOW())";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $nextSeq,
                ':received_date' => $_POST['received_date'],
                ':subject' => $_POST['subject'],
                ':related_person' => $_POST['related_person'] ?? '',
                ':summary' => $_POST['summary'] ?? '',
                ':responsible_person' => $_POST['responsible_person'] ?? '',
                ':status_cause' => $_POST['status_cause'] ?? 'pending',
                ':progress_type' => $_POST['progress_type'] ?? null
            ]);
        }

    } else {
        throw new Exception("Invalid work type: $type");
    }

    // --- Logging ---
    require_once 'utils/logger.php';
    $userName = $_POST['user_name'] ?? 'System';
    $details = "เพิ่มงานใหม่: " . ($_POST['applicant'] ?? $_POST['subject'] ?? 'N/A');
    Logger::log($userName, 'ADD', $type, $nextSeq, $details);
    // ---------------

    @unlink(__DIR__ . '/cache/stats_cache.json');
    echo json_encode(['status' => 'success']);

} catch (PDOException $e) {
    file_put_contents('save_debug.txt', date('[Y-m-d H:i:s] ') . "DB Error: " . $e->getMessage() . "\n", FILE_APPEND);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database Error: ' . $e->getMessage()]);
} catch (Exception $e) {
    file_put_contents('save_debug.txt', date('[Y-m-d H:i:s] ') . "Error: " . $e->getMessage() . "\n", FILE_APPEND);
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>