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
    const png = await requireCrm('sharp')({ create: { width: 120, height: 80, channels: 3, background: '#e63946' } }).png().toBuffer();
    await page.locator('[name=referenceFile]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: png });
    await page.locator('.c-artboard img').waitFor();
    assert.equal(preview.backend.objects.size, 0, 'local reference must not create durable/assigned artwork');
    assert.equal(await page.locator('.c-action-dock button').isDisabled(), true);
    for (const width of [320, 375, 414, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow at ' + width);
        assert.equal(await page.locator('.c-action-dock').evaluate((el) => getComputedStyle(el).position), width <= 768 ? 'fixed' : 'sticky');
        await page.screenshot({ path: '/private/tmp/canvas-commerce-' + width + '.png', fullPage: true });
    }
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.locator('#commerce-config [name=designBrief]').fill('Synthetic draft survives refresh');
    await page.reload();
    await page.getByRole('button', { name: 'Add to order', exact: true }).waitFor();
    assert.equal(await page.locator('#commerce-config [name=designBrief]').inputValue(), 'Synthetic draft survives refresh');
    assert.equal(await page.locator('.c-artboard img').count(), 0, 'local reference is not a durable asset');
    assert.equal(await page.locator('.c-action-dock button').isDisabled(), true);
    // Edit/duplicate preserve distinct item identities without cross-linked art.
    await page.locator('#commerce-config [name=quantity]').fill('2');
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    assert.ok((await page.locator('.c-action-dock').innerText()).includes('price not confirmed'));
    await page.getByRole('button', { name: 'Duplicate as a separate item', exact: true }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
    const editingId = await page.locator('#commerce-app').getAttribute('data-edit-line-item');
    await page.reload();
    await page.getByRole('button', { name: 'Save configuration', exact: true }).waitFor();
    assert.equal(await page.locator('#commerce-app').getAttribute('data-edit-line-item'), editingId);
    await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
    assert.equal(await page.locator('.c-line').count(), 1, 'restored edit must update the same item rather than duplicate it');
    await page.locator('#commerce-config [name=quantity]').fill('1');
    await page.getByRole('button', { name: 'Add to order', exact: true }).click();
    await page.getByRole('button', { name: 'Get authoritative price', exact: true }).click();
    await page.locator('#commerce-checkout').waitFor({ state: 'visible' });
    assert.ok((await page.locator('.c-action-dock').innerText()).includes('$81.19'));
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
    const items = await page.locator('[data-line-item]').evaluateAll((elements) => elements.map((el) => el.dataset.lineItem));
    for (let i = 0; i < items.length; i++) {
        for (const assignment of i === 0 ? ['designA', 'designB'] : ['main']) {
            const form = page.locator('[data-line-item="' + items[i] + '"] form');
            await form.locator('[name=assignment]').fill(assignment);
            await form.locator('[name=allocation]').fill('1');
            await form.locator('[name=artwork]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await form.getByRole('button', { name: 'Upload to this purchased item', exact: true }).click();
            await page.getByText('File received for the selected item/design. Staff review is still required.', { exact: true }).waitFor();
            // The same announcement from the previous upload is not a barrier.
            // Wait for authoritative refresh to replace the form (empty file
            // input), otherwise the next design can be filled into a stale form.
            await page.waitForFunction((id) => {
                const input = document.querySelector('[data-line-item="' + id + '"] [name=artwork]');
                return input && input.files.length === 0;
            }, items[i]);
        }
    }
    await page.getByRole('button', { name: 'Simulate staff preparation / revised proofs', exact: true }).click();
    await page.getByRole('button', { name: 'Request changes', exact: true }).first().waitFor();
    await page.locator('.c-proof-grid img').nth(2).waitFor();
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
    spanish.on('pageerror', (error) => pageErrors.push(error.message));
    await spanish.goto(preview.origin + '/store-es');
    await spanish.getByRole('button', { name: 'Agregar al pedido', exact: true }).waitFor();
    await spanish.setViewportSize({ width: 375, height: 900 });
    assert.equal(await spanish.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await spanish.locator('#commerce-config [name=quantity]').fill('3');
    await spanish.getByRole('button', { name: 'Agregar al pedido', exact: true }).click();
    await spanish.getByRole('button', { name: 'Editar configuración', exact: true }).click();
    const activeCatalog = preview.backend.store.data.get('tenants/canvas_test/commerceConfig/catalog');
    activeCatalog.products[0].capacityApproved = false;
    await spanish.reload();
    await spanish.getByText('Este producto requiere cotización o no está disponible.', { exact: true }).waitFor();
    assert.equal(await spanish.locator('#commerce-config [type=submit]').count(), 0, 'unavailable draft must not offer purchase');
    assert.deepEqual(pageErrors, [], 'unavailable restored edit must not crash initialization');
    // MemoryStore transactions replace snapshots: mutate the current fixture,
    // not the stale object retained across the preceding HTTP request.
    const nextCatalog = preview.backend.store.data.get('tenants/canvas_test/commerceConfig/catalog');
    nextCatalog.products[0].capacityApproved = true; nextCatalog.version = 'changed_catalog';
    await spanish.reload();
    await spanish.getByText('Cambió el catálogo. No se aplicó el borrador anterior; elige las opciones actuales.', { exact: true }).waitFor();
    assert.equal(await spanish.locator('#commerce-config [name=quantity]').inputValue(), '1');
    await spanish.screenshot({ path: '/private/tmp/canvas-commerce-es.png', fullPage: true });
});
