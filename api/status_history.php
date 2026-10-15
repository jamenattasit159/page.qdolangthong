<?php
/**
 * Status History API
 * Handles logging and retrieving work status history
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Get history for a specific work item
            $workType = $_GET['work_type'] ?? null;
            $workId = $_GET['work_id'] ?? null;

            if (!$workType || !$workId) {
                echo json_encode(['error' => 'work_type and work_id are required']);
                exit;
            }

            $stmt = $conn->prepare("SELECT * FROM status_history WHERE work_type = ? AND work_id = ? ORDER BY changed_at DESC");
            $stmt->execute([$workType, $workId]);
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode($history);
            break;

        case 'POST':
            // Add new history entry
            $data = json_decode(file_get_contents('php://input'), true);

            $workType = $data['work_type'] ?? null;
            $workId = $data['work_id'] ?? null;
            $actionType = $data['action_type'] ?? 'อัปเดต';
            $oldValue = $data['old_value'] ?? null;
            $newValue = $data['new_value'] ?? null;
            $note = $data['note'] ?? null;
            $changedBy = $data['changed_by'] ?? 'ระบบ';

            if (!$workType || !$workId) {
                echo json_encode(['error' => 'work_type and work_id are required']);
                exit;
            }

            $stmt = $conn->prepare("INSERT INTO status_history (work_type, work_id, action_type, old_value, new_value, note, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$workType, $workId, $actionType, $oldValue, $newValue, $note, $changedBy]);

            echo json_encode([
                'status' => 'success',
                'id' => $conn->lastInsertId(),
                'message' => 'บันทึกประวัติสำเร็จ'
            ]);
            break;

        case 'DELETE':
            // Delete a history entry (admin only)
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;

            if (!$id) {
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            $stmt = $conn->prepare("DELETE FROM status_history WHERE id = ?");
            $stmt->execute([$id]);

            echo json_encode(['status' => 'success', 'message' => 'ลบประวัติสำเร็จ']);
            break;

        case 'PUT':
            // Update a history entry
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;
            $actionType = $data['action_type'] ?? null;
            $note = $data['note'] ?? null;

            if (!$id) {
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            $stmt = $conn->prepare("UPDATE status_history SET action_type = ?, note = ? WHERE id = ?");
            $stmt->execute([$actionType, $note, $id]);

            echo json_encode(['status' => 'success', 'message' => 'แก้ไขประวัติสำเร็จ']);
            break;

        default:
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>