<?php
/**
 * Backup System Configuration Example
 * คัดลอกไฟล์นี้เป็น config.php แล้วระบุข้อมูลการเชื่อมต่อ
 */

// Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_username');
define('DB_PASS', 'your_password');

// Discord Webhook Configuration
define('DISCORD_WEBHOOK_URL', '');

// Backup Settings
define('BACKUP_DIR', __DIR__ . '/files/');
define('BACKUP_RETENTION_DAYS', 30);
define('MAX_BACKUP_FILES', 50);

// Config file path สำหรับเก็บ settings ที่ตั้งค่าผ่าน UI
define('SETTINGS_FILE', __DIR__ . '/settings.json');

function loadSettings() {
    if (file_exists(SETTINGS_FILE)) {
        $json = file_get_contents(SETTINGS_FILE);
        return json_decode($json, true) ?: [];
    }
    return [];
}

function saveSettings($settings) {
    return file_put_contents(SETTINGS_FILE, json_encode($settings, JSON_PRETTY_PRINT));
}

function getWebhookUrl() {
    $settings = loadSettings();
    return $settings['webhook_url'] ?? DISCORD_WEBHOOK_URL;
}
?>
