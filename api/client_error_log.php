<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/utils/error_logger.php';

function checkClientLogRateLimit($limit = 60, $windowSeconds = 60)
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $bucketKey = date('YmdHi');
    $rateFile = __DIR__ . '/../logs/client_log_rate_' . date('Y-m-d') . '.json';

    $rateDir = dirname($rateFile);
    if (!is_dir($rateDir)) {
        @mkdir($rateDir, 0775, true);
    }

    $handle = @fopen($rateFile, 'c+');
    if ($handle === false) {
        return true;
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return true;
    }

    $raw = stream_get_contents($handle);
    $state = json_decode($raw ?: '{}', true);
    if (!is_array($state)) {
        $state = [];
    }

    $now = time();
    foreach ($state as $key => $meta) {
        if (!is_array($meta)) {
            unset($state[$key]);
            continue;
        }

        $lastSeen = (int)($meta['last_seen'] ?? 0);
        if ($lastSeen < ($now - $windowSeconds)) {
            unset($state[$key]);
        }
    }

    $bucket = $ip . '|' . $bucketKey;
    $count = (int)($state[$bucket]['count'] ?? 0) + 1;
    $allowed = $count <= $limit;

    $state[$bucket] = [
        'count' => $count,
        'last_seen' => $now,
    ];

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['status' => 'ok']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

if (!checkClientLogRateLimit(60, 60)) {
    AppErrorLogger::log('WARN', 'Client error log rate limit exceeded', [
        'source' => 'client_error_log',
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
    ], 'backend');

    http_response_code(429);
    echo json_encode(['status' => 'error', 'message' => 'Too many requests']);
    exit;
}

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!is_array($payload)) {
        throw new RuntimeException('Invalid payload');
    }

    $message = trim((string)($payload['message'] ?? 'Unknown frontend error'));
    $level = (string)($payload['level'] ?? 'ERROR');

    $context = [
        'error_name' => $payload['error_name'] ?? null,
        'stack' => $payload['stack'] ?? null,
        'page_url' => $payload['page_url'] ?? null,
        'user_agent' => $payload['user_agent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? null),
        'context' => $payload['context'] ?? null,
    ];

    AppErrorLogger::log($level, $message, $context, 'frontend');

    echo json_encode(['status' => 'success']);
} catch (Throwable $e) {
    AppErrorLogger::logException($e, ['source' => 'client_error_log'], 'backend');
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Bad request']);
}
?>
