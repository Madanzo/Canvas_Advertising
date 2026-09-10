'use strict';
// Offline artifact only. Does not authenticate, query, send, change settings or deploy.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const [input, expectedSha256, output] = process.argv.slice(2);
if (!input || !expectedSha256 || !output) throw Error('Usage: node tools/stage-sms-consent.cjs VERIFIED_LIVE_INDEX EXPECTED_SHA256 EMPTY_OUTPUT_DIR');
const bytes = fs.readFileSync(input);
if (crypto.createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw Error('Baseline hash mismatch');
if (fs.existsSync(output) && fs.readdirSync(output).length) throw Error('Output must be empty');
fs.mkdirSync(path.join(output, 'functions'), {recursive:true});
fs.writeFileSync(path.join(output, 'functions/index.js'), bytes);
const patch = path.join(__dirname, 'sms-consent.patch');
execFileSync('git', ['apply', '--check', patch], {cwd:output});
execFileSync('git', ['apply', patch], {cwd:output});
fs.copyFileSync(path.join(__dirname, '../functions/sms-consent.js'), path.join(output, 'functions/sms-consent.js'));
console.log('Local Functions artifact prepared. Review patch and target caller inventory before any separately approved deployment.');
