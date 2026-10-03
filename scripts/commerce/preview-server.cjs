'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { loadBackend } = require('./load-backend.cjs');
const { WebsiteCommerce } = require('../../functions/commerce-adapter');
const { commerceHttp } = require('../../functions/commerce-http');
const root = path.resolve(__dirname, '../..');
class WebsiteMemoryStore {
    data = new Map(); tail = Promise.resolve();
    transaction(callback) {
        const run = this.tail.then(async () => {
            const copy = new Map(structuredClone([...this.data]));
            const result = await callback({ get: async (key) => copy.get(key) || null, set: (key, data) => copy.set(key, structuredClone(data)) });
            this.data = copy; return result;
        });
        this.tail = run.catch(() => {}); return run;
    }
}
async function prepareProofs(backend, orderId) {
    const staff = (operation, body) => backend.request(operation, JSON.stringify(body), 'preview_staff_only');
    const orderResponse = await staff('staff-order', { orderId });
    if (!orderResponse.ok) throw new Error(orderResponse.code);
    for (const item of orderResponse.result.items) {
        for (const source of item.assets.filter((asset) => asset.role === 'source')) {
            const checks = Object.fromEntries(item.purchased.productionPolicy.preflightChecks.map((c) => [c, 'pass']));
            let result = await staff('review-asset', { orderId, lineItemId: item.lineItemId, assetId: source.assetId, passed: true, checks });
            if (!result.ok) throw new Error(result.code);
            const sourceSession = backend.store.data.get('tenants/canvas_test/commerceUploads/' + source.assetId);
            const bytes = backend.objects.get(sourceSession.objectKey).bytes;
            const upload = await staff('create-final-upload', { orderId, lineItemId: item.lineItemId, placement: source.placement,
                assignmentId: source.assignmentId || 'main', allocatedQuantity: source.allocatedQuantity, role: 'final', filename: 'proof.png',
                mime: sourceSession.mime, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), requestId: randomUUID() });
            if (!upload.ok) throw new Error(upload.code);
            const object = backend.objects.get(backend.uploads.get(upload.result.sessionId));
            object.bytes = bytes; object.complete = true;
            result = await staff('complete-final-upload', { orderId, sessionId: upload.result.sessionId });
            if (!result.ok) throw new Error(result.code);
            result = await staff('review-asset', { orderId, lineItemId: item.lineItemId, assetId: result.result.assetId, passed: true, checks });
            if (!result.ok) throw new Error(result.code);
        }
        const fresh = await staff('staff-order', { orderId });
        const final = fresh.result.items.find((i) => i.lineItemId === item.lineItemId).assets.find((a) => a.role === 'final');
        if (final) {
            const proof = await staff('request-proof', { orderId, lineItemId: item.lineItemId, previewAssetId: final.assetId });
            if (!proof.ok) throw new Error(proof.code);
        }
    }
}
async function startPreview({ port = 3210 } = {}) {
    const backend = await loadBackend();
    const websiteStore = new WebsiteMemoryStore(); const mailbox = [];
    websiteStore.data.set('config', { enabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true });
    const origin = `http://127.0.0.1:${port}`; backend.controls.origin = origin;
    const service = new WebsiteCommerce({ store: websiteStore,
        config: async () => websiteStore.data.get('config'),
        transport: async (op, body, token) => {
            if (op === 'checkout' && !/@example\.com$/i.test(JSON.parse(body).contact.email)) throw new Error('Use synthetic example.com email only');
            return backend.request(op, body, token);
        }, sendRecovery: async (letter) => mailbox.push(letter)
    });
    const handler = commerceHttp({ service, origin, verifyAppCheck: async () => {}, secure: false });
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, origin);
            if (req.method === 'POST' || req.method === 'PUT') {
                const chunks = []; let size = 0;
                for await (const chunk of req) { size += chunk.length; if (size > 21000000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
                req.rawBody = Buffer.concat(chunks);
            }
            if (url.pathname === '/api/commerce') {
                req.get = (key) => req.headers[key.toLowerCase()]; req.ip = req.socket.remoteAddress;
                try { req.body = JSON.parse(req.rawBody || '{}'); } catch { req.body = null; }
                res.set = (key, value) => res.setHeader(key, value);
                res.status = (status) => { res.statusCode = status; return res; };
                res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
                await handler(req, res); return;
            }
            if (url.pathname.startsWith('/preview-upload/') && req.method === 'PUT') {
                const object = backend.objects.get(backend.uploads.get(url.pathname.split('/').pop()));
                if (!object) { res.writeHead(404); res.end(); return; }
                const range = req.headers['content-range'] || '';
                if (range.startsWith('bytes */')) {
                    res.writeHead(object.complete ? 200 : 308, object.bytes.length ? { Range: `bytes=0-${object.bytes.length - 1}` } : {}); res.end(); return;
                }
                const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
                if (!match || Number(match[1]) !== object.bytes.length || req.rawBody.length !== Number(match[2]) - Number(match[1]) + 1 || object.complete) {
                    res.writeHead(409); res.end(); return;
                }
                object.bytes = Buffer.concat([object.bytes, req.rawBody]); object.complete = object.bytes.length === Number(match[3]);
                res.writeHead(object.complete ? 200 : 308, { Range: `bytes=0-${object.bytes.length - 1}` }); res.end(); return;
            }
            if (url.pathname.startsWith('/preview-asset/') && req.method === 'GET') {
                const key = Buffer.from(url.pathname.split('/').pop(), 'base64url').toString();
                const object = backend.objects.get(key);
                if (!object?.complete) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { 'Content-Type': object.contentType, 'Cache-Control': 'no-store' }); res.end(object.bytes); return;
            }
            if (url.pathname.startsWith('/preview/') && req.method === 'POST') {
                if (req.headers.origin !== origin) { res.writeHead(403); res.end(); return; }
                const body = JSON.parse(req.rawBody || '{}');
                res.setHeader('Content-Type', 'application/json');
                if (url.pathname === '/preview/tokenize') { res.end(JSON.stringify({ token: 'TKisolatedPreviewTokenOnly1234' })); return; }
                if (url.pathname === '/preview/lost-payment') { backend.controls.losePaymentResponse = true; res.end('{}'); return; }
                const cookie = req.headers.cookie?.split(';').map((p) => p.trim()).find((p) => p.startsWith('__session='))?.slice(10);
                if (url.pathname === '/preview/proof') {
                    const authorization = await service.call(cookie, 'order', JSON.stringify({ orderId: body.orderId }));
                    if (!authorization.ok) throw new Error('not owned');
                    await prepareProofs(backend, body.orderId); res.end('{}'); return;
                }
                if (url.pathname === '/preview/mailbox') {
                    const principal = await service.principal(cookie);
                    const letter = mailbox.findLast((l) => {
                        const order = websiteStore.data.get('order_' + require('../../functions/commerce-adapter').hash(l.orderId));
                        return order?.customerId === principal.customerId && (!principal.orderId || principal.orderId === l.orderId);
                    });
                    res.end(JSON.stringify(letter ? { url: '/store#recover=' + letter.token } : {})); return;
                }
                res.writeHead(404); res.end(); return;
            }
            const relative = url.pathname === '/' ? 'store.html' : ['store', 'store-es'].includes(url.pathname.slice(1)) ? url.pathname.slice(1) + '.html' : url.pathname.slice(1);
            if (!/^(store(?:-es)?\.html|js\/(main|firebase-config)\.js|css\/styles\.css|fonts\/[\w.-]+|favicon\.png)$/.test(relative)) { res.writeHead(404); res.end(); return; }
            let bytes = await fs.readFile(path.join(root, relative));
            if (relative.endsWith('.html')) {
                bytes = Buffer.from(bytes.toString().replace(/<script defer src="https:[^"]+"><\/script>/g, '')
                    .replace('id="commerce-app"', 'id="commerce-app" data-commerce-preview')
                    .replace('<main ', '<main ').replace('<section class="c-hero">', '<p class="c-preview">ISOLATED TEST · Synthetic catalog · Simulated payment · Local private storage · No Firebase production access</p><section class="c-hero">'));
            }
            res.writeHead(200, { 'Content-Type': relative.endsWith('.html') ? 'text/html' : relative.endsWith('.js') ? 'application/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.woff2') ? 'font/woff2' : 'image/png', 'Cache-Control': 'no-store' }); res.end(bytes);
        } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, code: 'preview_step_failed' })); }
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    return { server, backend, websiteStore, service, origin, mailbox };
}
if (require.main === module) startPreview().then(({ origin }) => console.log(`Isolated Canvas commerce preview: ${origin}/store (simulated providers; no live calls)`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { startPreview, WebsiteMemoryStore, prepareProofs };
