(function () {
    const MAX_LOGS_PER_SESSION = 30;
    const queue = [];
    let sentCount = 0;
    let flushTimer = null;

    function nowIso() {
        return new Date().toISOString();
    }

    function safeStringify(value) {
        try {
            return JSON.stringify(value);
        } catch (e) {
            return '[unserializable]';
        }
    }

    function normalizeError(input) {
        if (input instanceof Error) {
            return {
                message: input.message,
                stack: input.stack || null,
                name: input.name || 'Error'
            };
        }

        if (typeof input === 'object' && input !== null) {
            return {
                message: input.message || safeStringify(input),
                stack: input.stack || null,
                name: input.name || 'ObjectError'
            };
        }

        return {
            message: String(input),
            stack: null,
            name: typeof input
        };
    }

    function enqueue(payload) {
        if (sentCount >= MAX_LOGS_PER_SESSION) return;
        queue.push(payload);
        if (!flushTimer) {
            flushTimer = setTimeout(flush, 400);
        }
    }

    function flush() {
        flushTimer = null;
        if (!queue.length || sentCount >= MAX_LOGS_PER_SESSION) return;

        const payload = queue.shift();
        sentCount += 1;

        fetch('api/client_error_log.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(function () {
            // avoid recursive logging loop
        });

        if (queue.length && sentCount < MAX_LOGS_PER_SESSION) {
            flushTimer = setTimeout(flush, 300);
        }
    }

    function capture(error, extraContext) {
        const normalized = normalizeError(error);
        const context = extraContext || {};

        enqueue({
            level: 'ERROR',
            message: normalized.message,
            stack: normalized.stack,
            error_name: normalized.name,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
            context: {
                timestamp: nowIso(),
                ...context
            }
        });
    }

    window.AppErrorTracker = {
        capture: capture
    };

    window.addEventListener('error', function (event) {
        capture(event.error || event.message || 'window.error', {
            source: 'window.onerror',
            filename: event.filename || null,
            lineno: event.lineno || null,
            colno: event.colno || null
        });
    });

    window.addEventListener('unhandledrejection', function (event) {
        capture(event.reason || 'Unhandled Promise Rejection', {
            source: 'window.unhandledrejection'
        });
    });

    const originalConsoleError = console.error;
    console.error = function (...args) {
        try {
            const firstErr = args.find(a => a instanceof Error);
            capture(firstErr || args.map(a => (typeof a === 'string' ? a : safeStringify(a))).join(' | '), {
                source: 'console.error'
            });
        } catch (e) {
            // noop
        }
        originalConsoleError.apply(console, args);
    };
})();
