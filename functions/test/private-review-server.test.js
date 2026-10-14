'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startPrivateReview } = require('../../scripts/commerce/private-review-server.cjs');
test('private loopback review refuses other origins, preserves unknown costs and never persists scenarios', async t => {
    const { server, origin } = await startPrivateReview({ port: 0 });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const proposals = await (await fetch(origin + '/proposals')).json(); assert.equal(proposals.variants.length, 14);
    const body = JSON.stringify({ revenueMinor: 10000, costs: {} });
    assert.equal((await fetch(origin + '/scenario', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body })).status, 403);
    const response = await fetch(origin + '/scenario', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
    assert.equal((await response.json()).status, 'incomplete');
    assert.equal((await fetch(origin + '/scenario')).status, 404);
    assert.equal((await (await fetch(origin + '/proposals')).json()).variants[0].costs.materialMinor, null);
    assert.equal((await fetch(origin + '/functions/index.js')).status, 404);
    const http = require('node:http');
    const hostileHostStatus = await new Promise((resolve, reject) => {
        http.get(origin, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(hostileHostStatus, 403);
});
