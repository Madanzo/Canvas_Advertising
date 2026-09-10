'use strict';

const crypto = require('crypto');

const TEST_SOURCE = 'crm_integration_test';
const AUTHORIZATION_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function issueAuthorization(nowMs = Date.now()) {
    const token = crypto.randomBytes(32).toString('base64url');
    return {
        token,
        record: {
            tokenHash: hashToken(token),
            consumed: false,
            expiresAtMs: nowMs + AUTHORIZATION_TTL_MS
        }
    };
}

function isValidAuthorization(record, token, nowMs = Date.now()) {
    if (!record || record.consumed === true || !TOKEN_PATTERN.test(String(token || ''))) return false;
    const expiresAtMs = typeof record.expiresAt?.toMillis === 'function'
        ? record.expiresAt.toMillis()
        : Number(record.expiresAtMs || record.expiresAt || 0);
    if (!expiresAtMs || expiresAtMs <= nowMs || !/^[a-f0-9]{64}$/.test(String(record.tokenHash || ''))) return false;
    const supplied = Buffer.from(hashToken(token), 'hex');
    const expected = Buffer.from(record.tokenHash, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function trustedSource(visitorSource, authorized) {
    if (authorized) return TEST_SOURCE;
    const source = String(visitorSource || 'form_submit').trim().slice(0, 120);
    return source === TEST_SOURCE ? 'form_submit' : source;
}

module.exports = {
    AUTHORIZATION_TTL_MS,
    TEST_SOURCE,
    hashToken,
    isValidAuthorization,
    issueAuthorization,
    trustedSource
};
