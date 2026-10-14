// TEST ONLY: controlled boundaries around CRM's ACTUAL exported POST handler.
import { MemoryStore } from '@crm/lib/commerce/server/memory-store.test-helper';
import { fixtureCatalog } from '@crm/lib/commerce/fixtures';
import { stockKey } from '@crm/lib/commerce/server/catalog';
export const store = new MemoryStore();
export const objects = new Map<string, any>();
export const uploads = new Map<string, string>();
export const transfers = new Map<string, any>();
export const controls = { origin: 'http://127.0.0.1:3210', losePaymentResponse: false, submits: 0, revokedStaff: false };
// Synthetic token edges only; real Auth acceptance belongs to the demo emulator.
export const staffTokens = Object.fromEntries(['admin', 'quotes_only', 'contacts_only', 'outsider'].map((role) =>
    [role, 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ sub: 'preview_' + role })).toString('base64url') + '.isolated']));
let demoDb: any, demoAuth: any;
export function setIsolatedAdmin(db: any, auth: any) {
    if (process.env.GCLOUD_PROJECT !== 'demo-canvas-commerce-isolated'
        || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8186'
        || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9186') throw Error('Local demo emulators required');
    demoDb = db; demoAuth = auth;
}
store.data.set('tenants/canvas_test', { productionStages: [{ key: 'print' }, { key: 'finished' }],
    rolePermissions: { quotes_only: ['quotes'], contacts_only: ['contacts'] } });
const catalog = fixtureCatalog();
const sample = catalog.products[0];
// Explicitly synthetic extensions exercise the configurator modes. These NEVER
// seed a deployed catalog, and neither availability nor prices are operational.
for (const [productId, family, en, es] of [
    ['mesh', 'mesh', 'Test mesh', 'Malla de prueba'],
    ['decal', 'decal', 'Test decal', 'Calcomanía de prueba'],
    ['rigid', 'rigid', 'Test rigid sign', 'Letrero rígido de prueba'],
    ['transfer', 'transfer', 'Test transfer pack', 'Paquete de transferencias de prueba'],
    ['apparel', 'apparel', 'Test apparel matrix', 'Matriz de prendas de prueba']
]) {
    const product = structuredClone(sample);
    Object.assign(product, { productId, family, name: { en, es } });
    if (productId === 'rigid') product.mode = 'piece';
    if (productId === 'transfer') { product.mode = 'pack'; product.unitsPerPack = 5; }
    if (productId === 'apparel') {
        product.mode = 'garment_matrix';
        product.garmentStock = ['black', 'white'].flatMap((color) => ['S', 'M', 'L', 'XL'].map((size) => ({ sku: 'test_shirt', color, size, available: 20, surchargeMinor: 0 })));
        for (const variant of product.garmentStock) store.data.set('tenants/canvas_test/commerceStock/' + stockKey(productId, variant.sku, variant.color, variant.size), { onHand: 20, reserved: 0 });
    }
    catalog.products.push(product);
}
store.data.set('tenants/canvas_test/commerceConfig/catalog', catalog);
store.data.set('tenants/canvas_test/commerceConfig/access', { enabled: true, staffDraftsEnabled: true, paymentMode: 'sandbox', finixSandboxVerified: true, legacySquareDisabled: true });
export class FirestoreCommerceStore {
    transaction<T>(callback: any) { return store.transaction<T>(callback); }
    findContacts(...args: Parameters<MemoryStore['findContacts']>) { return store.findContacts(...args); }
}
export function getAdminDb() {
    if (demoDb) return demoDb;
    return { doc: (path: string) => ({ get: async () => {
        const role = Object.keys(staffTokens).find((r) => path.endsWith('/members/preview_' + r));
        const data = path.endsWith('/members/preview_staff') ? { role: 'admin' }
            : role && role !== 'outsider' ? { role }
                : path.endsWith('/settings/roles') ? { rolePermissions: { quotes_only: ['quotes'], contacts_only: ['contacts'] } }
                    : store.data.get(path);
        return { exists: Boolean(data), data: () => data };
    } }) };
}
export function getAdminAuth() { if (demoAuth) return demoAuth; return { verifyIdToken: async (token: string, revoked: boolean) => {
    if (!revoked || controls.revokedStaff) throw new Error('unauthorized');
    if (token === 'preview_staff_only') return { uid: 'preview_staff' };
    const role = Object.keys(staffTokens).find((r) => staffTokens[r] === token);
    if (!role) throw new Error('unauthorized'); return { uid: 'preview_' + role };
} }; }
export async function resolveTenantBySlug(_db: any, slug: string) { return slug === 'canvas_advertising' ? { id: 'canvas_test' } : null; }
export async function authenticateIntake({ headers, requiredScope }: any) {
    return requiredScope === 'commerce:session' && headers.get('authorization') === 'Bearer preview_server_only'
        ? { ok: true, keyId: 'preview_website', method: 'bearer' } : { ok: false, reason: 'no_credential' };
}
export const NextResponse = { json: (value: any, init?: any) => Response.json(value, init) };
export class FinixSandboxProvider {
    async prepare() { return { instrumentId: 'PIisolated', merchantId: 'MUisolated', feeMinor: 0, feeSnapshot: { simulated: true } }; }
    async submit(attempt: any) {
        controls.submits++;
        const result = { id: 'TR' + attempt.id, merchant: attempt.merchantId, amount: attempt.amountMinor,
            currency: 'USD', source: attempt.instrumentId, idempotencyId: attempt.providerKey, state: 'SUCCEEDED',
            type: 'DEBIT', refundedMinor: 0, refundReferences: [] };
        transfers.set(attempt.providerKey, result);
        if (controls.losePaymentResponse) { controls.losePaymentResponse = false; throw new Error('simulated lost provider response'); }
        return result;
    }
    async lookup(attempt: any) { return transfers.get(attempt.providerKey) || null; }
}
export function getCommerceBucket() {
    return { file: (key: string) => ({
        createResumableUpload: async ({ metadata }: any) => {
            uploads.set(metadata.metadata.uploadSessionId, key);
            if (!objects.has(key)) objects.set(key, { bytes: Buffer.alloc(0), contentType: metadata.contentType,
                metadata: metadata.metadata, generation: '1', complete: false });
            return [controls.origin + '/preview-upload/' + metadata.metadata.uploadSessionId];
        },
        getMetadata: async () => {
            const object = objects.get(key); if (!object?.complete) throw new Error('upload incomplete');
            return [{ size: object.bytes.length, contentType: object.contentType, generation: object.generation, metadata: object.metadata }];
        },
        download: async () => { const object = objects.get(key); if (!object?.complete) throw new Error('not found'); return [object.bytes]; },
        save: async (bytes: Buffer, { metadata }: any) => {
            if (objects.has(key)) throw Object.assign(new Error('exists'), { code: 412 });
            objects.set(key, { bytes, contentType: metadata.contentType, generation: '1', complete: true });
        },
        getSignedUrl: async () => [controls.origin + '/preview-asset/' + Buffer.from(key).toString('base64url')]
    }) };
}
