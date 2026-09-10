'use strict';

const CRM_ROUTE_PREFIX = '/api/v1/tenants/';
const CRM_ROUTE_SUFFIX = '/leads/intake';
const DEFAULT_TIMEOUT_MS = 8000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const TEST_SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

// This translation is intentionally explicit. It is a proposed Canvas-to-CRM
// mapping and still requires confirmation against the deployed tenant allowlist.
const SERVICE_MAPPING = Object.freeze({
    // Canonical keys from CANVAS_VISUAL_PRODUCTION_PRESET; historical aliases remain valid.
    'vehicle_wraps': 'Vehicle Wraps',
    'vinyl_large_format_printing': 'Vinyl & Large-Format Printing',
    'window_graphics': 'Perforated Window Vinyl / Storefront Glass',
    'wall_murals': 'Wall Murals & Interior Vinyl',
    'contour_cut_decals': 'Contour-Cut Decals',
    'cutting_lamination': 'Cutting & Lamination',
    'print_collateral': 'Flyers & Business Cards (Secondary)',
    'wholesale_printing': 'Print Partner / Wholesale Vinyl Printing',
    'wrap_production_only': 'Wrap Production Only',
    'vehicle-wraps': 'Vehicle Wraps',
    'vehicle-wrap': 'Vehicle Wraps',
    'partial-wrap': 'Vehicle Wraps',
    'color-change': 'Vehicle Wraps',
    'fleet': 'Vehicle Wraps',
    'fleet-wrap': 'Vehicle Wraps',
    'van': 'Vehicle Wraps',
    'truck': 'Vehicle Wraps',
    'box-truck': 'Vehicle Wraps',
    'food-truck': 'Vehicle Wraps',
    'food-trailer': 'Vehicle Wraps',
    'concession-trailer': 'Vehicle Wraps',
    'large-format': 'Vinyl & Large-Format Printing',
    'Vinyl Print Production': 'Vinyl & Large-Format Printing',
    'Print and Ship Vinyl Production': 'Vinyl & Large-Format Printing',
    'perforated-window-vinyl': 'Perforated Window Vinyl / Storefront Glass',
    'storefront-signage': 'Perforated Window Vinyl / Storefront Glass',
    'interior-branding': 'Wall Murals & Interior Vinyl',
    'decals': 'Contour-Cut Decals',
    'lamination-cutting': 'Cutting & Lamination',
    'cutting-only': 'Cutting & Lamination',
    'short-run-digital': 'Flyers & Business Cards (Secondary)',
    'print-partner': 'Print Partner / Wholesale Vinyl Printing',
    'full-service': 'Print Partner / Wholesale Vinyl Printing',
    'wrap-production': 'Wrap Production Only',
    'other': 'Other',
    'General Inquiry': 'Other',
    'WhatsApp Inquiry': 'Other',
    'Marine and Boat Wraps': 'Other',
    'Basic Visibility Package': 'Other',
    'Private Feedback': 'Other'
});

const RETRYABLE_CODES = new Set(['rate_limited', 'internal_error']);
const ACCEPTED_CODES = new Set(['created', 'duplicate_ignored', 'rejected_spam']);

