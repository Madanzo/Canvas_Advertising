'use strict';
const { CommerceFailure } = require('./commerce-adapter');
// Shared by Firebase onRequest and isolated preview. Capabilities stay on server.
function commerceHttp({ service, origin, verifyAppCheck, secure = true }) {
    return async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        res.set('Referrer-Policy', 'no-referrer');
        try {
            if (req.method !== 'POST') throw new CommerceFailure('method_not_allowed', 405);
            if (req.get('origin') !== origin) throw new CommerceFailure('origin_forbidden', 403);
            if (req.get('content-type')?.split(';')[0] !== 'application/json') throw new CommerceFailure('invalid_content_type', 415);
            if (req.rawBody && req.rawBody.length > 132000) throw new CommerceFailure('payload_too_large', 413);
            await verifyAppCheck(req.get('x-firebase-appcheck'));
            const cookie = req.get('cookie')?.split(';').map((part) => part.trim())
                .find((part) => part.startsWith('__session='))?.slice(10);
            const input = req.body;
            const setCookie = (value) => res.set('Set-Cookie', `__session=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=7776000${secure ? '; Secure' : ''}`);
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommerceFailure('invalid_request', 422);
            if (input.operation === 'website-session') {
                const session = await service.session(cookie, req.ip);
                setCookie(session.cookie);
                return res.status(200).json({ ok: true, result: { ready: true, orderId: session.orderId || null,
                    ...await service.publicConfiguration() } });
            }
            if (input.operation === 'recover') {
                const session = await service.recover(input.token);
                setCookie(session.cookie);
                return res.status(200).json({ ok: true, result: { orderId: session.orderId } });
            }
            if (input.operation === 'request-recovery') return res.status(200).json(await service.requestRecovery(input.orderId, input.email, req.ip));
            const response = await service.call(cookie, input.operation, input.serializedBody, input.attemptId);
            return res.status(response.ok ? 200 : response.httpStatus || 409).json(response);
        } catch (error) {
            return res.status(error instanceof CommerceFailure ? error.status : 503).json({
                ok: false, code: error instanceof CommerceFailure ? error.code : 'delivery_uncertain'
            });
        }
    };
}
module.exports = { commerceHttp };
