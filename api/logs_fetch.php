<?php
header('Content-Type: application/json; charset=utf-8');
include_once 'db.php';

try {
    $sql = "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($logs);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>