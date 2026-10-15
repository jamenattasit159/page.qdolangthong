<?php
/**
 * Settings API
 * จัดการการตั้งค่าระบบ (เช่น Lockdown)
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

include_once 'db.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // Fetch all settings
        $stmt = $conn->query("SELECT setting_key, setting_value FROM system_settings");
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        echo json_encode([
            'status' => 'success',
            'data' => $settings
        ]);
    } else if ($method === 'POST') {
        // Update a setting
        $data = json_decode(file_get_contents("php://input"));

        if (!isset($data->key) || !isset($data->value)) {
            throw new Exception("Missing key or value");
        }

        $stmt = $conn->prepare("UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?");
        $stmt->execute([$data->value, $data->key]);

        if ($stmt->rowCount() === 0) {
            $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)");
            $stmt->execute([$data->key, $data->value]);
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'Setting updated successfully'
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
