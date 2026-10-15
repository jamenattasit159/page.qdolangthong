<?php
/**
 * Database Backup Script
 * ส่ง backup ไป Discord Webhook
 * 
 * Usage:
 * - Web: เรียกผ่าน index.php
 * - Cron: php backup.php --cron
 */

require_once 'config.php';

class DatabaseBackup {
    private $pdo;
    private $backupDir;
    
    public function __construct() {
        $this->backupDir = BACKUP_DIR;
        
        // สร้างโฟลเดอร์ถ้ายังไม่มี
        if (!file_exists($this->backupDir)) {
            mkdir($this->backupDir, 0755, true);
        }
        
        // เชื่อมต่อ Database
        try {
            $this->pdo = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
        } catch (PDOException $e) {
            throw new Exception("Database connection failed: " . $e->getMessage());
        }
    }
    
    /**
     * Export database เป็น SQL file
     */
    public function exportDatabase() {
        $timestamp = date('Y-m-d_H-i-s');
        $filename = DB_NAME . '_backup_' . $timestamp . '.sql';
        $filepath = $this->backupDir . $filename;
        
        $sql = "-- Database Backup: " . DB_NAME . "\n";
        $sql .= "-- Created: " . date('Y-m-d H:i:s') . "\n";
        $sql .= "-- Generator: Emerald Solstice Backup System\n\n";
        $sql .= "SET FOREIGN_KEY_CHECKS=0;\n\n";
        
        // ดึงรายชื่อ tables ทั้งหมด
        $tables = $this->pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        
        foreach ($tables as $table) {
            // สร้าง DROP และ CREATE TABLE statement
            $sql .= "-- Table: $table\n";
            $sql .= "DROP TABLE IF EXISTS `$table`;\n";
            
            $createTable = $this->pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_ASSOC);
            $sql .= $createTable['Create Table'] . ";\n\n";
            
            // ดึงข้อมูลทั้งหมดใน table
            $rows = $this->pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
            
            if (count($rows) > 0) {
                $columns = array_keys($rows[0]);
                $columnList = '`' . implode('`, `', $columns) . '`';
                
                foreach ($rows as $row) {
                    $values = array_map(function($value) {
                        if ($value === null) return 'NULL';
                        return "'" . addslashes($value) . "'";
                    }, array_values($row));
                    
                    $sql .= "INSERT INTO `$table` ($columnList) VALUES (" . implode(', ', $values) . ");\n";
                }
                $sql .= "\n";
            }
        }
        
        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";
        
        // บันทึกไฟล์
        file_put_contents($filepath, $sql);
        
