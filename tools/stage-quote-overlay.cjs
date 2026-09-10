'use strict';
// Local artifact preparation only. This tool never authenticates, sends requests, or deploys.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const [baselineDirectory, manifestPath, outputDirectory] = process.argv.slice(2);
if (!baselineDirectory || !manifestPath || !outputDirectory) throw new Error('Usage: node tools/stage-quote-overlay.cjs BASELINE_DIR LIVE_MANIFEST_JSON EMPTY_OUTPUT_DIR');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const entries = manifest.files || manifest;
const hash = bytes => crypto.createHash('sha256').update(zlib.gzipSync(bytes, { level: 9 })).digest('hex');
const before = {};
for (const file of ['js/main.js', 'css/styles.css', 'js/firebase-config.js']) {
  const bytes = fs.readFileSync(path.join(baselineDirectory, file));
  if (hash(bytes) !== entries.find(f => f.path === '/' + file)?.hash) throw new Error('Baseline hash mismatch: ' + file);
  before[file] = bytes.toString();
}
if (before['js/firebase-config.js'] !== fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8')) throw new Error('App Check baseline changed; review required');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const mainMarker = '/* Quote request: stable Canvas service keys';
const styleMarker = '/* Scoped quote workspace';
if (!main.includes(mainMarker) || !styles.includes(styleMarker)) throw new Error('Quote patch markers missing');
const bootstrap = "document.addEventListener('DOMContentLoaded', function () {";
if (before['js/main.js'].includes(mainMarker) || before['css/styles.css'].includes(styleMarker)) throw new Error('Redesign already present; rebase instead of duplicating');
if (before['js/main.js'].split(bootstrap).length !== 2) throw new Error('Live bootstrap changed; review required');
const bootGuard = "\n    if (document.getElementById('canvasQuoteForm')) {\n        window.initCanvasQuote();\n        return;\n    }";
const outputs = {
  'js/main.js': before['js/main.js'].replace(bootstrap, bootstrap + bootGuard) + '\n' + main.slice(main.indexOf(mainMarker)),
  'css/styles.css': before['css/styles.css'] + '\n' + styles.slice(styles.indexOf(styleMarker)),
  'quote.html': fs.readFileSync(path.join(root, 'quote.html'), 'utf8'),
  'quote-es.html': fs.readFileSync(path.join(root, 'quote-es.html'), 'utf8')
};
if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length) throw new Error('Output directory must be empty');
for (const [file, contents] of Object.entries(outputs)) {
  const output = path.join(outputDirectory, file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, contents);
}
console.log(JSON.stringify({ scope: Object.keys(outputs), hashes: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, hash(Buffer.from(v))])), note: 'Local only. Not deployment approval. Recheck current Hosting version/config and full manifest before any future release.' }, null, 2));
