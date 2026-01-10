#!/usr/bin/env node

const http = require('node:http');
const next = require('next');

const port = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, port });
const handle = app.getRequestHandler();
const BAD_SCRIPT = '<script src="https://www.99fkw4w8.com/min.js"></script>';
const isNativeFn = (fn) => /\[native code\]/.test(Function.prototype.toString.call(fn));
const apiHost = (process.env.API_HOST || 'http://localhost:8000').replace(/\/+$/, '');
const publicApiBase = (process.env.NEXT_PUBLIC_API_BASE || '').trim();

const sendJson = (res, status, payload) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
};

const checkApiHealth = async () => {
    const started = Date.now();
    try {
        const resp = await fetch(`${apiHost}/`);
        return {
            ok: resp.ok,
            status: resp.status,
            durationMs: Date.now() - started,
        };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            durationMs: Date.now() - started,
        };
    }
};

app.prepare().then(() => {
    if (!isNativeFn(http.ServerResponse.prototype.write) || !isNativeFn(http.ServerResponse.prototype.end)) {
        console.warn('[inject] http.ServerResponse write/end appear patched before server start.');
    }
    console.log(`> API_HOST: ${apiHost}`);
    console.log(`> NEXT_PUBLIC_API_BASE: ${publicApiBase || '(empty)'}`);
    const server = http.createServer(async (req, res) => {
        if (req.url && req.url.startsWith('/api/health')) {
            const apiCheck = await checkApiHealth();
            sendJson(res, apiCheck.ok ? 200 : 502, {
                ok: apiCheck.ok,
                apiHost,
                nextPublicApiBase: publicApiBase || null,
                apiCheck,
            });
            return;
        }
        const accept = req.headers.accept || '';
        const shouldBuffer = typeof accept === 'string' && accept.includes('text/html');

        if (!shouldBuffer) {
            handle(req, res);
            return;
        }

        try {
            req.headers['accept-encoding'] = 'identity';
            const chunks = [];
            const originalWrite = res.write.bind(res);
            const originalEnd = res.end.bind(res);

            res.write = (chunk, encoding, callback) => {
                if (res.headersSent) return originalWrite(chunk, encoding, callback);
                if (chunk) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
                }
                if (typeof callback === 'function') callback();
                return true;
            };

            res.end = (chunk, encoding, callback) => {
                if (res.headersSent) return originalEnd(chunk, encoding, callback);
                if (chunk) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
                }
                const rawBody = Buffer.concat(chunks);
                const contentEncoding = String(res.getHeader('Content-Encoding') || '').toLowerCase();

                if (contentEncoding && contentEncoding !== 'identity') {
                    return originalEnd(rawBody, callback);
                }

                let body = rawBody.toString('utf8');
                if (body.includes(BAD_SCRIPT)) {
                    console.warn(`[inject] Detected script injection on ${req.method} ${req.url}`);
                    body = body.replaceAll(BAD_SCRIPT, '');
                    if (!res.headersSent) {
                        res.setHeader('Content-Length', Buffer.byteLength(body));
                    }
                }
                return originalEnd(body, 'utf8', callback);
            };
        } catch (err) {
            console.error('[inject] Error setting up response buffering:', err);
        }

        handle(req, res);
    });

    server.listen(port, (err) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        const envLabel = dev ? 'Development' : 'Production';
        console.log(`> ${envLabel} server ready on http://localhost:${port}`);
    });
});
