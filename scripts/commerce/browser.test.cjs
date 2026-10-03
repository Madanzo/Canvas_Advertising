'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startPreview } = require('./preview-server.cjs');

test('browser storefront → website HTTP → actual CRM handler: configuration, retries, files, proof revisions and responsive EN/ES',
    { skip: !process.env.CRM_TEST_ROOT }, async (t) => {
    const preview = await startPreview({ port: 3212 });
    t.after(() => new Promise((resolve) => preview.server.close(resolve)));
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const { chromium } = requireCrm('playwright');
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const foreignRequests = []; const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== preview.origin) { foreignRequests.push(url.origin); return route.abort(); }
        return route.continue();
    });
    await page.goto(preview.origin + '/store');
    await page.getByRole('button', { name: 'Add to order', exact: true }).waitFor();
    for (const width of [320, 375, 414, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow at ' + width);
        await page.screenshot({ path: '/private/tmp/canvas-commerce-' + width + '.png', fullPage: true });
    }
    await page.setViewportSize({ width: 1024, height: 1000 });
    // Edit/duplicate preserve distinct item identities without cross-linked art.
    await page.locator('#commerce-config [name=quantity]').fill('2');
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    await page.getByRole('button', { name: 'Duplicate as a separate item', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
    await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
    await page.locator('#commerce-config [name=quantity]').fill('1');
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    await page.getByRole('button', { name: 'Get authoritative price', exact: true }).click();
    await page.locator('#commerce-checkout').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#commerce-quote').innerText()).includes('$81.19'));
    await page.locator('#commerce-contact [name=terms]').check();
    await page.getByRole('button', { name: 'Create order & continue to payment', exact: true }).click();
    await page.getByRole('button', { name: 'Pay securely', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Lose next payment response (test retry)', exact: true }).click();
    await page.getByRole('button', { name: 'Pay securely', exact: true }).click();
    await page.getByRole('button', { name: 'Reconcile saved payment attempt', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Reconcile saved payment attempt', exact: true }).click();
    await page.getByText('Payment: paid', { exact: true }).waitFor();
    assert.equal(preview.backend.controls.submits, 1);
    assert.ok((await page.locator('#commerce-order').innerText()).includes('Artwork required'));
    await page.reload(); await page.getByText('Payment: paid', { exact: true }).waitFor();
    const png = await requireCrm('sharp')({ create: { width: 120, height: 80, channels: 3, background: '#e63946' } }).png().toBuffer();
    const items = await page.locator('[data-line-item]').evaluateAll((elements) => elements.map((el) => el.dataset.lineItem));
    for (let i = 0; i < items.length; i++) {
        for (const assignment of i === 0 ? ['designA', 'designB'] : ['main']) {
            const form = page.locator('[data-line-item="' + items[i] + '"] form');
            await form.locator('[name=assignment]').fill(assignment);
            await form.locator('[name=allocation]').fill('1');
            await form.locator('[name=artwork]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await form.getByRole('button', { name: 'Upload to this purchased item', exact: true }).click();
            await page.getByText('File received for the selected item/design. Staff review is still required.', { exact: true }).waitFor();
            await form.locator('[name=artwork]').waitFor();
        }
    }
    await page.getByRole('button', { name: 'Simulate staff preparation / revised proofs', exact: true }).click();
    await page.getByRole('button', { name: 'Request changes', exact: true }).first().waitFor();
    assert.equal(await page.locator('.c-proof-grid img').count(), 3);
    await page.getByRole('button', { name: 'Request changes', exact: true }).first().click();
    await page.getByText('Proof decision: changes_requested', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Simulate staff preparation / revised proofs', exact: true }).click();
    await page.getByRole('button', { name: 'Approve complete proof', exact: true }).first().waitFor();
    // Consent to the entire grouped final set, not only the primary preview.
    for (const id of items) {
        const article = page.locator('[data-line-item="' + id + '"]');
        await article.locator('[name=proof_reviewed]').check();
        await article.getByRole('button', { name: 'Approve complete proof', exact: true }).click();
        await article.getByText('Ready for staff production release', { exact: true }).waitFor();
    }
    await page.screenshot({ path: '/private/tmp/canvas-commerce-approved.png', fullPage: true });
    const orderId = await page.evaluate(() => localStorage.getItem('canvas_commerce_last_order_v1'));
    await page.locator('#commerce-recovery [name=orderId]').fill(orderId);
    await page.locator('#commerce-recovery [name=email]').fill('canvas-preview@example.com');
    await page.getByRole('button', { name: 'Send private link', exact: true }).click();
    await page.getByRole('link', { name: 'Open simulated private email', exact: true }).click();
    await page.getByText('Recovered access is limited to this order.', { exact: true }).waitFor();
    assert.equal(await page.locator('.c-grid').isVisible(), false);
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.equal(foreignRequests.length, 0, 'Preview must make NO non-local requests');
    assert.deepEqual(pageErrors, []);
    const spanish = await browser.newPage();
    await spanish.goto(preview.origin + '/store-es');
    await spanish.getByRole('button', { name: 'Agregar al pedido', exact: true }).waitFor();
    await spanish.setViewportSize({ width: 375, height: 900 });
    assert.equal(await spanish.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await spanish.screenshot({ path: '/private/tmp/canvas-commerce-es.png', fullPage: true });
});
