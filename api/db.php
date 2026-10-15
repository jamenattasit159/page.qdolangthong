<?php
/**
 * Database Connection - Optimized for Performance
 * 
 * Optimizations:
 * 1. Persistent Connection - reuse connections across requests
 * 2. UTF8MB4 - full Unicode support
 * 3. Prepared Statements - prevent SQL injection + faster
 * 4. Buffered Queries - better memory usage
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// $host = "localhost";
// $db_name = "your_db_name";
// $username = "your_db_user";
// $password = "your_db_password"; 
$host = "localhost";
$db_name = "dol_management";
$username = "root";
$password = ""; // รหัสผ่าน XAMPP ปกติจะเป็นค่าว่าง



try {
    $conn = new PDO(
        "mysql:host=$host;dbname=$db_name;charset=utf8mb4",
        $username,
        $password,
        [
            // ⚡ Performance Optimizations
            PDO::ATTR_PERSISTENT => true,           // Reuse connections (faster!)
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,    // Use real prepared statements
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ]
    );
} catch (PDOException $exception) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Connection error: " . $exception->getMessage()]);
    exit();
}
?>