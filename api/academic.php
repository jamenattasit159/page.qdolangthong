<?php
include_once 'db.php';
require_once 'utils/logger.php';
require_once 'utils/lockdown.php';
require_once __DIR__ . '/utils/progress_assign.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        try {
            $sql = "SELECT * FROM academic_works ORDER BY received_date DESC, seq_no DESC";
            $stmt = $conn->prepare($sql);
            $stmt->execute();
            $works = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($works);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
        }
        break;

    case 'POST':
        try {
            $data = json_decode(file_get_contents("php://input"));

            $sql = "INSERT INTO academic_works (
                seq_no, received_date, subject, related_person, 
                summary, status_cause, responsible_person, completion_date
            ) VALUES (
                :seq_no, :received_date, :subject, :related_person, 
                :summary, :status_cause, :responsible_person, :completion_date
            )";

            $stmt = $conn->prepare($sql);

            $stmt->bindParam(':seq_no', $data->seq_no);
            $stmt->bindParam(':received_date', $data->received_date);
            $stmt->bindParam(':subject', $data->subject);
            $stmt->bindParam(':related_person', $data->related_person);
            $stmt->bindParam(':summary', $data->summary);
            $stmt->bindParam(':status_cause', $data->status_cause);
            $stmt->bindParam(':responsible_person', $data->responsible_person);
            $stmt->bindParam(':completion_date', $data->completion_date);

            if ($stmt->execute()) {
                @unlink(__DIR__ . '/cache/stats_cache.json');
                logAction('ADD', $data);
                echo json_encode(["status" => "success", "id" => $conn->lastInsertId()]);
            } else {
                http_response_code(503);
                echo json_encode(["status" => "error", "message" => "Unable to create academic work."]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        try {
            $data = json_decode(file_get_contents("php://input"));

            if (!empty($data->id)) {
                if (!empty($data->completion_date) && isLockdownActive($data->completion_date, 'academic')) {
                    http_response_code(403);
                    echo json_encode(["status" => "error", "message" => "ระบบล็อคการบันทึกงานย้อนหลังเดือนก่อนหน้าแล้ว"]);
                    exit;
                }

                if (isset($data->subject)) {
                    $sql = "UPDATE academic_works SET 
                            seq_no = :seq_no,
                            received_date = :received_date,
                            subject = :subject,
                            related_person = :related_person,
                            summary = :summary,
                            status_cause = :status_cause,
                            responsible_person = :responsible_person,
                            completion_date = :completion_date
                            WHERE id = :id";

                    $stmt = $conn->prepare($sql);
                    $stmt->bindValue(':seq_no', $data->seq_no ?? null);
                    $stmt->bindValue(':received_date', $data->received_date ?? null);
                    $stmt->bindValue(':subject', $data->subject ?? null);
                    $stmt->bindValue(':related_person', $data->related_person ?? null);
                    $stmt->bindValue(':summary', $data->summary ?? null);
                    $stmt->bindValue(':status_cause', $data->status_cause ?? null);
                    $stmt->bindValue(':responsible_person', $data->responsible_person ?? null);
                    $stmt->bindValue(':completion_date', (!empty($data->completion_date)) ? $data->completion_date : null);
                    $stmt->bindValue(':id', $data->id);
                } else if (isset($data->progress_type)) {
                    $pType = (int) $data->progress_type;
                    if (in_array($pType, [2, 3])) {
                        $stmtRec = $conn->prepare("SELECT received_date FROM academic_works WHERE id = ?");
                        $stmtRec->execute([$data->id]);
                        $recDate = $stmtRec->fetchColumn();

                        if (empty($recDate) || $recDate === '0000-00-00' || $recDate < '2026-01-01') {
                            http_response_code(403);
                            echo json_encode(["status" => "error", "message" => "งานที่รับเรื่องก่อนวันที่ 1 มกราคม 2569 ไม่สามารถปรับเป็นงานสุดขั้นตอนหรืองานศาลได้"]);
                            exit;
                        }

                        if (!isProgressTypeAssignmentAllowed($conn, 'academic')) {
                            http_response_code(403);
                            echo json_encode(["status" => "error", "message" => "ไม่สามารถเปลี่ยนเป็นงานสุดขั้นตอนหรืองานศาลได้ (สามารถลดออกได้เท่านั้น)"]);
                            exit;
                        }
                    }
                    $sql = "UPDATE academic_works SET progress_type = :progress_type WHERE id = :id";
                    $stmt = $conn->prepare($sql);
                    $stmt->bindValue(':progress_type', $pType, PDO::PARAM_INT);
                    $stmt->bindValue(':id', $data->id);
                } else {
                    $sql = "UPDATE academic_works SET 
                            status_cause = :status_cause, 
                            completion_date = :completion_date 
                            WHERE id = :id";
                    $stmt = $conn->prepare($sql);
                    $stmt->bindValue(':status_cause', $data->status_cause ?? null);
                    $stmt->bindValue(':completion_date', (!empty($data->completion_date)) ? $data->completion_date : null);
                    $stmt->bindValue(':id', $data->id);
                }

                if ($stmt->execute()) {
                    @unlink(__DIR__ . '/cache/stats_cache.json');
                    logAction('UPDATE', $data);
                    echo json_encode(["status" => "success"]);
                } else {
                    http_response_code(503);
                    echo json_encode(["status" => "error", "message" => "Execute failed"]);
                }
            } else {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID missing"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
        }
        break;

    case 'DELETE':
        try {
            $data = json_decode(file_get_contents("php://input"));

            if (!empty($data->id)) {
                $sql = "DELETE FROM academic_works WHERE id = :id";
                $stmt = $conn->prepare($sql);
                $stmt->bindParam(':id', $data->id);

                if ($stmt->execute()) {
                    @unlink(__DIR__ . '/cache/stats_cache.json');
                    logAction('DELETE', $data);
                    echo json_encode(["status" => "success"]);
                } else {
                    http_response_code(503);
                    echo json_encode(["status" => "error"]);
                }
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Database error: " . $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(["status" => "error", "message" => "Method not allowed"]);
        break;
}

function logAction($action, $data)
{
    $userName = $data->user_name ?? 'System';
    $itemId = $data->id ?? $data->seq_no ?? null;
    $details = "";

    if ($action === 'ADD') {
        $details = "เพิ่มงานวิชาการใหม่: " . ($data->subject ?? 'N/A');
    } elseif ($action === 'UPDATE') {
        if (isset($data->status_cause)) {
            $details = "อัปเดตสถานะงานวิชาการ (ID: $itemId) เป็น: " . $data->status_cause;
        } else {
            $details = "แก้ไขข้อมูลงานวิชาการ (ID: $itemId)";
        }
    } elseif ($action === 'DELETE') {
        $details = "ลบงานวิชาการ (ID: $itemId)";
    }

    Logger::log($userName, $action, 'academic', $itemId, $details);
}
?>
