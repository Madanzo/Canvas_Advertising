"use strict";
// The legacy endpoint must never inherit authorization from a configured URL/key.
function createLegacyLeadHandler({ enabled, configuration, fetch, logger = console }) {
    return async (snapshot, context) => {
        if (enabled() !== true) return null;
        const config = configuration();
        if (!config.url) return null;
        const leadId = context.params.leadId;
        const payload = { id: leadId, eventType: 'lead.created', timestamp: new Date().toISOString(), data: snapshot.data() };
        const headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
        try {
            const response = await fetch(config.url, {method:'POST', headers, body:JSON.stringify(payload)});
            if (!response.ok) throw new Error(`CRM returned status ${response.status}`);
            logger.log(`Legacy CRM accepted lead ${leadId}`);
        } catch (error) {
            logger.error(`Legacy CRM failed for lead ${leadId}`, error);
        }
        return null;
    };
}
function runtimeHandler(env, fetch) {
    return createLegacyLeadHandler({
        // Both controls default false. URL presence and historical test grants do not enable this trigger.
        enabled: () => env.CRM_LEAD_ADAPTER_ENABLED === 'true' && env.CRM_LEGACY_FORWARDING_ENABLED === 'true',
        // No removed functions.config() access. Configuration is read only after the gate.
        configuration: () => ({url:env.CRM_API_URL, apiKey:env.CRM_API_KEY}),
        fetch
    });
}
module.exports = { createLegacyLeadHandler, runtimeHandler };
