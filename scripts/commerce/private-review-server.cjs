'use strict';
// Local-only costing worksheet, NOT a deployed staff/customer API. No persistence,
// credentials, analytics, email, CRM writes or pricing publication.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { variants, shippingProposal, costFields, reviewMargin } = require('./private-pricing-review.cjs');
const root = path.resolve(__dirname, '../..');
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Cost Review | Canvas Advertising</title><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/css/styles.css"><script defer src="/review.js"></script></head><body class="commerce-page"><main class="c-shell"><h1>Private pricing review</h1><p class="c-message">Local-only worksheet · No costs saved or published · No live payments · Not the authenticated staff quote interface</p><section class="c-card"><h2>14 proposed products</h2><label>Product<select id="product"></select></label><pre id="proposal"></pre><p>Retail proposals are owner inputs, not supplier costs or an approved catalog. The minimum, yard unit/stakes, design scope and shipping policies remain unresolved. No unknown policy is applied here.</p></section><section class="c-card"><h2>Cost and margin scenario</h2><p>Enter total costs for the configured job, not unit prices. Use an authoritative CRM pre-tax sales subtotal for revenue. Explicit zero is allowed; blank means unknown. No numbers are prefilled.</p><form id="scenario"><label>CRM pre-tax sales subtotal (USD)<input name="revenueMinor" type="number" min="0.01" step="0.01" required></label><div id="costs" class="c-fields"></div><label>Target margin (%) — optional scenario only<input name="targetMarginBasisPoints" type="number" min="0" max="99.99" step="0.01"></label><button class="c-button" type="submit">Review scenario — do not publish</button></form><pre id="result" role="status" aria-live="polite"></pre></section><section class="c-card"><h2>Unconfirmed shipping reference</h2><pre id="shipping"></pre><p>The pasted schedule is not verified current Signs365 policy. Zones, increments, applicable products and mixed-cart aggregation must be confirmed.</p></section></main></body></html>`;
const script = `'use strict';
const labels = { materialMinor:'Material before waste (USD)', finishingMinor:'Finishing total (USD)', laborMinutes:'Labor time (whole minutes)', laborHourlyMinor:'Labor rate (USD/hour)', wasteBasisPoints:'Additional material waste (%)', packagingMinor:'Packaging (USD)', freightMinor:'Freight (USD)', collectionFixedMinor:'Collection fixed fee (USD)', collectionBasisPoints:'Collection variable fee (%)' };
let data;
fetch('/proposals').then(r=>r.json()).then(d=>{ data=d; const select=document.getElementById('product'); d.variants.forEach(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.name;select.append(o)}); const show=()=>document.getElementById('proposal').textContent=JSON.stringify(d.variants.find(v=>v.id===select.value).retailProposal,null,2)+'\\nAmounts ending in Minor are USD cents; BasisPoints are 1/100 percent.'; select.addEventListener('change',show);show();document.getElementById('shipping').textContent=JSON.stringify(d.shippingProposal,null,2);d.costFields.forEach(key=>{const label=document.createElement('label');label.textContent=labels[key];const input=document.createElement('input');input.name=key;input.type='number';input.min='0';input.step=key==='laborMinutes'?'1':'0.01';label.append(input);document.getElementById('costs').append(label)})});
document.getElementById('scenario').addEventListener('submit',async event=>{event.preventDefault(); const form=new FormData(event.currentTarget); const amount=key=>form.get(key)===''?null:Math.round(Number(form.get(key))*(key==='laborMinutes'?1:100)); const body={revenueMinor:amount('revenueMinor'),costs:Object.fromEntries(data.costFields.map(k=>[k,amount(k)])),targetMarginBasisPoints:amount('targetMarginBasisPoints')}; try {const response=await fetch('/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();document.getElementById('result').textContent=JSON.stringify(result,null,2)+'\\nReview only. This never changes a catalog, quote, deposit or payment.';}catch{document.getElementById('result').textContent='Local review unavailable; no scenario saved.'}});
`;
async function startPrivateReview({ port = 3215 } = {}) {
    const server = http.createServer(async (req, res) => {
        const origin = `http://127.0.0.1:${server.address().port}`;
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
        // Host validation also rejects browser DNS-rebinding access to loopback.
        if (req.headers.host !== `127.0.0.1:${server.address().port}`) return json(403, { error: 'local_host_required' });
        try {
            if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html); }
            if (req.method === 'GET' && req.url === '/review.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(script); }
            if (req.method === 'GET' && req.url === '/proposals') return json(200, { variants, shippingProposal, costFields });
            if (req.method === 'GET' && /^\/(css\/styles\.css|fonts\/[\w.-]+\.woff2)$/.test(req.url)) {
                const bytes = await fs.readFile(path.join(root, req.url.slice(1)));
                res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'font/woff2' }); return res.end(bytes);
            }
            if (req.method === 'POST' && req.url === '/scenario') {
                if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return json(403, { error: 'local_origin_required' });
                const chunks = []; let size = 0;
                for await (const chunk of req) { size += chunk.length; if (size > 8192) return json(413, { error: 'too_large' }); chunks.push(chunk); }
                const input = JSON.parse(Buffer.concat(chunks).toString());
                return json(200, reviewMargin(input));
            }
            return json(404, { error: 'not_found' });
        } catch { return json(422, { error: 'invalid_scenario', message: 'Check explicit costs, revenue and target. No values were saved.' }); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
module.exports = { startPrivateReview };
if (require.main === module) startPrivateReview().then(({ origin }) => console.log('Private local review: ' + origin)).catch(() => { console.error('Private review could not bind its localhost port.'); process.exitCode = 1; });
