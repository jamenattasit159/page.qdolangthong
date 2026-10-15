<?php
/**
 * Backup API Endpoint
 * จัดการ requests สำหรับระบบ Backup
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type");

require_once 'config.php';
require_once 'backup.php';

$method = $_SERVER['REQUEST_METHOD'];

// Handle GET requests
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    
    switch ($action) {
        case 'getSettings':
            echo json_encode(loadSettings());
            break;
            
        case 'getBackupList':
            try {
                $backup = new DatabaseBackup();
                echo json_encode(['files' => $backup->getBackupList()]);
            } catch (Exception $e) {
                echo json_encode(['error' => $e->getMessage()]);
            }
            break;
            
        default:
            echo json_encode(['error' => 'Invalid action']);
    }
    exit;
}

// Handle POST requests
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';
    
    switch ($action) {
        case 'saveSettings':
            $settings = loadSettings();
            $settings['webhook_url'] = $data['webhook_url'] ?? '';
            
            if (saveSettings($settings)) {
                echo json_encode(['success' => true, 'message' => 'Settings saved']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Failed to save settings']);
            }
            break;
            
        case 'testWebhook':
            $webhookUrl = $data['webhook_url'] ?? '';
            
            if (empty($webhookUrl)) {
                echo json_encode(['success' => false, 'message' => 'Webhook URL is required']);
                break;
            }
            
            // ส่งข้อความทดสอบ
            $message = "🧪 **Test Message**\n";
            $message .= "📅 Time: `" . date('Y-m-d H:i:s') . "`\n";
            $message .= "✅ Webhook connection successful!\n";
            $message .= "🗄️ Emerald Solstice Backup System is ready.";
            
            $ch = curl_init($webhookUrl);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(['content' => $message]),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_SSL_VERIFYPEER => false
            ]);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode >= 200 && $httpCode < 300) {
                echo json_encode(['success' => true, 'message' => 'Test message sent to Discord!']);
            } else {
                echo json_encode(['success' => false, 'message' => "Discord error: HTTP $httpCode"]);
            }
            break;
            
        case 'backup':
            try {
                $sendToDiscord = $data['sendToDiscord'] ?? true;
                $backup = new DatabaseBackup();
                $result = $backup->runFullBackup($sendToDiscord);
                echo json_encode($result);
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;
            
        case 'deleteBackup':
            $filename = $data['filename'] ?? '';
            
            if (empty($filename)) {
                echo json_encode(['success' => false, 'message' => 'Filename is required']);
                break;
            }
            
            // ป้องกัน directory traversal
            $filename = basename($filename);
            $filepath = BACKUP_DIR . $filename;
            
            if (file_exists($filepath) && unlink($filepath)) {
                echo json_encode(['success' => true, 'message' => 'File deleted']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Failed to delete file']);
            }
            break;
            
        default:
            echo json_encode(['error' => 'Invalid action']);
    }
    exit;
}

echo json_encode(['error' => 'Method not allowed']);
?>
