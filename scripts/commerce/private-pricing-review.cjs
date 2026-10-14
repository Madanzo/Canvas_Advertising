'use strict';
// PRIVATE OFFLINE REVIEW ONLY. Never imported by a public handler or catalog.
// Selling quotes remain authoritative in CRM; this module estimates cost/margin
// from an explicitly supplied quote subtotal, never creates prices or payments.
const costFields = ['materialMinor', 'finishingMinor', 'laborMinutes',
    'laborHourlyMinor', 'wasteBasisPoints', 'packagingMinor', 'freightMinor',
    'collectionFixedMinor', 'collectionBasisPoints'];
const policyKeys = ['minimumInterpretation', 'yardUnitAndStakes', 'designFeeScope', 'shippingRules'];
function ceilRatio(a, b, denominator) {
    const numerator = BigInt(a) * BigInt(b), divisor = BigInt(denominator);
    const result = Number((numerator + divisor - 1n) / divisor);
    if (!Number.isSafeInteger(result)) throw new Error('cost_overflow');
    return result;
}
const blankCosts = () => Object.fromEntries(costFields.map((key) => [key, null]));
const variant = (id, name, rateMinor, unit, details = {}) => ({
    id, name, retailProposal: { rateMinor, unit, ...details },
    costs: blankCosts(), supplierReference: null, costConfirmation: 'missing',
    policyApproval: Object.fromEntries(policyKeys.map((key) => [key, null])),
    published: false
});
const variants = [
    variant('banner', 'Banner', 500, 'sq_ft', { minimumChargeMinor: 10000, designFeeMinor: 5000, options: 'one option; exact material/finish specification pending' }),
    variant('mesh', 'Mesh', 800, 'sq_ft', { minimumChargeMinor: 10000, designFeeMinor: 5000, options: 'one option; exact material/finish specification pending' }),
    variant('decal_canvas', 'Canvas PVC contour decal', 1000, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 10000, includes: ['lamination', 'contour_cut'] }),
    variant('decal_premium', '3M or Avery contour decal', 1300, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 10000, includes: ['lamination', 'contour_cut'] }),
    variant('decal_ppf', 'Evolv PPF contour decal', 1300, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 10000, includes: ['lamination', 'contour_cut'] }),
    variant('vinyl_regular', 'Regular Canvas PVC adhesive vinyl', 800, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 15000, includes: ['lamination'], facing: ['inside', 'outside'] }),
    variant('vinyl_premium', 'Premium 3M or Avery vinyl', 1000, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 15000, includes: ['lamination'] }),
    variant('perforated_one_way', 'One-way perforated window vinyl 70/30', 500, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 10000 }),
    variant('perforated_dual_way', 'Dual-way perforated window vinyl 70/30', 1000, 'sq_ft', { statedMinimumSqFt: 50, statedMinimumChargeMinor: 20000 }),
    ...[
        ['yard_4_single', '4mm single-sided yard sign', 4400, 3300, 3000],
        ['yard_4_double', '4mm double-sided yard sign', 5500, 4400, 4000],
        ['yard_10_single', '10mm single-sided yard sign', 7000, 6000, 5500],
        ['yard_10_double', '10mm double-sided yard sign', 9000, 7500, 6500]
    ].map(([id, name, first, middle, last]) => variant(id, name, first, 'sheet_unconfirmed', {
        tiers: [{ from: 1, through: 9, rateMinor: first }, { from: 10, through: 50, rateMinor: middle }, { from: 51, through: null, rateMinor: last }],
        sheetDimensions: null, stakesIncluded: null
    })),
    variant('acrylic', 'Acrylic', 50, 'sq_in', { minimumChargeMinor: 5000, sheetAreaSqIn: 4608,
        options: { contourCutBasisPoints: 1000, roundedCornersSetupMinor: 500,
            silverStandoffEachMinor: 250, blackStandoffEachMinor: 350 },
        thickness: null, contourSurchargeBasis: null, standoffQuantity: null })
];
const shippingProposal = {
    provenance: 'User-pasted proposed Signs365 schedule; not supplier-verified or approved shipping policy',
    applicability: null, zone: null, increments: null, mixedCartAggregation: null, boundaryPriority: null,
    rows: [
        { size: '24x36 and under', perThreeSheetsMinor: 1000, tenPlusSheetsMinor: 19900 },
        { size: '24x36 to 32x48', perThreeSheetsMinor: 1500, tenPlusSheetsMinor: 19900 },
        { size: '36x36 to 36x48', perThreeSheetsMinor: 3500, tenPlusSheetsMinor: 19900 },
        { size: '36x48 to 48x48', oneToFiveMinor: 5000, sixToNineMinor: 7500, tenPlusSheetsMinor: 19900 },
        { size: '39x72 or 24x96', oneToNineMinor: 7500, tenPlusSheetsMinor: 19900 },
        { size: '48x96', onePlusSheetsMinor: 19900 }
    ]
};
function validateCosts(costs) {
    const missing = costFields.filter((key) => costs?.[key] == null);
    for (const key of costFields) {
        if (costs?.[key] != null && (!Number.isSafeInteger(costs[key]) || costs[key] < 0)) throw new Error('invalid_cost:' + key);
    }
    for (const key of ['wasteBasisPoints', 'collectionBasisPoints']) {
        if (costs?.[key] >= 10000) throw new Error('invalid_cost:' + key);
    }
    return missing;
}
function reviewMargin({ revenueMinor, costs, targetMarginBasisPoints }) {
    if (!Number.isSafeInteger(revenueMinor) || revenueMinor <= 0) throw new Error('invalid_revenue');
    if (targetMarginBasisPoints != null && (!Number.isSafeInteger(targetMarginBasisPoints)
        || targetMarginBasisPoints < 0 || targetMarginBasisPoints >= 10000)) throw new Error('invalid_margin');
    const missing = validateCosts(costs);
    if (missing.length) return { status: 'incomplete', missing, totalCostMinor: null, marginBasisPoints: null };
    // Material cost supplied is before waste. Waste is extra material consumed,
    // not an unapproved retail surcharge. Labor is rounded up to a whole cent.
    const wasteMinor = ceilRatio(costs.materialMinor, costs.wasteBasisPoints, 10000);
    const laborMinor = ceilRatio(costs.laborMinutes, costs.laborHourlyMinor, 60);
    const fixedCostMinor = costs.materialMinor + wasteMinor + costs.finishingMinor + laborMinor
        + costs.packagingMinor + costs.freightMinor + costs.collectionFixedMinor;
    const collectionVariableMinor = ceilRatio(revenueMinor, costs.collectionBasisPoints, 10000);
    const totalCostMinor = fixedCostMinor + collectionVariableMinor;
    if (![fixedCostMinor, totalCostMinor].every(Number.isSafeInteger)) throw new Error('cost_overflow');
    const marginBasisPoints = Math.floor((revenueMinor - totalCostMinor) * 10000 / revenueMinor);
    let scenarioRevenueMinor = null;
    if (targetMarginBasisPoints != null) {
        const denominator = 10000 - costs.collectionBasisPoints - targetMarginBasisPoints;
        if (denominator <= 0) throw new Error('unreachable_margin');
        scenarioRevenueMinor = Math.max(1, ceilRatio(fixedCostMinor, 10000, denominator));
        // Whole-cent provider rounding can need one or more cents more than the
        // continuous formula. Enforce the exact margin inequality, not a float.
        while (BigInt(scenarioRevenueMinor - fixedCostMinor - ceilRatio(scenarioRevenueMinor, costs.collectionBasisPoints, 10000)) * 10000n
            < BigInt(scenarioRevenueMinor) * BigInt(targetMarginBasisPoints)) {
            scenarioRevenueMinor++;
            if (!Number.isSafeInteger(scenarioRevenueMinor)) throw new Error('cost_overflow');
        }
        if (!Number.isSafeInteger(scenarioRevenueMinor)) throw new Error('cost_overflow');
    }
    return { status: 'review_only', revenueMinor, wasteMinor, laborMinor, collectionVariableMinor,
        fixedCostMinor, totalCostMinor, contributionMinor: revenueMinor - totalCostMinor,
        marginBasisPoints, targetMarginBasisPoints: targetMarginBasisPoints ?? null, scenarioRevenueMinor };
}
function readiness(product) {
    const missing = [...validateCosts(product.costs).map((key) => 'costs.' + key),
        ...policyKeys.filter((key) => product.policyApproval?.[key] == null).map((key) => 'policyApproval.' + key)];
    if (product.costConfirmation !== 'confirmed' || !product.supplierReference) missing.push('confirmed_cost_reference');
    // A review is never a publishing command, even when all review inputs exist.
    return { status: missing.length ? 'blocked_inputs' : 'ready_for_owner_review', missing, publishable: false };
}
module.exports = { variants, shippingProposal, costFields, reviewMargin, readiness };
if (require.main === module) console.log(JSON.stringify({ privateReview: true, currency: 'USD',
    normalDepositBasisPoints: 5000, variants: variants.map((v) => ({ ...v, readiness: readiness(v) })), shippingProposal }, null, 2));
