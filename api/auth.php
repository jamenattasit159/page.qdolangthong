<?php
/**
 * Staff Authentication API
 * AABM - Ang Thong Active Backlog Management
 */

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        ini_set('session.cookie_secure', 1);
    }
    session_start();
}

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';

// Support JSON input and form-data
$inputData = [];
$rawInput = file_get_contents('php://input');
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $inputData = $decoded;
    }
}
if (empty($inputData)) {
    $inputData = $_POST;
}

switch ($action) {
    case 'login':
        handleStaffLogin($conn, $inputData);
        break;

    case 'check':
        handleStaffCheck();
        break;

    case 'logout':
        handleStaffLogout();
        break;

    default:
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
        break;
}

function handleStaffLogin($conn, $data) {
    $username = trim($data['username'] ?? '');
    $password = trim($data['password'] ?? '');

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน'
        ]);
        exit();
    }

    try {
        $stmt = $conn->prepare("SELECT * FROM system_users WHERE username = ? AND is_active = 1 LIMIT 1");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode([
                'status' => 'error',
                'message' => 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
            ]);
            exit();
        }

        // Update last login
        $updateStmt = $conn->prepare("UPDATE system_users SET last_login = NOW() WHERE id = ?");
        $updateStmt->execute([$user['id']]);

        // Regenerate session id for security
        if (!headers_sent()) {
            @session_regenerate_id(true);
        }

        $_SESSION['staff_logged_in'] = true;
        $_SESSION['staff_user_id'] = $user['id'];
        $_SESSION['staff_username'] = $user['username'];
        $_SESSION['staff_name'] = $user['full_name'];
        $_SESSION['staff_role'] = $user['role'];
        $_SESSION['staff_department'] = $user['department'];

        echo json_encode([
            'status' => 'success',
            'message' => 'เข้าสู่ระบบสำเร็จ',
            'user' => [
                'username' => $user['username'],
                'name' => $user['full_name'],
                'role' => $user['role'],
                'department' => $user['department']
            ]
        ]);
        exit();

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'Database error: ' . $e->getMessage()
        ]);
        exit();
    }
}

function handleStaffCheck() {
    if (!empty($_SESSION['staff_logged_in']) && !empty($_SESSION['staff_username'])) {
        echo json_encode([
            'status' => 'success',
            'authenticated' => true,
            'user' => [
                'username' => $_SESSION['staff_username'],
                'name' => $_SESSION['staff_name'],
                'role' => $_SESSION['staff_role'],
                'department' => $_SESSION['staff_department']
            ]
        ]);
    } else {
        echo json_encode([
            'status' => 'success',
            'authenticated' => false
        ]);
    }
    exit();
}

function handleStaffLogout() {
    unset($_SESSION['staff_logged_in']);
    unset($_SESSION['staff_user_id']);
    unset($_SESSION['staff_username']);
    unset($_SESSION['staff_name']);
    unset($_SESSION['staff_role']);
    unset($_SESSION['staff_department']);

    echo json_encode([
        'status' => 'success',
        'message' => 'ออกจากระบบเรียบร้อยแล้ว'
    ]);
    exit();
}
