<?php
require_once __DIR__ . '/doc_config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { jsonResponse([]); }

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = getDocDB();

switch ($method) {
    case 'GET':
        $id       = $_GET['id']       ?? null;
        $storeId  = $_GET['store_id'] ?? null;
        $type     = $_GET['type']     ?? null;
        $status   = $_GET['status']   ?? null;
        $dateFrom = $_GET['date_from']?? null;
        $dateTo   = $_GET['date_to']  ?? null;

        if ($id) {
            // Single document with items
            $stmt = $pdo->prepare(
                "SELECT d.*, s.name as store_name, s.address as store_address, s.phone as store_phone,
                        s.tax_id as store_tax_id, s.email as store_email, s.logo_url as store_logo,
                        dt.primary_color, dt.accent_color, dt.font_family, dt.header_text, dt.footer_text, dt.show_tax, dt.tax_rate
                 FROM documents d
                 JOIN stores s ON s.id = d.store_id
                 LEFT JOIN document_templates dt ON dt.store_id = d.store_id
                 WHERE d.id = ?"
            );
            $stmt->execute([$id]);
            $doc = $stmt->fetch();
            if (!$doc) jsonResponse(null, 404);

            $items = $pdo->prepare("SELECT * FROM document_items WHERE document_id = ? ORDER BY seq");
            $items->execute([$id]);
            $doc['items'] = $items->fetchAll();
            jsonResponse($doc);
        }

        // List with filters
        $sql = "SELECT d.*, s.name as store_name FROM documents d JOIN stores s ON s.id = d.store_id WHERE 1=1";
        $params = [];
        if ($storeId)  { $sql .= " AND d.store_id = ?";   $params[] = $storeId; }
        if ($type)     { $sql .= " AND d.doc_type = ?";   $params[] = $type; }
        if ($status)   { $sql .= " AND d.status = ?";     $params[] = $status; }
        if ($dateFrom) { $sql .= " AND d.issue_date >= ?"; $params[] = $dateFrom; }
        if ($dateTo)   { $sql .= " AND d.issue_date <= ?"; $params[] = $dateTo; }
        $sql .= " ORDER BY d.created_at DESC LIMIT 200";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        jsonResponse($stmt->fetchAll());
        break;

    case 'POST':
        $b = getBody();
        if (empty($b['store_id']) || empty($b['doc_type'])) {
            jsonResponse(['error' => 'ต้องระบุ store_id และ doc_type'], 422);
        }
        $docNumber = $b['doc_number'] ?? generateDocNumber($pdo, $b['doc_type']);
        $items     = $b['items'] ?? [];

        // Compute totals
        $subtotal = array_sum(array_map(fn($it) => ($it['quantity'] ?? 0) * ($it['unit_price'] ?? 0), $items));
        // tax
        $stmtTpl = $pdo->prepare("SELECT show_tax, tax_rate FROM document_templates WHERE store_id = ?");
        $stmtTpl->execute([$b['store_id']]);
        $tpl     = $stmtTpl->fetch();
        $showTax = $b['show_tax'] ?? ($tpl['show_tax'] ?? 0);
        $taxRate = $b['tax_rate'] ?? ($tpl['tax_rate'] ?? 0);
        $discount   = (float)($b['discount'] ?? 0);
        $taxAmount  = $showTax ? round(($subtotal - $discount) * $taxRate / 100, 2) : 0;
        $total      = $subtotal - $discount + $taxAmount;

        $pdo->prepare(
            "INSERT INTO documents (doc_number, doc_type, store_id, customer_name, customer_address, customer_phone, customer_tax_id, issue_date, due_date, subtotal, tax_amount, total, discount, note, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        )->execute([
            $docNumber, $b['doc_type'], $b['store_id'],
            $b['customer_name']??null, $b['customer_address']??null, $b['customer_phone']??null, $b['customer_tax_id']??null,
            $b['issue_date']??date('Y-m-d'), $b['due_date']??null,
            $subtotal, $taxAmount, $total, $discount, $b['note']??null,
            $b['status']??'issued'
        ]);
        $docId = $pdo->lastInsertId();

        // Insert items
        $insertItem = $pdo->prepare("INSERT INTO document_items (document_id, seq, description, unit, quantity, unit_price) VALUES (?,?,?,?,?,?)");
        foreach ($items as $i => $item) {
            $insertItem->execute([$docId, $i+1, $item['description']??'', $item['unit']??'ชิ้น', $item['quantity']??1, $item['unit_price']??0]);
        }

        jsonResponse(['id' => $docId, 'doc_number' => $docNumber, 'message' => 'สร้างเอกสารสำเร็จ'], 201);
        break;

    case 'PUT':
        $id = $_GET['id'] ?? null;
        if (!$id) jsonResponse(['error' => 'ไม่พบ id'], 400);
        $b     = getBody();
        $items = $b['items'] ?? [];

        $subtotal = array_sum(array_map(fn($it) => ($it['quantity'] ?? 0) * ($it['unit_price'] ?? 0), $items));
        $discount  = (float)($b['discount'] ?? 0);
        $showTax   = (int)($b['show_tax'] ?? 0);
        $taxRate   = (float)($b['tax_rate'] ?? 7);
        $taxAmount = $showTax ? round(($subtotal - $discount) * $taxRate / 100, 2) : 0;
        $total     = $subtotal - $discount + $taxAmount;

        $pdo->prepare(
            "UPDATE documents SET customer_name=?, customer_address=?, customer_phone=?, customer_tax_id=?, issue_date=?, due_date=?, subtotal=?, tax_amount=?, total=?, discount=?, note=?, status=? WHERE id=?"
        )->execute([
            $b['customer_name']??null, $b['customer_address']??null, $b['customer_phone']??null, $b['customer_tax_id']??null,
            $b['issue_date']??date('Y-m-d'), $b['due_date']??null,
            $subtotal, $taxAmount, $total, $discount, $b['note']??null,
            $b['status']??'issued', $id
        ]);

        // Replace items
        $pdo->prepare("DELETE FROM document_items WHERE document_id = ?")->execute([$id]);
        $insertItem = $pdo->prepare("INSERT INTO document_items (document_id, seq, description, unit, quantity, unit_price) VALUES (?,?,?,?,?,?)");
        foreach ($items as $i => $item) {
            $insertItem->execute([$id, $i+1, $item['description']??'', $item['unit']??'ชิ้น', $item['quantity']??1, $item['unit_price']??0]);
        }

        jsonResponse(['message' => 'อัพเดตเอกสารสำเร็จ']);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) jsonResponse(['error' => 'ไม่พบ id'], 400);
        $pdo->prepare("DELETE FROM documents WHERE id = ?")->execute([$id]);
        jsonResponse(['message' => 'ลบเอกสารสำเร็จ']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
