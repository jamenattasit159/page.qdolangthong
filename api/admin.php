<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

include_once 'db.php';
require_once 'utils/logger.php';
require_once 'utils/lockdown.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            $stmt = $conn->prepare("SELECT * FROM administration_works ORDER BY received_date DESC, seq_no DESC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"));
            $sql = "INSERT INTO administration_works (
                    seq_no, received_date, subject, related_person, summary,
                    status_cause, responsible_person, completion_date, progress_type,
                    created_at, updated_at
                ) VALUES (
                    :seq_no, :received_date, :subject, :related_person, :summary,
                    :status_cause, :responsible_person, :completion_date, :progress_type,
                    NOW(), NOW()
                )";

            $stmt = $conn->prepare($sql);
            $stmt->execute([
                ':seq_no' => $data->seq_no ?? null,
                ':received_date' => $data->received_date ?? null,
                ':subject' => $data->subject ?? null,
                ':related_person' => $data->related_person ?? null,
                ':summary' => $data->summary ?? null,
                ':status_cause' => $data->status_cause ?? null,
                ':responsible_person' => $data->responsible_person ?? null,
                ':completion_date' => !empty($data->completion_date) ? $data->completion_date : null,
                ':progress_type' => $data->progress_type ?? null
            ]);

            @unlink(__DIR__ . '/cache/stats_cache.json');
            Logger::log($data->user_name ?? 'System', 'ADD', 'admin', $conn->lastInsertId(), $data->subject ?? null);
            echo json_encode(["status" => "success", "id" => $conn->lastInsertId()], JSON_UNESCAPED_UNICODE);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"));
            if (empty($data->id)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID missing"]);
                break;
            }

            if (!empty($data->completion_date) && isLockdownActive($data->completion_date, 'admin')) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "System is locked for previous-month completion dates"]);
                break;
            }

            if (isset($data->subject)) {
                $sql = "UPDATE administration_works SET
                        seq_no = :seq_no,
                        received_date = :received_date,
                        subject = :subject,
                        related_person = :related_person,
                        summary = :summary,
                        status_cause = :status_cause,
                        responsible_person = :responsible_person,
                        completion_date = :completion_date,
                        progress_type = :progress_type,
                        updated_at = NOW()
                    WHERE id = :id";

                $stmt = $conn->prepare($sql);
                $stmt->execute([
                    ':seq_no' => $data->seq_no ?? null,
                    ':received_date' => $data->received_date ?? null,
                    ':subject' => $data->subject ?? null,
                    ':related_person' => $data->related_person ?? null,
                    ':summary' => $data->summary ?? null,
                    ':status_cause' => $data->status_cause ?? null,
                    ':responsible_person' => $data->responsible_person ?? null,
                    ':completion_date' => !empty($data->completion_date) ? $data->completion_date : null,
                    ':progress_type' => $data->progress_type ?? null,
                    ':id' => $data->id
                ]);
            } elseif (isset($data->progress_type)) {
                $pType = (int) $data->progress_type;
                if (in_array($pType, [2, 3])) {
                    $stmtRec = $conn->prepare("SELECT received_date FROM administration_works WHERE id = ?");
                    $stmtRec->execute([$data->id]);
                    $recDate = $stmtRec->fetchColumn();

                    if (empty($recDate) || $recDate === '0000-00-00' || $recDate < '2026-01-01') {
                        http_response_code(403);
                        echo json_encode(["status" => "error", "message" => "งานที่รับเรื่องก่อนวันที่ 1 มกราคม 2569 ไม่สามารถปรับเป็นงานสุดขั้นตอนหรืองานศาลได้"]);
                        exit;
                    }
                }
                $stmt = $conn->prepare("UPDATE administration_works SET progress_type = :progress_type, updated_at = NOW() WHERE id = :id");
                $stmt->execute([
                    ':progress_type' => (int) $data->progress_type,
                    ':id' => $data->id
                ]);
            } else {
                $stmt = $conn->prepare("UPDATE administration_works SET status_cause = :status_cause, completion_date = :completion_date, updated_at = NOW() WHERE id = :id");
                $stmt->execute([
                    ':status_cause' => $data->status_cause ?? null,
                    ':completion_date' => !empty($data->completion_date) ? $data->completion_date : null,
                    ':id' => $data->id
                ]);
            }

            @unlink(__DIR__ . '/cache/stats_cache.json');
            Logger::log($data->user_name ?? 'System', 'UPDATE', 'admin', $data->id, $data->subject ?? $data->status_cause ?? null);
            echo json_encode(["status" => "success"], JSON_UNESCAPED_UNICODE);
            break;

        case 'DELETE':
            $data = json_decode(file_get_contents("php://input"));
            if (empty($data->id)) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID missing"]);
                break;
            }

            $stmt = $conn->prepare("DELETE FROM administration_works WHERE id = :id");
            $stmt->execute([':id' => $data->id]);
            @unlink(__DIR__ . '/cache/stats_cache.json');
            Logger::log($data->user_name ?? 'System', 'DELETE', 'admin', $data->id, null);
            echo json_encode(["status" => "success"], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(["status" => "error", "message" => "Method not allowed"]);
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
}
?>
