'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../crm-test-authorization');

test('visitor source marker is downgraded without server authorization', () => {
    assert.equal(auth.trustedSource('crm_integration_test', false), 'form_submit');
    assert.equal(auth.trustedSource('quote_form', false), 'quote_form');
});

test('server authorization is the only way to set the synthetic source', () => {
    assert.equal(auth.trustedSource('anything', true), 'crm_integration_test');
});

test('issued proof validates only before it is consumed or expires', () => {
    const now = 1_800_000_000_000;
    const issued = auth.issueAuthorization(now);
    assert.equal(auth.isValidAuthorization(issued.record, issued.token, now), true);
    assert.equal(auth.isValidAuthorization({ ...issued.record, consumed: true }, issued.token, now), false);
    assert.equal(auth.isValidAuthorization(issued.record, issued.token, now + auth.AUTHORIZATION_TTL_MS), false);
});

test('wrong, missing, and malformed proofs fail closed', () => {
    const issued = auth.issueAuthorization();
    assert.equal(auth.isValidAuthorization(issued.record, '', Date.now()), false);
    assert.equal(auth.isValidAuthorization(issued.record, 'visitor-controlled', Date.now()), false);
    const other = auth.issueAuthorization();
    assert.equal(auth.isValidAuthorization(issued.record, other.token, Date.now()), false);
});

