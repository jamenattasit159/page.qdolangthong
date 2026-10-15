<?php
require_once __DIR__ . '/doc_config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { jsonResponse([]); }

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDocDB();

switch ($method) {
    case 'GET':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare("SELECT s.*, dt.primary_color, dt.accent_color, dt.font_family, dt.header_text, dt.footer_text, dt.show_tax, dt.tax_rate FROM stores s LEFT JOIN document_templates dt ON dt.store_id = s.id WHERE s.id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            jsonResponse($row ?: null);
        }
        $rows = $pdo->query("SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.store_id = s.id) as doc_count FROM stores s WHERE s.is_active = 1 ORDER BY s.name")->fetchAll();
        jsonResponse($rows);
        break;

    case 'POST':
        $b = getBody();
        if (empty($b['name'])) jsonResponse(['error' => 'ต้องระบุชื่อร้านค้า'], 422);
        $stmt = $pdo->prepare("INSERT INTO stores (name, branch, address, phone, tax_id, email, logo_url) VALUES (?,?,?,?,?,?,?)");
        $stmt->execute([$b['name'], $b['branch']??null, $b['address']??null, $b['phone']??null, $b['tax_id']??null, $b['email']??null, $b['logo_url']??null]);
        $storeId = $pdo->lastInsertId();
        // create default template
        $pdo->prepare("INSERT INTO document_templates (store_id, primary_color, accent_color, font_family, footer_text) VALUES (?,?,?,?,?)")
            ->execute([$storeId, $b['primary_color']??'#1a3a5c', $b['accent_color']??'#2980b9', 'Sarabun', $b['footer_text']??'ขอบคุณที่ใช้บริการ']);
        jsonResponse(['id' => $storeId, 'message' => 'เพิ่มร้านค้าสำเร็จ'], 201);
        break;

    case 'PUT':
        $id = $_GET['id'] ?? null;
        if (!$id) jsonResponse(['error' => 'ไม่พบ id'], 400);
        $b = getBody();
        // update store
        $pdo->prepare("UPDATE stores SET name=?, branch=?, address=?, phone=?, tax_id=?, email=?, logo_url=? WHERE id=?")
            ->execute([$b['name']??'', $b['branch']??null, $b['address']??null, $b['phone']??null, $b['tax_id']??null, $b['email']??null, $b['logo_url']??null, $id]);
        // update template
        $pdo->prepare("UPDATE document_templates SET primary_color=?, accent_color=?, font_family=?, header_text=?, footer_text=?, show_tax=?, tax_rate=? WHERE store_id=?")
            ->execute([$b['primary_color']??'#1a3a5c', $b['accent_color']??'#2980b9', $b['font_family']??'Sarabun', $b['header_text']??null, $b['footer_text']??null, $b['show_tax']??1, $b['tax_rate']??7.00, $id]);
        jsonResponse(['message' => 'อัพเดตสำเร็จ']);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) jsonResponse(['error' => 'ไม่พบ id'], 400);
        $pdo->prepare("UPDATE stores SET is_active = 0 WHERE id = ?")->execute([$id]);
        jsonResponse(['message' => 'ลบร้านค้าสำเร็จ']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