        return [
            'filename' => $filename,
            'filepath' => $filepath,
            'size' => filesize($filepath)
        ];
    }
    
    /**
     * บีบอัด SQL file เป็น ZIP
     */
    public function compressBackup($sqlFile) {
        $zipFilename = str_replace('.sql', '.zip', $sqlFile['filename']);
        $zipFilepath = $this->backupDir . $zipFilename;
        
        $zip = new ZipArchive();
        if ($zip->open($zipFilepath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
            $zip->addFile($sqlFile['filepath'], $sqlFile['filename']);
            $zip->close();
            
            // ลบไฟล์ SQL หลังจาก zip แล้ว
            unlink($sqlFile['filepath']);
            
            return [
                'filename' => $zipFilename,
                'filepath' => $zipFilepath,
                'size' => filesize($zipFilepath)
            ];
        }
        
        throw new Exception("Failed to create ZIP file");
    }
    
    /**
     * ส่งไฟล์ไป Discord
     */
    public function sendToDiscord($file, $webhookUrl = null) {
        $webhookUrl = $webhookUrl ?: getWebhookUrl();
        
        if (empty($webhookUrl)) {
            return ['success' => false, 'message' => 'Discord Webhook URL not configured'];
        }
        
        // ตรวจสอบขนาดไฟล์ (Discord limit: 25MB)
        if ($file['size'] > 25 * 1024 * 1024) {
            return ['success' => false, 'message' => 'File too large for Discord (max 25MB)'];
        }
        
        // เตรียมข้อมูลสำหรับส่ง
        $timestamp = date('Y-m-d H:i:s');
        $sizeFormatted = $this->formatFileSize($file['size']);
        
        $message = "🗄️ **Database Backup**\n";
        $message .= "📅 Time: `$timestamp`\n";
        $message .= "📁 File: `{$file['filename']}`\n";
        $message .= "📊 Size: `$sizeFormatted`\n";
        $message .= "✅ Backup completed successfully!";
        
        // สร้าง multipart form data
        $boundary = uniqid();
        $eol = "\r\n";
        
        $body = '';
        
        // Payload JSON
        $body .= "--$boundary$eol";
        $body .= "Content-Disposition: form-data; name=\"payload_json\"$eol$eol";
        $body .= json_encode(['content' => $message]) . $eol;
        
        // File
        $body .= "--$boundary$eol";
        $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$file['filename']}\"$eol";
        $body .= "Content-Type: application/zip$eol$eol";
        $body .= file_get_contents($file['filepath']) . $eol;
        $body .= "--$boundary--$eol";
        
        // ส่งด้วย cURL
        $ch = curl_init($webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                "Content-Type: multipart/form-data; boundary=$boundary"
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true, 'message' => 'Backup sent to Discord successfully!'];
        }
        
        return [
            'success' => false, 
            'message' => "Discord error: HTTP $httpCode - $error",
            'response' => $response
        ];
    }
    
    /**
     * ลบไฟล์ backup เก่า
     */
    public function cleanupOldBackups() {
        $deleted = 0;
        $retentionDate = strtotime('-' . BACKUP_RETENTION_DAYS . ' days');
        
        $files = glob($this->backupDir . '*.zip');
        
        // จัดเรียงตามวันที่ (เก่าสุดก่อน)
        usort($files, function($a, $b) {
            return filemtime($a) - filemtime($b);
        });
        
        foreach ($files as $file) {
            // ลบถ้าเก่ากว่า retention period
            if (filemtime($file) < $retentionDate) {
                unlink($file);
                $deleted++;
            }
        }
        
        // ลบถ้าเกินจำนวนสูงสุด
        $files = glob($this->backupDir . '*.zip');
        while (count($files) > MAX_BACKUP_FILES) {
            $oldestFile = array_shift($files);
            unlink($oldestFile);
            $deleted++;
            $files = glob($this->backupDir . '*.zip');
        }
        
        return $deleted;
    }
    
    /**
     * ดึงรายการ backup files ทั้งหมด
     */
    public function getBackupList() {
        $files = glob($this->backupDir . '*.zip');
        $list = [];
        
        foreach ($files as $file) {
            $list[] = [
                'filename' => basename($file),
                'filepath' => $file,
                'size' => filesize($file),
                'size_formatted' => $this->formatFileSize(filesize($file)),
                'created' => date('Y-m-d H:i:s', filemtime($file)),
                'age_days' => floor((time() - filemtime($file)) / 86400)
            ];
        }
        
        // เรียงตามวันที่ (ใหม่สุดก่อน)
        usort($list, function($a, $b) {
            return strtotime($b['created']) - strtotime($a['created']);
        });
        
        return $list;
    }
    
    /**
     * Format file size
     */
    private function formatFileSize($bytes) {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }
    
    /**
     * ทำ backup แบบเต็มรูปแบบ
     */
    public function runFullBackup($sendToDiscord = true) {
        $result = [
            'success' => false,
            'steps' => [],
            'file' => null
        ];
        
        try {
            // Step 1: Export database
            $sqlFile = $this->exportDatabase();
            $result['steps'][] = ['step' => 'Export Database', 'status' => 'success', 'details' => $sqlFile['filename']];
            
            // Step 2: Compress
            $zipFile = $this->compressBackup($sqlFile);
            $result['steps'][] = ['step' => 'Compress', 'status' => 'success', 'details' => $zipFile['filename']];
            $result['file'] = $zipFile;
            
            // Step 3: Send to Discord (if enabled)
            if ($sendToDiscord) {
                $discordResult = $this->sendToDiscord($zipFile);
                $result['steps'][] = [
                    'step' => 'Send to Discord', 
                    'status' => $discordResult['success'] ? 'success' : 'warning',
                    'details' => $discordResult['message']
                ];
            }
            
            // Step 4: Cleanup old backups
            $deleted = $this->cleanupOldBackups();
            $result['steps'][] = ['step' => 'Cleanup', 'status' => 'success', 'details' => "Deleted $deleted old files"];
            
            $result['success'] = true;
            $result['message'] = 'Backup completed successfully!';
            
        } catch (Exception $e) {
            $result['message'] = 'Backup failed: ' . $e->getMessage();
            $result['steps'][] = ['step' => 'Error', 'status' => 'error', 'details' => $e->getMessage()];
        }
        
        // บันทึก log
        $this->saveLog($result);
        
        return $result;
    }
    
    /**
     * บันทึก backup log
     */
    private function saveLog($result) {
        $logFile = $this->backupDir . 'backup.log';
        $logEntry = date('Y-m-d H:i:s') . ' - ' . 
                    ($result['success'] ? 'SUCCESS' : 'FAILED') . ' - ' . 
                    ($result['file']['filename'] ?? 'N/A') . "\n";
        file_put_contents($logFile, $logEntry, FILE_APPEND);
    }
}

// Cron Mode
if (php_sapi_name() === 'cli' && isset($argv[1]) && $argv[1] === '--cron') {
    $backup = new DatabaseBackup();
    $result = $backup->runFullBackup(true);
    echo $result['success'] ? "Backup completed!\n" : "Backup failed: {$result['message']}\n";
    exit($result['success'] ? 0 : 1);
}
?>
