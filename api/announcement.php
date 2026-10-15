<?php
/**
 * Announcement API
 * จัดการประกาศที่แสดงบนหน้า Login (index.html)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

include_once 'db.php';

// Create table if not exists
try {
    $conn->exec("
        CREATE TABLE IF NOT EXISTS announcements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            target_dept VARCHAR(50) DEFAULT 'all',
            is_active TINYINT(1) DEFAULT 1,
            require_scroll TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Exception $e) {
    // Table may already exist
}

// Auto-migration for target_dept column
try {
    $conn->exec("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_dept VARCHAR(50) DEFAULT 'all' COMMENT 'all, survey, registration, academic, admin'");
} catch (Exception $e) {
    try {
        $conn->exec("ALTER TABLE announcements ADD COLUMN target_dept VARCHAR(50) DEFAULT 'all'");
    } catch (Exception $e2) {}
}

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $activeOnly = isset($_GET['active']) && $_GET['active'] === '1';
        $department = isset($_GET['department']) ? trim($_GET['department']) : '';

        if ($activeOnly) {
            if (!empty($department) && $department !== 'all') {
                // Return active announcements for specific department or all
                $stmt = $conn->prepare("
                    SELECT * FROM announcements 
                    WHERE is_active = 1 
                      AND (target_dept = ? OR target_dept = 'all' OR target_dept IS NULL OR target_dept = '')
                    ORDER BY (target_dept = ?) DESC, created_at DESC
                ");
                $stmt->execute([$department, $department]);
            } elseif ($department === 'all') {
                // All departments
                $stmt = $conn->query("
                    SELECT * FROM announcements 
                    WHERE is_active = 1 
                    ORDER BY created_at DESC
                ");
            } else {
                // Visitor (before login) -> only 'all' announcements
                $stmt = $conn->query("
                    SELECT * FROM announcements 
                    WHERE is_active = 1 
                      AND (target_dept = 'all' OR target_dept IS NULL OR target_dept = '')
                    ORDER BY created_at DESC
                ");
            }
        } else {
            $stmt = $conn->query("SELECT * FROM announcements ORDER BY created_at DESC");
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'data' => $rows
        ]);

    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);

        if (!isset($data['title']) || !isset($data['content'])) {
            throw new Exception("Missing title or content");
        }

        $title      = trim($data['title']);
        $content    = trim($data['content']);
        $targetDept = !empty($data['target_dept']) ? trim($data['target_dept']) : 'all';
        $active     = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $scroll     = isset($data['require_scroll']) ? (int)$data['require_scroll'] : 1;

        $stmt = $conn->prepare("INSERT INTO announcements (title, content, target_dept, is_active, require_scroll) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$title, $content, $targetDept, $active, $scroll]);
        $newId = $conn->lastInsertId();

        echo json_encode([
            'status' => 'success',
            'message' => 'Announcement created',
            'id' => $newId
        ]);

    } elseif ($method === 'PUT') {
        $data = json_decode(file_get_contents("php://input"), true);

        if (!isset($data['id'])) {
            throw new Exception("Missing id");
        }

        $id         = (int)$data['id'];
        $title      = trim($data['title'] ?? '');
        $content    = trim($data['content'] ?? '');
        $targetDept = !empty($data['target_dept']) ? trim($data['target_dept']) : 'all';
        $active     = isset($data['is_active']) ? (int)$data['is_active'] : 1;
        $scroll     = isset($data['require_scroll']) ? (int)$data['require_scroll'] : 1;

        $stmt = $conn->prepare("UPDATE announcements SET title=?, content=?, target_dept=?, is_active=?, require_scroll=?, updated_at=NOW() WHERE id=?");
        $stmt->execute([$title, $content, $targetDept, $active, $scroll, $id]);

        echo json_encode([
            'status' => 'success',
            'message' => 'Announcement updated'
        ]);

    } elseif ($method === 'DELETE') {
        $data = json_decode(file_get_contents("php://input"), true);

        if (!isset($data['id'])) {
            throw new Exception("Missing id");
        }

        $id = (int)$data['id'];
        $stmt = $conn->prepare("DELETE FROM announcements WHERE id=?");
        $stmt->execute([$id]);

        echo json_encode([
            'status' => 'success',
            'message' => 'Announcement deleted'
        ]);

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
