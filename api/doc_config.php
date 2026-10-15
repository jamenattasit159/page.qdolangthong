<?php
// =============================================
// Document System – DB Config & Helpers
// =============================================

define('DOC_DB_HOST', 'localhost');
define('DOC_DB_NAME', 'doc_system');
define('DOC_DB_USER', 'root');
define('DOC_DB_PASS', '');

function getDocDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DOC_DB_HOST . ';dbname=' . DOC_DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DOC_DB_USER, DOC_DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function jsonResponse(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function getBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// ── Auto Document Number Generator ──────────────────
function generateDocNumber(PDO $pdo, string $type): string {
    $prefix = match($type) {
        'quotation' => 'QT',
        'delivery'  => 'DV',
        'receipt'   => 'RC',
        default     => 'DOC',
    };
    $year  = date('Y');
    $month = date('m');

    // Count docs of same type this month
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM documents WHERE doc_type = ? AND doc_number LIKE ?"
    );
    $stmt->execute([$type, "{$prefix}{$year}{$month}%"]);
    $count = (int) $stmt->fetchColumn();

    return sprintf('%s%s%s%04d', $prefix, $year, $month, $count + 1);
}
