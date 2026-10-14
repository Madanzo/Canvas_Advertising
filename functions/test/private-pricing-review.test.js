'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { variants, shippingProposal, costFields, reviewMargin, readiness } = require('../../scripts/commerce/private-pricing-review.cjs');
const costs = { materialMinor: 1000, finishingMinor: 200, laborMinutes: 30, laborHourlyMinor: 2000,
    wasteBasisPoints: 1000, packagingMinor: 100, freightMinor: 500, collectionFixedMinor: 30, collectionBasisPoints: 290 };
test('14 original variants preserve retail proposals, never manufacture costs or approval', () => {
    assert.equal(variants.length, 14); assert.equal(new Set(variants.map(v => v.id)).size, 14);
    for (const v of variants) {
        assert.equal(v.published, false); assert.equal(readiness(v).publishable, false);
        for (const key of costFields) assert.equal(v.costs[key], null);
        assert.equal(v.policyApproval.minimumInterpretation, null);
    }
    assert.ok(!variants.some(v => /transfer|apparel/.test(v.id)));
    assert.equal(variants.find(v => v.id === 'acrylic').retailProposal.rateMinor, 50);
});
test('yard tier boundaries preserve every supplied price without invented discounts', () => {
    const expected = [[4400,3300,3000],[5500,4400,4000],[7000,6000,5500],[9000,7500,6500]];
    variants.filter(v => v.id.startsWith('yard_')).forEach((v,i) => {
        assert.deepEqual(v.retailProposal.tiers.map(t => t.rateMinor), expected[i]);
        assert.deepEqual(v.retailProposal.tiers.map(t => [t.from,t.through]), [[1,9],[10,50],[51,null]]);
        assert.equal(v.retailProposal.stakesIncluded, null);
    });
});
test('conflicting area/charge minimums and unconfirmed shipping stay explicit', () => {
    const v = variants.find(v => v.id === 'decal_canvas');
    assert.equal(v.retailProposal.statedMinimumSqFt, 50);
    assert.equal(v.retailProposal.statedMinimumChargeMinor, 10000);
    assert.equal(shippingProposal.increments, null); assert.equal(shippingProposal.applicability, null);
    assert.equal(shippingProposal.rows.length, 6);
});
test('all private cost components contribute; tax excluded revenue basis remains explicit', () => {
    const r = reviewMargin({ revenueMinor: 10000, costs, targetMarginBasisPoints: 5000 });
    assert.equal(r.wasteMinor, 100); assert.equal(r.laborMinor, 1000);
    assert.equal(r.fixedCostMinor, 2930); assert.equal(r.totalCostMinor, 3220);
    assert.equal(r.contributionMinor, 6780); assert.equal(r.marginBasisPoints, 6780);
    assert.ok((r.scenarioRevenueMinor - 2930 - Math.ceil(r.scenarioRevenueMinor * .029)) / r.scenarioRevenueMinor >= .5);
});
test('unknown cost differs from explicitly approved zero; no partial margin claim', () => {
    for (const field of costFields) {
        const r = reviewMargin({ revenueMinor: 10000, costs: { ...costs, [field]: null } });
        assert.equal(r.status, 'incomplete'); assert.deepEqual(r.missing, [field]); assert.equal(r.totalCostMinor, null);
    }
    const zero = Object.fromEntries(costFields.map(k => [k, 0]));
    assert.equal(reviewMargin({ revenueMinor: 100, costs: zero }).marginBasisPoints, 10000);
});
test('negative margin and whole-cent labor/collection rounding are visible', () => {
    assert.ok(reviewMargin({ revenueMinor: 100, costs }).marginBasisPoints < 0);
    const r = reviewMargin({ revenueMinor: 101, costs: { ...costs, laborMinutes: 1, laborHourlyMinor: 100 } });
    assert.equal(r.laborMinor, 2); assert.equal(r.collectionVariableMinor, 3);
});
test('malformed costs, revenue and impossible target margin reject rather than default', () => {
    for (const value of [-1, 1.5, '100', NaN]) assert.throws(() => reviewMargin({ revenueMinor: 1000, costs: { ...costs, materialMinor: value } }));
    assert.throws(() => reviewMargin({ revenueMinor: 0, costs }));
    assert.throws(() => reviewMargin({ revenueMinor: 1000, costs, targetMarginBasisPoints: 9800 }), /unreachable/);
    assert.throws(() => reviewMargin({ revenueMinor: 1000, costs: { ...costs, laborMinutes: Number.MAX_SAFE_INTEGER, laborHourlyMinor: Number.MAX_SAFE_INTEGER } }), /overflow/);
});
test('even complete private review never authorizes public publication', () => {
    assert.equal(readiness({ ...variants[0], costs, costConfirmation: 'confirmed', supplierReference: 'owner-confirmed-reference',
        policyApproval: { minimumInterpretation: 'charge', yardUnitAndStakes: 'not_applicable', designFeeScope: 'per_design', shippingRules: 'pickup_only' } }).publishable, false);
    const fs = require('node:fs'); const path = require('node:path');
    const root = path.join(__dirname, '../..'); const hosting = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'))).hosting;
    assert.ok(hosting.ignore.includes('scripts/**'));
    for (const file of ['functions/index.js', 'functions/commerce-adapter.js', 'functions/commerce-http.js', 'js/main.js', 'js/firebase-config.js']) {
        assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes('private-pricing-review'), file);
    }
});
