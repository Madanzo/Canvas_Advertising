'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { startPreview } = require('./preview-server.cjs');
test('staff and buyer browsers → website → actual CRM: unpaid draft, durable originals, handoff and purchase',
    { skip: !process.env.CRM_TEST_ROOT }, async (t) => {
    const p = await startPreview({ port: 0 });
    t.after(() => new Promise((resolve) => p.server.close(resolve)));
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const browser = await requireCrm('playwright').chromium.launch({ headless: true, channel: 'chrome' });
    t.after(() => browser.close());
    p.backend.store.data.get('tenants/canvas_test/commerceConfig/catalog').paymentPolicy = { mode: 'deposit', depositBasisPoints: 5000 };
    const errors = [], foreign = [];
    const staff = await browser.newPage(), buyer = await browser.newPage();
    for (const page of [staff, buyer]) {
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/*', (route) => {
            if (new URL(route.request().url()).origin !== p.origin) { foreign.push(route.request().url()); return route.abort(); }
            return route.continue();
        });
        await page.goto(p.origin + '/store');
        await page.getByRole('button', { name: 'Add to order', exact: true }).waitFor();
    }
    const noPurchase = () => assert.equal([...p.backend.store.data.keys()].filter((k) =>
        /\/(payments|commercePaymentAttempts|commerceOrders|invoices|leads|workOrders)\//.test(k)).length, 0);
    const login = async () => {
        await staff.locator('#commerce-staff summary').click();
        await staff.getByRole('button', { name: 'Sign in with CRM Google account', exact: true }).click();
        await staff.getByRole('button', { name: 'Create customer explicitly', exact: true }).waitFor();
    };
    await login();
    await staff.locator('#commerce-staff [name=firstName]').fill('Synthetic');
    await staff.locator('#commerce-staff [name=lastName]').fill('Staff Buyer');
    await staff.locator('#commerce-staff [name=email]').fill('buyer@example.com');
    await staff.locator('#commerce-staff [name=phone]').fill('5125550106');
    await staff.getByRole('button', { name: 'Create customer explicitly', exact: true }).click();
    await staff.getByText('Synthetic Staff Buyer', { exact: true }).waitFor();
    for (const page of [staff, buyer]) {
        await page.locator('#commerce-config [name=quantity]').fill('2');
        await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    }
    const original = p.service.transport; let lose = 'staff-quote';
    p.service.transport = async (...args) => {
        const result = await original(...args);
        if (args[0] === lose && result.ok) { lose = null; throw Error('lost committed response'); }
        return result;
    };
    await staff.getByRole('button', { name: 'Get authoritative price', exact: true }).click();
    await staff.getByText(/The response is uncertain/).waitFor();
    await staff.reload(); await staff.getByRole('button', { name: 'Add to order', exact: true }).waitFor();
    await login();
    await staff.getByRole('button', { name: 'Recover pending staff request', exact: true }).click();
    await staff.locator('#commerce-draft').waitFor();
    const quoteId = await staff.locator('#commerce-draft > .c-order-id').innerText();
    const staffTotal = await staff.locator('#commerce-draft .c-total').innerText();
    assert.equal(await staff.locator('#commerce-checkout').isVisible(), false);
    lose = 'quote';
    await buyer.getByRole('button', { name: 'Get authoritative price', exact: true }).click();
    await buyer.getByText(/The response is uncertain/).waitFor();
    await buyer.getByRole('button', { name: 'Get authoritative price', exact: true }).click();
    await buyer.locator('#commerce-draft').waitFor();
    assert.equal(await buyer.locator('#commerce-draft .c-total').innerText(), staffTotal);
    assert.equal([...p.backend.store.data.keys()].filter((k) => /^tenants\/canvas_test\/quotes\/[^/]+$/.test(k)).length, 2, 'one draft per channel after response loss');
    noPurchase();
    const png = await requireCrm('sharp')({ create: { width: 120, height: 80, channels: 3, background: '#e63946' } }).png().toBuffer();
    const art = staff.locator('#commerce-draft article form').first();
    await art.locator('[name=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await art.locator('[name=assignment]').fill('designA'); await art.locator('[name=quantity]').fill('1');
    await art.getByRole('button', { name: 'Save original artwork', exact: true }).click();
    await staff.getByText(/front · designA · 1 · synthetic.png · Received/).waitFor();
    const originalAssets = [...p.backend.store.data.keys()].filter((k) => /commerceDraftUploads/.test(k));
    assert.equal(originalAssets.length, 1);
    await staff.reload(); await staff.getByRole('button', { name: 'Add to order', exact: true }).waitFor(); await login();
    await staff.locator('#commerce-staff [name=quoteId]').fill(quoteId);
    await staff.getByRole('button', { name: 'Open staff draft', exact: true }).click();
    await staff.getByText(/front · designA · 1 · synthetic.png · Received/).waitFor();
    for (const width of [320, 375, 414, 768, 1024, 1440]) {
        await staff.setViewportSize({ width, height: 1000 });
        assert.equal(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'staff overflow at ' + width);
        if (width <= 1024) {
            // Navigation intentionally hides while scrolling down. Bring it
            // back before exercising its real pointer/touch-sized control.
            await staff.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await staff.waitForFunction(() => document.querySelector('#navToggle').getBoundingClientRect().top >= 0);
            assert.equal(await staff.locator('#navMenu').evaluate((el) => getComputedStyle(el).visibility), 'hidden');
            await staff.locator('#navToggle').click();
            assert.equal(await staff.locator('#navToggle').getAttribute('aria-expanded'), 'true');
            await staff.locator('#navToggle').click();
        }
        if ([375, 1440].includes(width)) await staff.screenshot({ path: '/private/tmp/canvas-staff-' + width + '.png', fullPage: true });
    }
    await buyer.getByText('Open a saved draft / receive a staff quote', { exact: true }).click();
    await buyer.getByRole('button', { name: 'Generate my buyer handoff ticket', exact: true }).click();
    await buyer.locator('[data-buyer-ticket]').waitFor();
    const ticket = await buyer.locator('[data-buyer-ticket]').innerText();
    await staff.locator('#commerce-draft [name=buyerTicket]').fill(ticket);
    await staff.getByRole('button', { name: 'Assign this exact draft to buyer', exact: true }).click();
    await staff.getByText(/Assigned. Buyer must open/).waitFor();
    await buyer.locator('details [name=quoteId]').fill(quoteId);
    await buyer.getByRole('button', { name: 'Open my saved draft', exact: true }).click();
    await buyer.getByText(/front · designA · 1 · synthetic.png · Received/).waitFor();
    const buyerArt = buyer.locator('#commerce-draft article form').first();
    await buyerArt.locator('[name=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await buyerArt.locator('[name=assignment]').fill('designA'); await buyerArt.locator('[name=quantity]').fill('1');
    await buyerArt.getByRole('button', { name: 'Save original artwork', exact: true }).click();
    await buyerArt.locator('[name=file]').waitFor();
    assert.equal([...p.backend.store.data.keys()].filter((k) => /commerceDraftUploads/.test(k)).length, 1, 'buyer retry keeps staff artwork identity');
    noPurchase();
    await buyer.locator('#commerce-contact [name=terms]').check();
    await buyer.getByRole('button', { name: 'Create order & continue to payment', exact: true }).click();
    await buyer.getByText('Payment: unpaid', { exact: true }).waitFor();
    assert.equal(p.backend.controls.submits, 0);
    assert.equal([...p.backend.store.data.keys()].filter((k) => /\/commerceOrders\//.test(k)).length, 1);
    assert.equal([...p.backend.store.data.keys()].filter((k) => /\/contacts\//.test(k)).length, 1);
    assert.ok((await buyer.locator('#commerce-order').innerText()).includes('Payment holds production'));
    assert.deepEqual(errors, []); assert.deepEqual(foreign, []);
    assert.equal(await staff.evaluate(() => Object.keys(localStorage).some((k) => /token|password/i.test(k))), false);
});
