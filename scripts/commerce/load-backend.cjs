'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
async function loadBackend(crmRoot = process.env.CRM_TEST_ROOT) {
    if (!crmRoot) throw new Error('Set CRM_TEST_ROOT to the reviewed PR #32 checkout.');
    const requireCrm = createRequire(path.join(crmRoot, 'package.json'));
    const esbuild = requireCrm('esbuild');
    const boundary = path.join(__dirname, 'preview-boundary.ts');
    const mocks = new Set(['lib/commerce/server/store', 'lib/commerce/server/finix-provider',
        'lib/firebase/admin', 'lib/leads/server/intake', 'lib/leads/server/api-key-auth']);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-commerce-bundle-'));
    const outfile = path.join(temp, 'backend.cjs');
    await esbuild.build({
        stdin: { contents: `export { POST } from ${JSON.stringify(path.join(crmRoot, 'app/api/v1/tenants/[tenantSlug]/commerce/[operation]/route.ts'))}; export * from ${JSON.stringify(boundary)};`, resolveDir: crmRoot, loader: 'ts' },
        outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
        plugins: [{ name: 'isolated-boundaries', setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
                if (args.path === 'next/server') return { path: boundary };
                const full = args.path.startsWith('@/') ? args.path.slice(2)
                    : args.path.startsWith('.') && args.importer.startsWith(crmRoot)
                        ? path.relative(crmRoot, path.resolve(path.dirname(args.importer), args.path)).replace(/\.ts$/, '') : null;
                if (full && mocks.has(full)) return { path: boundary };
                if (args.path.startsWith('@crm/')) return { path: path.join(crmRoot, args.path.slice(5) + '.ts') };
                if (full && args.path.startsWith('@/')) return { path: path.join(crmRoot, full + '.ts') };
                if (!args.path.startsWith('.') && !path.isAbsolute(args.path) && !args.path.startsWith('node:')) return { path: requireCrm.resolve(args.path), external: true };
            });
        } }]
    });
    const backend = require(outfile);
    backend.request = async (operation, serializedBody, token) => {
        const response = await backend.POST(new Request('http://isolated/api/v1/tenants/canvas_advertising/commerce/' + operation, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || 'preview_server_only') }, body: serializedBody
        }), { params: Promise.resolve({ tenantSlug: 'canvas_advertising', operation }) });
        const envelope = await response.json();
        Object.defineProperty(envelope, 'httpStatus', { value: response.status });
        return envelope;
    };
    return backend;
}
module.exports = { loadBackend };
