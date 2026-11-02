(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./canvas-staff-mapping'));
    else root.CanvasStaffAssignments = factory(root.CanvasStaffMapping);
})(typeof globalThis === 'object' ? globalThis : this, function (mapper) {
    'use strict';
    function mount(host, { enabled = false, language = 'en', readConfiguration, mapping }) {
        const doc = host.ownerDocument, t = (en, es) => language === 'es' ? es : en;
        const section = doc.createElement('section'); section.className = 'c-card c-panel';
        const heading = doc.createElement('h2'), notice = doc.createElement('p'), status = doc.createElement('p'), rows = doc.createElement('div');
        heading.textContent = t('Assign configured items', 'Asignar artículos configurados');
        notice.textContent = t('Local preparation only. Assign each line to its job, unique design and placement. The server still verifies staff access and saved artwork associations. No price, upload or draft is accepted here.', 'Solo preparación local. Asigna cada artículo a su trabajo, diseño único y ubicación. El servidor verifica el acceso y las asociaciones guardadas. Aquí no se acepta un precio, archivo ni borrador.');
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.className = 'c-button'; refresh.dataset.canvasAction = 'load-staff-assignments';
        refresh.textContent = t('Load current configured items', 'Cargar artículos configurados actuales'); refresh.disabled = !enabled;
        section.append(heading, notice, refresh, rows, status); host.append(section);
        Object.assign(section.style, { minWidth: '0', maxWidth: '100%', overflowWrap: 'anywhere' });
        let controls = new Map(), fingerprint = null, disposed = false;
        const values = () => [...controls].map(([lineItemId, c]) => ({ lineItemId, jobId: c.jobId.value, designId: c.designId.value, placementId: c.placementId.value,
            installHeightFeet: c.height.value === '' ? null : c.height.value,
            specialInstallation: c.installation.checked, specialGrommets: c.grommets.checked }));
        function load() {
            if (!enabled || disposed) return;
            try {
                const source = readConfiguration();
                if (source?.status !== 'configuration_only' || !Array.isArray(source.items) || source.items.length < 1 || source.items.length > 50
                    || Array.from(source.items).some(i => !i || typeof i.lineItemId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(i.lineItemId))
                    || new Set(source.items.map(i => i.lineItemId)).size !== source.items.length) throw Error('Unsupported source');
                const previous = new Map(values().map(v => [v.lineItemId, v])), next = new Map(), fragment = doc.createDocumentFragment();
                for (const item of source.items) {
                    const row = doc.createElement('fieldset'), legend = doc.createElement('legend'); row.dataset.canvasItem = item.lineItemId;
                    legend.textContent = `${t('Item', 'Artículo')}: ${item.lineItemId}`; row.append(legend);
                    Object.assign(row.style, { minWidth: '0', maxWidth: '100%', overflowWrap: 'anywhere' });
                    const old = previous.get(item.lineItemId), c = {};
                    for (const [key, en, es] of [['jobId', 'Job ID', 'ID del trabajo'], ['designId', 'Unique design ID', 'ID del diseño único'], ['placementId', 'Placement ID', 'ID de ubicación'], ['height', 'Installation height (feet; unknown if blank)', 'Altura de instalación (pies; desconocida si está vacía)']]) {
                        const label = doc.createElement('label'), input = doc.createElement('input'); input.type = 'text'; input.maxLength = 120; input.dataset.assignment = key;
                        label.textContent = t(en, es); input.value = key === 'height' ? old?.installHeightFeet ?? '' : old?.[key] ?? '';
                        if (key !== 'height') { input.required = true; input.pattern = '[A-Za-z0-9_-]{1,120}'; }
                        label.append(input); row.append(label); c[key] = input;
                    }
                    for (const [key, en, es] of [['installation', 'Special installation requires review', 'La instalación especial requiere revisión'], ['grommets', 'Special grommet or mounting requirements', 'Requisitos especiales de ojillos o montaje']]) {
                        const label = doc.createElement('label'), input = doc.createElement('input'); label.className = 'c-check'; input.type = 'checkbox'; input.dataset.assignment = key;
                        input.checked = key === 'installation' ? old?.specialInstallation ?? false : old?.specialGrommets ?? false;
                        label.append(input, doc.createTextNode(t(en, es))); row.append(label); c[key] = input;
                    }
                    next.set(item.lineItemId, c); fragment.append(row);
                }
                fingerprint = JSON.stringify(source); controls = next; rows.replaceChildren(fragment);
                status.textContent = t('Enter every assignment explicitly. Duplicate lines do not inherit another design. Shipping, tax and special work remain for review.', 'Ingresa cada asignación expresamente. Los duplicados no heredan otro diseño. Envío, impuestos y trabajos especiales siguen pendientes de revisión.');
            } catch { fingerprint = null; status.textContent = t('Current configuration requires review; retained local entries were not accepted or written to CRM.', 'La configuración requiere revisión; los datos locales conservados no se aceptaron ni guardaron en CRM.'); }
        }
        refresh.onclick = load;
        status.textContent = enabled ? t('Load configured items to enter explicit assignments.', 'Carga los artículos para ingresar asignaciones.') : t('Staff assignment preparation disabled.', 'Preparación de asignaciones desactivada.');
        return {
            read() {
                if (!enabled || disposed || !fingerprint) return { status: 'review_required', problems: [{ path: 'assignments', reason: 'Load current configuration explicitly' }] };
                try {
                    const source = readConfiguration();
                    if (JSON.stringify(source) !== fingerprint) return { status: 'review_required', problems: [{ path: 'source', reason: 'Configuration changed; refresh assignments before preparing a new review' }] };
                    return mapper.map(source, mapping, values());
                } catch { return { status: 'review_required', problems: [{ path: 'source', reason: 'Current configuration could not be verified' }] }; }
            },
            refresh: load,
            dispose() { disposed = true; section.remove(); }
        };
    }
    return Object.freeze({ mount });
});
