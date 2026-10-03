'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
for (const locale of ['en', 'es']) test('commerce ' + locale + ': semantic page, exact phone, metadata and deferred scripts', () => {
    const slug = locale === 'en' ? 'store' : 'store-es';
    const document = new JSDOM(fs.readFileSync(path.join(root, slug + '.html'), 'utf8')).window.document;
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.documentElement.lang, locale);
    assert.equal(document.querySelector('link[rel=canonical]').href, 'https://canvas-advertising.com/' + slug);
    for (const selector of ['meta[name=description]', 'meta[property="og:title"]', 'meta[property="og:description"]',
        'meta[property="og:type"]', 'meta[property="og:url"]', 'meta[property="og:image"]', 'meta[property="og:locale"]',
        'meta[name="twitter:card"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'meta[name="twitter:image"]']) assert.ok(document.querySelector(selector)?.content);
    assert.ok(document.querySelector(`a[href="tel:+1512${locale === 'en' ? '4343793' : '9459783'}"]`));
    assert.ok([...document.scripts].every((script) => script.defer));
    assert.equal(document.querySelectorAll('[onclick]').length, 0);
    assert.equal(document.querySelector('[data-commerce-preview]'), null, 'Test marker must not be hosted');
    assert.equal(document.querySelector('script[src*="square"]'), null);
    assert.ok(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('https://canvas-advertising.com/' + slug));
});
test('commerce private persistence has no client allow rule and no anonymous Firebase login is added', () => {
    const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    assert.ok(!rules.includes('canvas_commerce_private'));
    const script = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8').split('// Commerce uses the website proxy,')[1];
    assert.ok(!script.includes('signInAnonymously'));
    assert.ok(!script.includes('mk_live_'));
    assert.ok(!script.includes('MERKAD_COMMERCE_API_KEY'));
});
