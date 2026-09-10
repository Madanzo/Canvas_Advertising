"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
// Only allow the review surface; never serve secrets, source, or a production submission endpoint.
const mock = `window.__quotePreview={calls:[],saved:new Map()};window.firebase={SDK_VERSION:'10.12.2',apps:[],initializeApp(){this.apps.push({});},firestore(){return {};},auth(){return {};},appCheck:Object.assign(function(){return {activate(){},async getToken(){return {token:'local-mock-token'};}}},{ReCaptchaEnterpriseProvider:class{}}),functions(){return {httpsCallable(name){return async function(payload){window.__quotePreview.calls.push({name,payload});if(name==='createLeadUploadSession'){const submissionId=crypto.randomUUID();return {data:{submissionId,token:'local-only',files:payload.files.map((f,i)=>({...f,fileId:'file'+i,safeName:f.name})),expiresAt:Date.now()+900000}};}const id=payload.submissionId;const duplicate=window.__quotePreview.saved.has(id);window.__quotePreview.saved.set(id,payload);return {data:{ok:true,id,duplicate}};};}};},storage(){return {ref(){return {child(p){return {async put(){},async getDownloadURL(){return 'http://127.0.0.1:4173/mock-upload/'+encodeURIComponent(p);}};}};}};}};`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  let file =
    pathname === "/" || pathname === "/quote"
      ? "/quote.html"
      : pathname === "/quote-es"
        ? "/quote-es.html"
        : pathname;
  if (
    ![
      "/quote.html",
      "/quote-es.html",
      "/css/styles.css",
      "/js/main.js",
      "/js/firebase-config.js",
      "/favicon.png",
    ].includes(file)
  ) {
    res.writeHead(404);
    res.end("Not in isolated preview");
    return;
  }
  let body = fs.readFileSync(root + file);
  const ext = path.extname(file);
  res.setHeader(
    "Content-Type",
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
    }[ext],
  );
  res.setHeader("Cache-Control", "no-store");
  if (ext === ".html") {
    body = body
      .toString()
      .replace(
        /<script\b[^>]*src="https:\/\/(?:www\.gstatic\.com|www\.googletagmanager\.com)[^"]*"[^>]*><\/script>/g,
        "",
      )
      .replace(
        '<script defer src="/js/firebase-config.js',
        `<script>${mock}</script><script defer src="/js/firebase-config.js`,
      )
      .replace(
        '<body class="quote-page">',
        '<body class="quote-page"><div style="padding:.5rem;text-align:center;background:#161a18;color:white;font:14px sans-serif">LOCAL PREVIEW · SIMULATED SUBMISSIONS · NO EMAIL OR SMS</div>',
      );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'none'; frame-src 'none'",
    );
  }
  res.end(body);
});
server.listen(4173, "127.0.0.1", () =>
  console.log("Local quote preview: http://127.0.0.1:4173/quote"),
);
