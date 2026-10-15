<?php
class AppErrorLogger
{
    private static $logDir = __DIR__ . '/../../logs';
    private static $retentionDays = 60;
    private static $retentionChecked = false;
    private static $requestId = null;

    private static function ensureLogDirectory()
    {
        if (!is_dir(self::$logDir)) {
            @mkdir(self::$logDir, 0775, true);
        }

        if (!self::$retentionChecked) {
            self::cleanupOldLogs();
            self::$retentionChecked = true;
        }
    }

    private static function cleanupOldLogs()
    {
        $files = glob(self::$logDir . '/*.log');
        if (!$files) {
            return;
        }

        $cutoffTimestamp = time() - (self::$retentionDays * 86400);
        foreach ($files as $filePath) {
            if (!is_file($filePath)) {
                continue;
            }

            $fileModifiedTime = @filemtime($filePath);
            if ($fileModifiedTime === false || $fileModifiedTime >= $cutoffTimestamp) {
                continue;
            }

            @unlink($filePath);
        }
    }

    private static function getRequestId()
    {
        if (self::$requestId !== null) {
            return self::$requestId;
        }

        $headerRequestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? null;
        if (is_string($headerRequestId) && trim($headerRequestId) !== '') {
            self::$requestId = trim($headerRequestId);
            return self::$requestId;
        }

        try {
            self::$requestId = bin2hex(random_bytes(8));
        } catch (Throwable $e) {
            self::$requestId = uniqid('req_', true);
        }

        return self::$requestId;
    }

    private static function maskSensitiveData($value, $depth = 0)
    {
        if ($depth > 6) {
            return '[MAX_DEPTH]';
        }

        if (is_array($value)) {
            $masked = [];
            foreach ($value as $key => $item) {
                if (is_string($key) && preg_match('/password|pass|token|secret|api[_-]?key|authorization|cookie|session|phone|mobile|citizen|id[_-]?card/i', $key)) {
                    $masked[$key] = '[REDACTED]';
                    continue;
                }

                $masked[$key] = self::maskSensitiveData($item, $depth + 1);
            }
            return $masked;
        }

        if (is_string($value) && strlen($value) > 2000) {
            return substr($value, 0, 2000) . '...[TRUNCATED]';
        }

        return $value;
    }

    public static function log($level, $message, $context = [], $channel = 'backend')
    {
        self::ensureLogDirectory();

        $safeLevel = strtoupper((string)$level);
        if ($safeLevel === '') {
            $safeLevel = 'ERROR';
        }

        $maskedContext = self::maskSensitiveData($context);

        $entry = [
            'timestamp' => date('c'),
            'channel' => $channel,
            'level' => $safeLevel,
            'message' => (string)$message,
            'context' => $maskedContext,
            'request' => [
                'request_id' => self::getRequestId(),
                'method' => $_SERVER['REQUEST_METHOD'] ?? null,
                'uri' => $_SERVER['REQUEST_URI'] ?? null,
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]
        ];

        $fileName = sprintf('%s/%s_%s.log', self::$logDir, $channel, date('Y-m-d'));
        $jsonLine = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        @file_put_contents($fileName, $jsonLine, FILE_APPEND | LOCK_EX);
    }

    public static function logException(Throwable $e, $context = [], $channel = 'backend')
    {
        $context['exception'] = [
            'type' => get_class($e),
            'code' => $e->getCode(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString(),
        ];

        self::log('ERROR', $e->getMessage(), $context, $channel);
    }

    public static function registerGlobalHandlers()
    {
        set_exception_handler(function (Throwable $e) {
            AppErrorLogger::logException($e, ['source' => 'uncaught_exception']);

            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
            }

            echo json_encode([
                'status' => 'error',
                'message' => 'เกิดข้อผิดพลาดภายในระบบ'
            ], JSON_UNESCAPED_UNICODE);
        });

        set_error_handler(function ($severity, $message, $file, $line) {
            AppErrorLogger::log('ERROR', $message, [
                'source' => 'php_error',
                'severity' => $severity,
                'file' => $file,
                'line' => $line,
            ]);

            return false;
        });

        register_shutdown_function(function () {
            $lastError = error_get_last();
            if (!$lastError) {
                return;
            }

            $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
            if (!in_array($lastError['type'], $fatalTypes, true)) {
                return;
            }

            AppErrorLogger::log('FATAL', $lastError['message'], [
                'source' => 'shutdown_fatal',
                'type' => $lastError['type'],
                'file' => $lastError['file'] ?? null,
                'line' => $lastError['line'] ?? null,
            ]);
        });
    }
}
?>