function hasValue(value) {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

function timestampToIso(value, fallbackIso) {
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
    return fallbackIso;
}

function trackingValue(tracking, ...keys) {
    for (const key of keys) {
        if (typeof tracking?.[key] === 'string' && tracking[key].trim()) return tracking[key].trim();
    }
    return '';
}

function buildRequestMapping(leadId, leadData, submittedAtIso = new Date().toISOString()) {
    const requestedService = SERVICE_MAPPING[leadData.service] || '';
    const unsupportedFields = [];
    const flag = (field, value, reason) => {
        if (hasValue(value)) unsupportedFields.push({ field, reason });
    };

    flag('businessName', leadData.businessName, 'CRM intake has no business-name field.');
    flag('businessType', leadData.businessType, 'CRM intake has no business-type field.');
    flag('website', leadData.website, 'CRM website is a honeypot and must remain empty.');
    flag('projectType', leadData.projectType, 'No matching CRM intake field.');
    flag('materialType', leadData.materialType, 'No matching CRM intake field.');
    flag('finishType', leadData.finishType, 'No matching CRM intake field.');
    flag('quantity', leadData.quantity, 'No matching CRM intake field.');
    flag('deliveryMethod', leadData.deliveryMethod, 'No matching CRM intake field.');
    flag('productionNotes', leadData.productionNotes, 'No matching CRM intake field.');
    flag('method', leadData.method, 'No matching CRM intake field.');
    flag('coverage', leadData.coverage, 'No matching CRM intake field.');
    flag('vehicleSize', leadData.vehicleSize, 'No exact vehicle make/model mapping.');
    flag('wrapFinish', leadData.wrapFinish, 'No exact wrap-style mapping approved.');
    flag('customWidth', leadData.customWidth, 'No matching CRM intake field.');
    flag('customHeight', leadData.customHeight, 'No matching CRM intake field.');
    flag('productionSummary', leadData.productionSummary, 'No matching CRM intake field.');
    flag('productionRequest', leadData.productionRequest, 'Nested project object is not accepted.');
    flag('visibilityPackage', leadData.visibilityPackage, 'Nested project and privacy-consent fields are not accepted.');
    flag('boatSurvey', leadData.boatSurvey, 'Nested boat/project fields are not accepted; only explicit SMS consent and preferred contact are mapped.');
    flag('fileUploads', leadData.fileUploads, 'CRM intake does not accept upload metadata.');

    if (!requestedService) {
        unsupportedFields.push({
            field: 'service',
            reason: `No approved CRM service mapping for ${String(leadData.service || '(empty)')}.`
        });
    }

    const tracking = leadData.tracking || {};
    const firstName = String(leadData.firstName || '').trim();
    const lastName = String(leadData.lastName || '').trim();
    const fullName = String(leadData.name || [firstName, lastName].filter(Boolean).join(' ')).trim();
    const preferredContactMethod = String(leadData.boatSurvey?.contactMethod || '').trim().toLowerCase();
    const body = {
        fullName,
        firstName,
        lastName,
        email: String(leadData.email || '').trim(),
        phone: String(leadData.phone || '').trim(),
        requestedService,
        estimatedBudget: leadData.estimatedPrice ?? null,
        desiredTimeline: String(leadData.deadline || leadData.boatSurvey?.timeframe || '').trim(),
        message: String(leadData.message || '').trim(),
        preferredContactMethod: ['phone', 'text', 'email'].includes(preferredContactMethod)
            ? preferredContactMethod
            : '',
        marketingConsent: false,
        smsConsent: leadData.productionRequest?.version === 1
            ? leadData.productionRequest.smsConsent === true
            : leadData.boatSurvey?.smsConsent === true,
        attribution: {
            pageUrl: String(leadData.page || '').trim(),
            landingPage: String(leadData.sourcePage || leadData.page || '').trim(),
            utmSource: trackingValue(tracking, 'utm_source', 'utmSource'),
            utmMedium: trackingValue(tracking, 'utm_medium', 'utmMedium'),
            utmCampaign: trackingValue(tracking, 'utm_campaign', 'utmCampaign'),
            utmContent: trackingValue(tracking, 'utm_content', 'utmContent'),
            utmTerm: trackingValue(tracking, 'utm_term', 'utmTerm'),
            gclid: trackingValue(tracking, 'gclid'),
            referrer: String(leadData.referrer || '').trim()
        },
        submittedAt: timestampToIso(leadData.createdAt, submittedAtIso),
        sourceSystem: 'canvas-advertising.com',
        externalDocId: leadId,
        turnstileVerified: null,
        website: '',
        ...(leadData.communications?.communicationPolicyVersion === 1 ? {
            notificationOwner: leadData.communications.notificationOwner,
            communicationPolicyVersion: 1,
            capturedAt: leadData.communications.capturedAt,
            testSuppressed: leadData.communications.testSuppressed === true,
            ...(leadData.communications.transitionId ? { transitionId: leadData.communications.transitionId } : {})
        } : {})
    };

    return {
        body,
        serializedBody: JSON.stringify(body),
        unsupportedFields,
        serviceMapping: {
            canvasValue: String(leadData.service || ''),
            crmValue: requestedService,
            confirmed: false
        }
    };
}

function idempotencyKeyFor(leadId) {
    return `canvas-lead:${leadId}`;
}

function endpointFor(baseUrl, tenantSlug) {
    return `${String(baseUrl).replace(/\/$/, '')}${CRM_ROUTE_PREFIX}${encodeURIComponent(tenantSlug)}${CRM_ROUTE_SUFFIX}`;
}

function bearerCredential(keyId, secret) {
    return `mk_live_${keyId}.${secret}`;
}

function testSubmissionGate(config, leadId) {
    const configuredId = String(config.testSubmissionId || '');
    if (!configuredId) return { authorized: false, reason: 'test-submission-id-missing' };
    if (!TEST_SUBMISSION_ID_PATTERN.test(configuredId)) {
        return { authorized: false, reason: 'test-submission-id-invalid' };
    }
    if (configuredId !== String(leadId || '')) {
        return { authorized: false, reason: 'test-submission-id-mismatch' };
    }
    return { authorized: true, reason: 'test-submission-authorized' };
}

function isSyntheticTestSubmission(config, leadId, source, serverAuthorized = false) {
    return source === 'crm_integration_test'
        && serverAuthorized === true
        && testSubmissionGate(config, leadId).authorized;
}

function readiness(config, leadId, serverAuthorized = false) {
    if (config.legacyForwardingEnabled === true) return { ready: false, reason: 'legacy-forwarding-must-remain-disabled' };
    let mode = 'general';
    if (config.enabled !== true) {
        const testGate = testSubmissionGate(config, leadId);
        if (!testGate.authorized) return { ready: false, reason: testGate.reason };
        if (serverAuthorized !== true) return { ready: false, reason: 'test-authorization-missing' };
        mode = 'test-only';
    }
    if (!config.baseUrl) return { ready: false, reason: 'base-url-missing' };
    if (!config.tenantSlug) return { ready: false, reason: 'tenant-slug-missing' };
    if (!config.keyId || !config.secret) return { ready: false, reason: 'credential-missing' };
    if (config.serviceAllowlistConfirmed !== true) return { ready: false, reason: 'service-allowlist-unconfirmed' };
    return { ready: true, reason: 'ready', mode };
}

function isClaimable(delivery, nowMs) {
    if (delivery.status === 'accepted' || delivery.status === 'failed') return false;
    if (delivery.status === 'processing') {
        const lease = delivery.processingLeaseExpiresAt;
        const leaseMs = lease && typeof lease.toMillis === 'function' ? lease.toMillis() : Number(lease || 0);
        return leaseMs <= nowMs;
    }
    const next = delivery.nextAttemptAt;
    const nextMs = next && typeof next.toMillis === 'function' ? next.toMillis() : Number(next || 0);
    return !nextMs || nextMs <= nowMs;
}

function classifyResponse(status, body) {
    const code = typeof body?.code === 'string' ? body.code : '';
    const accepted = body?.ok === true && ACCEPTED_CODES.has(code)
        && ((status === 201 && code !== 'duplicate_ignored') || (status === 200 && code === 'duplicate_ignored'))
        && typeof body?.data?.leadId === 'string' && body.data.leadId.length > 0;
    if (accepted) return { outcome: 'accepted', code, duplicate: code === 'duplicate_ignored', data: body.data };
    if (status === 409 && code === 'idempotency_conflict') return { outcome: 'conflict', code };
    if (status === 422 || status === 400 || status === 401 || status === 403) {
        return { outcome: 'failed', code: code || `http_${status}`, errors: body?.errors || [] };
    }
    if (status === 429 || status >= 500 || RETRYABLE_CODES.has(code)) return { outcome: 'retry', code: code || `http_${status}` };
    return { outcome: 'failed', code: code || `http_${status}` };
}

async function postSerializedDelivery(options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
        const response = await options.fetchImpl(endpointFor(options.baseUrl, options.tenantSlug), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.credential}`,
                'Idempotency-Key': options.idempotencyKey
            },
            body: options.serializedBody,
            signal: controller.signal
        });
        const raw = await response.text();
        let body;
        try {
            body = JSON.parse(raw);
        } catch (error) {
            return { outcome: response.status >= 500 ? 'retry' : 'failed', code: 'invalid_response_json', status: response.status };
        }
        return { ...classifyResponse(response.status, body), status: response.status, response: body };
    } catch (error) {
        return {
            outcome: 'retry',
            code: error?.name === 'AbortError' ? 'timeout' : 'network_error',
            error: String(error?.message || error)
        };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    PROCESSING_LEASE_MS,
    SERVICE_MAPPING,
    bearerCredential,
    buildRequestMapping,
    classifyResponse,
    endpointFor,
    idempotencyKeyFor,
    isSyntheticTestSubmission,
    isClaimable,
    postSerializedDelivery,
    readiness,
    testSubmissionGate
};
