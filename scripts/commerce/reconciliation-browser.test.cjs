'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startPreview } = require('./preview-server.cjs');

for (const brokenLink of ['quote', 'work-order']) test(
    'captured deposit with broken ' + brokenLink + ' binding stays on staff review across reload',
    { skip: !process.env.CRM_TEST_ROOT, timeout: 90000 }, async () => {
    const preview = await startPreview({ port: 0 });
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    let browser;
    try {
        browser = await requireCrm('playwright').chromium.launch({ headless: true, channel: 'chrome' });
        const page = await browser.newPage();
        page.setDefaultTimeout(15000);
        let failNextOrder = false;
        let interruptedRead = false;
        let holdNextOrder = false;
        let releaseOldOrder;
        let oldOrderReady;
        const oldOrderCaptured = new Promise((resolve) => { oldOrderReady = resolve; });
        const oldOrderGate = new Promise((resolve) => { releaseOldOrder = resolve; });
        await page.context().route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== preview.origin) return route.abort();
            if (url.pathname !== '/api/commerce' || request.method() !== 'POST') return route.continue();
            const operation = request.postDataJSON()?.operation;
            if (operation === 'order' && holdNextOrder) {
                holdNextOrder = false;
                const response = await route.fetch();
                const snapshot = await response.json();
                assert.equal(snapshot.result.workOrderReconciliationRequired, undefined);
                oldOrderReady();
                await oldOrderGate;
                return route.fulfill({ response, headers: { ...response.headers(), 'x-fixture-old-order': 'true' } });
            }
            if (operation === 'order' && failNextOrder) {
                failNextOrder = false;
                interruptedRead = true;
                return route.fulfill({ status: 503, json: { ok: false, code: 'temporarily_unavailable' } });
            }
            if (operation !== 'payment') return route.continue();
            const response = await route.fetch();
            if ((await response.json()).result?.workOrderReconciliationRequired === true) failNextOrder = true;
            return route.fulfill({ response });
        });
        const store = preview.backend.store;
        const root = 'tenants/canvas_test/';
        store.data.get(root + 'commerceConfig/catalog').paymentPolicy = { mode: 'deposit', depositBasisPoints: 5000 };
        const count = (collection) => [...store.data.keys()].filter((key) => key.includes('/' + collection + '/')).length;
        const paymentRequests = [];
        page.on('request', (request) => {
            if (request.url() === preview.origin + '/api/commerce' && request.postDataJSON()?.operation === 'payment')
                paymentRequests.push(request);
        });
        const es = brokenLink === 'work-order';
        const labels = {
            add: es ? 'Agregar al pedido' : 'Add to order',
            price: es ? 'Obtener precio autorizado' : 'Get authoritative price',
            checkout: es ? 'Crear pedido y continuar al pago' : 'Create order & continue to payment',
            pay: es ? 'Pagar de forma segura' : 'Pay securely',
            lose: es ? 'Perder siguiente respuesta de pago (probar reintento)' : 'Lose next payment response (test retry)',
            retry: es ? 'Conciliar intento de pago original' : 'Reconcile saved payment attempt',
            refresh: es ? 'Actualizar estado autorizado' : 'Refresh authoritative status',
        };
        const enMessage = 'Payment received. Our team is reviewing your order. Please do not pay again. Production is on hold.';
        const esMessage = 'Recibimos tu pago. Nuestro equipo está revisando tu pedido. No vuelvas a pagar. La producción está en pausa.';
        const paymentControls = /pay securely|pay remaining balance|start a new payment|reconcile saved payment attempt|pagar de forma segura|pagar saldo restante|iniciar otro pago|conciliar intento de pago original/i;
        await page.goto(preview.origin + (es ? '/store-es' : '/store'));
        await page.getByRole('button', { name: labels.add, exact: true }).click();
        await page.getByRole('button', { name: labels.price, exact: true }).click();
        await page.locator('#commerce-contact [name=terms]').check();
        await page.getByRole('button', { name: labels.checkout, exact: true }).click();
        await page.getByRole('button', { name: labels.pay, exact: true }).waitFor();
        const orderId = await page.evaluate(() => localStorage.getItem('canvas_commerce_last_order_v1'));
        const order = store.data.get(root + 'commerceOrders/' + orderId);
        assert.ok(order.requiredMinor > 0 && order.requiredMinor < order.totalMinor);
        assert.equal(count('workOrders'), 0);
        // Corrupt only the fixture association. Keep the quote and its lines readable.
        const quoteKey = root + 'quotes/' + order.quoteId;
        const quote = store.data.get(quoteKey);
        store.data.set(quoteKey, brokenLink === 'quote'
            ? { ...quote, commerce: { ...quote.commerce, orderId: 'wrong_order_fixture' } }
            : { ...quote, workOrderId: 'unrelated_work_order_fixture' });
        await page.getByRole('button', { name: labels.lose, exact: true }).click();
        await page.getByRole('button', { name: labels.pay, exact: true }).click();
        const retry = page.getByRole('button', { name: labels.retry, exact: true });
        await retry.waitFor();
        holdNextOrder = true;
        await page.getByRole('button', { name: labels.refresh, exact: true }).click();
        await oldOrderCaptured;
        await retry.click();
        const holder = page.locator('#commerce-order');
        const assertReview = async () => {
            await holder.getByText(es ? esMessage : enMessage, { exact: true }).waitFor();
            assert.equal(await holder.getByRole('button', { name: paymentControls }).count(), 0);
            assert.equal(await holder.getByText(/ready for staff production release|listo para liberación de producción/i).count(), 0);
        };
        await assertReview();
        if (!interruptedRead) await page.waitForResponse((response) => response.url() === preview.origin + '/api/commerce' && response.status() === 503).catch((error) => {
            if (!interruptedRead) throw error;
        });
        assert.equal(interruptedRead, true, 'payment response must lock the view even when the next order read fails');
        const staleReply = page.waitForResponse((response) => response.headers()['x-fixture-old-order'] === 'true');
        releaseOldOrder();
        await (await staleReply).finished();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await assertReview();
        await page.reload();
        await assertReview();
        await holder.getByRole('button', { name: labels.refresh, exact: true }).click();
        await assertReview();
        await page.goto(preview.origin + (es ? '/store' : '/store-es'));
        await holder.getByText(es ? enMessage : esMessage, { exact: true }).waitFor();
        assert.equal(await holder.getByRole('button', { name: paymentControls }).count(), 0);
        const captured = store.data.get(root + 'commerceOrders/' + orderId);
        assert.equal(captured.financial, 'paid');
        assert.equal(captured.capturedMinor, order.requiredMinor);
        assert.equal(captured.workOrderReconciliationRequired, true);
        assert.equal(paymentRequests.length, 2, 'only the original attempt and its exact recovery');
        assert.equal(paymentRequests[0].postDataJSON().attemptId, paymentRequests[1].postDataJSON().attemptId);
        assert.equal(preview.backend.controls.submits, 1);
        assert.equal(count('payments'), 0, 'held capture must not post to the quote payment ledger');
        assert.equal(count('captureEvidence'), 1, 'verified capture is isolated on the original attempt');
        assert.equal(count('workOrders'), 0);
        assert.equal(preview.mailbox.length, 0);
    } finally {
        await browser?.close();
        preview.server.closeAllConnections();
        await new Promise((resolve) => preview.server.close(resolve));
    }
});
