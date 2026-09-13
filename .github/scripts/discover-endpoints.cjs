/**
 * Offline entrypoint + trigger discovery for the functions codebase.
 *
 * Loads functions/index.js exactly as the Firebase CLI's discovery step does
 * and reads the `__endpoint` each firebase-functions builder attaches. That
 * metadata is assembled in-process, so this makes NO call to any Google API and
 * needs no credentials — it is pointed at a throwaway project id and will fail
 * loudly if anything tries to reach the network at load time.
 *
 * What it guards:
 *   - the module loads at all under this Node version (the failure the CLI
 *     reports as "User code failed to load. Cannot determine backend
 *     specification", which reads like a code fault and is not one);
 *   - every export carries a resolvable trigger;
 *   - the two CRM functions keep the trigger shape and the Secret Manager
 *     binding this branch introduced. A refactor that quietly drops
 *     `runWith({ secrets })` would put the CRM credential back into plaintext
 *     deploy parameters, and that must not pass review silently.
 */
'use strict';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'ci-discovery-only';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ projectId: 'ci-discovery-only' });
// Never let a stray ADC file turn discovery into a real call.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const path = require('path');
const assert = require('node:assert');

const entry = path.join(__dirname, '..', '..', 'functions', 'index.js');
const mod = require(entry);

// firebase-functions v1 builders return FUNCTIONS with __endpoint hung off
// them, so a `typeof === 'object'` filter silently matches nothing.
const endpoints = Object.entries(mod)
  .filter(([, v]) => v && (typeof v === 'function' || typeof v === 'object') && v.__endpoint)
  .map(([name, v]) => ({ name, ep: v.__endpoint }));

const exported = Object.keys(mod).length;
console.log(`exports: ${exported}  |  with a resolvable trigger: ${endpoints.length}`);

const missing = Object.keys(mod).filter(
  (n) => !endpoints.find((e) => e.name === n)
);
assert.deepStrictEqual(missing, [], `exports without a trigger: ${missing.join(', ')}`);
assert.ok(endpoints.length > 0, 'no endpoints discovered at all');

function kindOf(ep) {
  if (ep.httpsTrigger) return 'https';
  if (ep.callableTrigger) return 'callable';
  if (ep.scheduleTrigger) return `schedule(${ep.scheduleTrigger.schedule})`;
  if (ep.eventTrigger) return `event(${ep.eventTrigger.eventType})`;
  return 'unknown';
}

for (const { name, ep } of endpoints.sort((a, b) => a.name.localeCompare(b.name))) {
  const secrets = (ep.secretEnvironmentVariables || []).map((s) => s.key).join(',') || '-';
  console.log(`  ${name.padEnd(30)} ${kindOf(ep).padEnd(46)} secrets=${secrets}`);
}

// ---- the two CRM functions, asserted explicitly ----
const CRM_SECRET = 'MERKAD_LEADS_CREDENTIAL';
const expected = {
  syncLeadToCRM: (ep) => {
    assert.ok(ep.eventTrigger, 'syncLeadToCRM must stay an event trigger');
    assert.match(
      ep.eventTrigger.eventType,
      /document\.create/,
      'syncLeadToCRM must remain a Firestore document-create trigger'
    );
    const res = JSON.stringify(ep.eventTrigger.eventFilters || ep.eventTrigger);
    assert.match(res, /canvas_leads/, 'syncLeadToCRM must stay bound to canvas_leads');
  },
  processCrmLeadDeliveryQueue: (ep) => {
    assert.ok(ep.scheduleTrigger, 'processCrmLeadDeliveryQueue must stay scheduled');
  },
};

for (const [name, check] of Object.entries(expected)) {
  const found = endpoints.find((e) => e.name === name);
  assert.ok(found, `${name} is missing from the codebase`);
  check(found.ep);
  const keys = (found.ep.secretEnvironmentVariables || []).map((s) => s.key);
  assert.ok(
    keys.includes(CRM_SECRET),
    `${name} must bind ${CRM_SECRET} via Secret Manager — found: ${keys.join(',') || 'none'}`
  );
}

// No other function should pick up the CRM credential.
for (const { name, ep } of endpoints) {
  if (name in expected) continue;
  const keys = (ep.secretEnvironmentVariables || []).map((s) => s.key);
  assert.ok(
    !keys.includes(CRM_SECRET),
    `${name} must not bind ${CRM_SECRET}; the binding is scoped to the CRM functions`
  );
}

console.log('\nOK: all exports resolve, CRM triggers intact, CRM credential bound by reference and scoped.');
