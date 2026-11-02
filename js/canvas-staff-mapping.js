(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CanvasStaffMapping = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    const VERSION = 'canvas-staff-catalog-mapping.proposal.v1';
    const SOURCE = 'canvas-commerce-configuration-source.v1';
    // Technical identifiers only. Prices remain server-owned; unpriced options
    // may be prepared for review, never converted into an accepted zero total.
    const options = {
        canvas: ['print', 'contour', 'installed', 'installed_contour'],
        premium: ['print', 'contour', 'installed', 'installed_contour'],
        ppf: ['print', 'contour', 'installed', 'installed_contour'],
        oneway: ['print', 'contour', 'installed', 'installed_contour'],
        dualway: ['print', 'contour', 'installed', 'installed_contour'],
        banner: ['package', 'print'], mesh: ['package', 'print'],
        acrylic: ['blank', 'printed', 'cut', 'installed', 'other'], yard: ['confirmed', 'other']
    };
    const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
    const scalarText = value => typeof value === 'string' && [...value].every(character => {
        const cp = character.codePointAt(0); return cp < 0xd800 || cp > 0xdfff;
    });
    const record = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(key => keys.includes(key));
    const exactOptions = (a, b) => Object.keys(a).length === Object.keys(b).length
        && Object.entries(a).every(([key, value]) => typeof value === 'string' && b[key] === value);
    const freeze = value => {
        if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    };
    function inches(value, unit) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw Error('dimensions');
        const text = String(value);
        if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) throw Error('dimensions');
        const [whole, fraction = ''] = text.split('.');
        let n = BigInt(whole + fraction), d = 10n ** BigInt(fraction.length);
        const factors = { in: [1n, 1n], ft: [12n, 1n], cm: [50n, 127n], mm: [5n, 127n], m: [5000n, 127n] };
        if (!Object.hasOwn(factors, unit)) throw Error('units');
        n *= factors[unit][0]; d *= factors[unit][1];
        let result = String(n / d), remainder = n % d;
        if (remainder) {
            result += '.';
            for (let i = 0; i < 6 && remainder; i++) {
                remainder *= 10n; result += String(remainder / d); remainder %= d;
            }
        }
        // No rounding of specifications to make them fit the draft contract.
        if (remainder || !/^\d{1,9}(\.\d{1,6})?$/.test(result)) throw Error('exact_inches_required');
        return result;
    }
    function map(source, mapping, assignments) {
        const problems = [];
        const refuse = (path, reason) => problems.push({ path, reason });
        if (!record(source, ['version', 'authority', 'catalogVersion', 'status', 'reason', 'items'])
            || source.version !== SOURCE || source.authority !== 'browser_editable_configuration_only'
            || source.status !== 'configuration_only' || source.reason !== null
            || !Array.isArray(source.items) || source.items.length < 1 || source.items.length > 50
            || Array.from(source.items).some(item => item === undefined))
            return freeze({ status: 'review_required', problems: [{ path: 'source', reason: 'Current supported configuration required; no partial order is mapped' }] });
        if (!record(mapping, ['version', 'catalogVersion', 'profiles']) || mapping.version !== VERSION
            || typeof mapping.catalogVersion !== 'string' || mapping.catalogVersion !== source.catalogVersion
            || !Array.isArray(mapping.profiles) || mapping.profiles.length < 1 || mapping.profiles.length > 100)
            return freeze({ status: 'review_required', problems: [{ path: 'mapping', reason: 'Explicit reviewed mapping for this catalog version required' }] });
        if (!Array.isArray(assignments) || assignments.length !== source.items.length)
            return freeze({ status: 'review_required', problems: [{ path: 'assignments', reason: 'One explicit job/design/placement assignment per item required' }] });
        for (const profile of mapping.profiles) {
            if (!record(profile, ['sourceProductId', 'sourceOptions', 'product', 'option'])
                || !id(profile.sourceProductId) || !record(profile.sourceOptions, Object.keys(profile.sourceOptions || {}))
                || !Object.values(profile.sourceOptions).every(scalarText)
                || !id(profile.product) || !id(profile.option) || !Object.hasOwn(options, profile.product) || !options[profile.product].includes(profile.option))
                refuse('mapping.profiles', 'Unsupported mapping; no product or price is inferred');
        }
        const assignmentIds = new Set();
        for (const a of assignments) {
            if (!record(a, ['lineItemId', 'jobId', 'designId', 'placementId', 'installHeightFeet', 'specialInstallation', 'specialGrommets'])
                || !['lineItemId', 'jobId', 'designId', 'placementId'].every(k => id(a[k]))
                || assignmentIds.has(a.lineItemId)
                || !(a.installHeightFeet === null || (typeof a.installHeightFeet === 'string' && /^\d{1,9}(\.\d{1,6})?$/.test(a.installHeightFeet)))
                || typeof a.specialInstallation !== 'boolean' || typeof a.specialGrommets !== 'boolean')
                refuse('assignments', 'Stable unique identities and explicit installation review fields required');
            if (a && typeof a === 'object') assignmentIds.add(a.lineItemId);
        }
        if (problems.length) return freeze({ status: 'review_required', problems });
        const rows = [], artworkActions = [], itemIds = new Set();
        source.items.forEach((item, index) => {
            const path = `items[${index}]`;
            if (!record(item, ['lineItemId', 'productId', 'configuration']) || !id(item.lineItemId) || !id(item.productId)
                || itemIds.has(item.lineItemId)) { refuse(path, 'Stable unique item identity required'); return; }
            itemIds.add(item.lineItemId);
            const c = item.configuration;
            if (!record(c, ['quantity', 'options', 'variants', 'artworkMode', 'designBrief', 'notes', 'dimensions'])
                || !Number.isSafeInteger(c.quantity) || c.quantity < 1 || c.quantity > 100000
                || !record(c.options, Object.keys(c.options || {})) || !Object.values(c.options).every(v => typeof v === 'string')
                || !Array.isArray(c.variants) || c.variants.length !== 0
                || !['later', 'now', 'design_help'].includes(c.artworkMode)
                || !['designBrief', 'notes'].every(k => c[k] === undefined || scalarText(c[k]))
                || !record(c.dimensions, ['width', 'height', 'unit'])) {
                refuse(path, 'Unsupported specification or artwork plan; apparel/variants are outside this mapping'); return;
            }
            const matches = mapping.profiles.filter(p => p.sourceProductId === item.productId && exactOptions(p.sourceOptions, c.options));
            const a = assignments.find(a => a.lineItemId === item.lineItemId);
            if (matches.length !== 1 || !a) { refuse(path, 'Exactly one explicit product/option mapping and assignment required'); return; }
            let width, height;
            try { width = inches(c.dimensions.width, c.dimensions.unit); height = inches(c.dimensions.height, c.dimensions.unit); }
            catch { refuse(path + '.dimensions', 'Enter exact inches; conversion cannot be rounded silently'); return; }
            const brief = c.designBrief || '', note = c.notes || '';
            const notes = brief && note ? `[Design brief]\n${brief}\n[Notes]\n${note}` : brief || note;
            if ([...notes].length > 2000 || new TextEncoder().encode(notes).length > 8000) {
                refuse(path + '.notes', 'Combined brief/notes exceed the draft limit; retain and review without truncation'); return;
            }
            rows.push({ id: item.lineItemId, jobId: a.jobId, product: matches[0].product, option: matches[0].option,
                width, height, quantity: c.quantity, design: a.designId, placement: a.placementId, notes,
                installHeight: a.installHeightFeet, specialInstallation: a.specialInstallation,
                specialGrommets: a.specialGrommets, artwork: null });
            artworkActions.push({ itemId: item.lineItemId, mode: c.artworkMode, sourcePreserved: false });
        });
        if (problems.length) return freeze({ status: 'review_required', problems });
        return freeze({ status: 'prepared_configuration_only', rows, artworkActions });
    }
    return Object.freeze({ version: VERSION, map });
});
