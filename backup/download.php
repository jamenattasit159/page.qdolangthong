<?php
/**
 * Backup File Download Handler
 * ดาวน์โหลดไฟล์ Backup
 */

require_once 'config.php';

$filename = $_GET['file'] ?? '';

if (empty($filename)) {
    http_response_code(400);
    die('Filename is required');
}

// ป้องกัน directory traversal attack
$filename = basename($filename);
$filepath = BACKUP_DIR . $filename;

// ตรวจสอบว่าเป็นไฟล์ .zip และมีอยู่จริง
if (!file_exists($filepath) || pathinfo($filepath, PATHINFO_EXTENSION) !== 'zip') {
    http_response_code(404);
    die('File not found');
}

// ส่ง headers สำหรับ download
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($filepath));
header('Cache-Control: no-cache, must-revalidate');
header('Pragma: no-cache');

// อ่านและส่งไฟล์
readfile($filepath);
exit;
?>
