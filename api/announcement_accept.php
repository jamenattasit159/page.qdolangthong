<?php
/**
 * Announcement Acceptance Log API
 * บันทึกการยอมรับประกาศของ user แต่ละคน
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once 'db.php';

// Create table if not exists
try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS announcement_accepts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            announcement_id INT NOT NULL,
            username VARCHAR(100) NOT NULL,
            accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            accept_date DATE GENERATED ALWAYS AS (DATE(accepted_at)) STORED,
            INDEX idx_ann_user_date (announcement_id, username, accept_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Exception $e) {
    // May fail on older MySQL without generated columns - try fallback
    try {
        $conn->exec("
            CREATE TABLE IF NOT EXISTS announcement_accepts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                announcement_id INT NOT NULL,
                username VARCHAR(100) NOT NULL,
                accept_date DATE NOT NULL,
                accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ann_user_date (announcement_id, username, accept_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    } catch (Exception $e2) {
        // Table may already exist
    }
}

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // Admin view: get all acceptance logs
        $announcementId = isset($_GET['announcement_id']) ? (int)$_GET['announcement_id'] : null;

        if ($announcementId) {
            // Get logs for specific announcement
            $stmt = $conn->prepare("
                SELECT 
                    aa.id,
                    aa.announcement_id,
                    a.title AS announcement_title,
                    a.target_dept,
                    aa.username,
                    aa.accept_date,
                    aa.accepted_at
                FROM announcement_accepts aa
                LEFT JOIN announcements a ON a.id = aa.announcement_id
                WHERE aa.announcement_id = ?
                ORDER BY aa.accepted_at DESC
            ");
            $stmt->execute([$announcementId]);
        } else {
            // Get all logs with summary
            $stmt = $conn->query("
                SELECT 
                    aa.id,
                    aa.announcement_id,
                    a.title AS announcement_title,
                    a.target_dept,
                    aa.username,
                    aa.accept_date,
                    aa.accepted_at
                FROM announcement_accepts aa
                LEFT JOIN announcements a ON a.id = aa.announcement_id
                ORDER BY aa.accepted_at DESC
                LIMIT 500
            ");
        }
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Summary: unique users who accepted each announcement (latest date)
        $summaryStmt = $conn->query("
            SELECT 
                aa.announcement_id,
                a.title AS announcement_title,
                a.target_dept,
                COUNT(DISTINCT aa.username) AS unique_users,
                MAX(aa.accepted_at) AS last_accept,
                GROUP_CONCAT(DISTINCT aa.username ORDER BY aa.username SEPARATOR ', ') AS user_list
            FROM announcement_accepts aa
            LEFT JOIN announcements a ON a.id = aa.announcement_id
            GROUP BY aa.announcement_id
            ORDER BY aa.announcement_id DESC
        ");
        $summary = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'data' => $logs,
            'summary' => $summary
        ]);

    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);

        if (!isset($data['announcement_id']) || !isset($data['username'])) {
            throw new Exception("Missing announcement_id or username");
        }

        $announcementId = (int)$data['announcement_id'];
        $username = trim($data['username']);
        $today = date('Y-m-d');

        // Check if already accepted today
        $checkStmt = $conn->prepare("
            SELECT id FROM announcement_accepts 
            WHERE announcement_id = ? AND username = ? AND accept_date = ?
            LIMIT 1
        ");
        $checkStmt->execute([$announcementId, $username, $today]);
        $existing = $checkStmt->fetch();

        if ($existing) {
            echo json_encode([
                'status' => 'success',
                'message' => 'Already accepted today',
                'already_accepted' => true
            ]);
        } else {
            $insertStmt = $conn->prepare("
                INSERT INTO announcement_accepts (announcement_id, username, accept_date, accepted_at)
                VALUES (?, ?, ?, NOW())
            ");
            $insertStmt->execute([$announcementId, $username, $today]);

            echo json_encode([
                'status' => 'success',
                'message' => 'Acceptance recorded',
                'already_accepted' => false
            ]);
        }

    } else {
        throw new Exception("Method not allowed");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
