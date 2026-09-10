const communicationsPolicy = require('./communications-policy');
const smsConsent = require('./sms-consent');
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const telnyx = require('telnyx');
const { Resend } = require('resend');
const firestore = require('@google-cloud/firestore');
const crypto = require('crypto');
const crmTestAuthorization = require('./crm-test-authorization');
const crmTestState = require('./crm-test-state');

// Firebase Functions v7 removed functions.config(). Legacy runtime config is
// exported into this JSON secret during deployment and exposed only to bound
// functions. Individual environment variables still take precedence.
const RUNTIME_CONFIG_SECRET = 'FUNCTIONS_CONFIG_EXPORT';
let runtimeConfigCache;

function runtimeConfig(section, key) {
    if (runtimeConfigCache === undefined) {
        try {
            runtimeConfigCache = JSON.parse(process.env[RUNTIME_CONFIG_SECRET] || '{}');
        } catch (error) {
            console.error(`${RUNTIME_CONFIG_SECRET} is not valid JSON:`, error.message);
            runtimeConfigCache = {};
        }
    }
    return runtimeConfigCache?.[section]?.[key];
}

const configuredFunctions = functions.runWith({ secrets: [RUNTIME_CONFIG_SECRET] });

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ----------------------------------------------------------------------
// INTEGRATIONS: Resend & Telnyx
// ----------------------------------------------------------------------

// 1. Get Resend Client (Lazy)
let resend = null;
function getResend() {
    if (!resend) {
        const apiKey = process.env.RESEND_API_KEY || runtimeConfig('resend', 'api_key');
        if (!apiKey) {
            console.warn('Resend API Key missing.');
            return null;
        }
        resend = new Resend(apiKey);
    }
    return resend;
}

// 2. Get Telnyx Client (Lazy)
let telnyxClient = null;
function getTelnyx() {
    if (!telnyxClient) {
        const apiKey = process.env.TELNYX_API_KEY || runtimeConfig('telnyx', 'api_key');
        if (!apiKey) {
            console.warn('Telnyx API Key missing.');
            return null;
        }
        telnyxClient = telnyx(apiKey);
    }
    return telnyxClient;
}

// 3. Get Square Client (Lazy)
let squareClient = null;
function getSquare() {
    if (!squareClient) {
        const accessToken = process.env.SQUARE_ACCESS_TOKEN || runtimeConfig('square', 'access_token');
        const environment = process.env.SQUARE_ENVIRONMENT || runtimeConfig('square', 'environment') || 'sandbox';

        if (!accessToken) {
            console.warn('Square Access Token missing. Square payments are unavailable.');
            return null;
        }

        const { SquareClient, SquareEnvironment } = require('square');
        squareClient = new SquareClient({
            token: accessToken,
            environment: environment.toLowerCase() === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
        });
    }
    return squareClient;
}

// Company Info
const COMPANY_INFO = {
    name: 'Canvas Advertising',
    phone: '(512) 434-3793',
    website: 'https://canvas-adnvertising.web.app'
};

const STORE_PRODUCTS = Object.freeze({
    "Custom Vinyl Banner (4' x 8')": 12500,
    'Die-Cut Decals (Pack of 100)': 15000,
    'Vehicle Magnet Signs (Pair)': 9500,
    'Retractable Banner + Stand': 18500
});

function validateStoreOrder(productName, priceInCents, quantity) {
    const expectedPrice = STORE_PRODUCTS[productName];
    const parsedPrice = Number(priceInCents);
    const parsedQuantity = Number(quantity);
    if (!expectedPrice || parsedPrice !== expectedPrice || parsedQuantity !== 1) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid product or price.');
    }
    return { priceInCents: expectedPrice, quantity: parsedQuantity };
}

const PUBLIC_LEAD_FIELDS = new Set([
    'submissionId', 'name', 'firstName', 'lastName', 'email', 'phone', 'service', 'message', 'source',
    'formType', 'page', 'referrer', 'landingProduct', 'sourcePage',
    'campaignSource', 'campaignMedium', 'campaignName', 'projectType',
    'projectTypeLabel', 'materialType', 'materialTypeLabel', 'finishType',
    'finishTypeLabel', 'quantity', 'deadline', 'deliveryMethod',
    'deliveryMethodLabel', 'productionNotes', 'selectedFileNames',
    'estimatedPrice', 'method', 'coverage', 'vehicleSize', 'wrapFinish',
    'customWidth', 'customHeight', 'productionSummary', 'fileUploads',
    'tracking', 'boatSurvey', 'visibilityPackage', 'productionRequest',
    'businessName', 'businessType', 'locale', 'website', 'crmTestAuthorizationToken'
]);

const CANVAS_STAFF_EMAILS = new Set([
    'camiloreyna@canvas-advertising.com',
    'camilo@canvas-advertising.com',
    'sales@canvas-advertising.com'
]);
const CRM_TEST_AUTHORIZATIONS_COLLECTION = 'crmIntegrationTestAuthorizations';

function isVerifiedCanvasStaff(context) {
    const email = String(context.auth?.token?.email || '').trim().toLowerCase();
    return context.auth?.token?.email_verified === true && CANVAS_STAFF_EMAILS.has(email);
}

const LEAD_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const LEAD_UPLOAD_MAX_FILES = 10;
const LEAD_UPLOAD_TTL_MS = 15 * 60 * 1000;
const LEAD_UPLOAD_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'application/postscript', 'application/illustrator',
    'application/vnd.adobe.illustrator', 'application/octet-stream'
]);
const LEAD_UPLOAD_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'ai', 'eps']);

function publicLeadError(message) {
    throw new functions.https.HttpsError('invalid-argument', message);
}

function sanitizePublicValue(value, path, depth = 0) {
    if (value === null || value === undefined) return null;
    if (depth > 4) publicLeadError(`${path} is too deeply nested.`);
    if (typeof value === 'string') {
        const limit = path === 'message' || path.endsWith('.notes') || path === 'productionNotes' ? 4000 : 1000;
        if (value.length > limit) publicLeadError(`${path} is too long.`);
        return value.trim();
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) publicLeadError(`${path} must be a finite number.`);
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length > 12) publicLeadError(`${path} has too many items.`);
        return value.map((item, index) => sanitizePublicValue(item, `${path}.${index}`, depth + 1));
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length > 40) publicLeadError(`${path} has too many fields.`);
        return Object.fromEntries(entries.map(([key, item]) => {
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) publicLeadError(`${path} contains an invalid field name.`);
            return [key, sanitizePublicValue(item, `${path}.${key}`, depth + 1)];
        }));
    }
    publicLeadError(`${path} contains an unsupported value.`);
}

function validatePublicLead(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        publicLeadError('Lead data must be an object.');
    }
    Object.keys(rawData).forEach((key) => {
        if (!PUBLIC_LEAD_FIELDS.has(key)) publicLeadError(`Unexpected lead field: ${key}.`);
    });

    const submissionId = String(rawData.submissionId || '');
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(submissionId)) publicLeadError('Invalid submission ID.');
    const name = String(rawData.name || '').trim();
    const service = String(rawData.service || '').trim();
    const phone = String(rawData.phone || '').trim();
    const email = String(rawData.email || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 120) publicLeadError('Enter a valid name.');
    if (!service || service.length > 160) publicLeadError('Enter a valid service.');
    const digits = phone.replace(/\D/g, '');
    if (service !== 'Private Feedback' && (digits.length < 10 || digits.length > 15)) {
        publicLeadError('Enter a valid phone number.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) publicLeadError('Enter a valid email address.');
    if (String(rawData.website || '').trim()) return { spam: true, submissionId };

    const lead = {};
    Object.entries(rawData).forEach(([key, value]) => {
        if (key !== 'website' && key !== 'submissionId' && key !== 'crmTestAuthorizationToken') {
            lead[key] = sanitizePublicValue(value, key);
        }
    });
    lead.name = name;
    lead.service = service;
    lead.phone = phone;
    lead.email = email || null;
    lead.source = crmTestAuthorization.trustedSource(rawData.source, false);
    return {
        spam: false,
        submissionId,
        lead,
        crmTestAuthorizationToken: String(rawData.crmTestAuthorizationToken || '').slice(0, 128)
    };
}

exports.createCrmIntegrationTestAuthorization = configuredFunctions.https.onCall(async (data, context) => {
    if (!isVerifiedCanvasStaff(context)) {
        throw new functions.https.HttpsError('permission-denied', 'Verified Canvas staff access is required.');
    }
    const config = crmLeadAdapterConfig();
    const submissionId = String(data?.submissionId || '');
    if (config.enabled === true || !crmLeadAdapter.testSubmissionGate(config, submissionId).authorized) {
        throw new functions.https.HttpsError('failed-precondition', 'The exact disabled-mode CRM test ID is not configured.');
    }
    const issued = crmTestAuthorization.issueAuthorization();
    const expiresAt = admin.firestore.Timestamp.fromMillis(issued.record.expiresAtMs);
    await db.collection(CRM_TEST_AUTHORIZATIONS_COLLECTION).doc(submissionId).set({
        tokenHash: issued.record.tokenHash,
        consumed: false,
        createdByUid: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt
    });
    return { submissionId, token: issued.token, expiresAt: expiresAt.toDate().toISOString() };
});

async function enforcePublicLeadRateLimit(context) {
    const forwarded = context.rawRequest?.headers?.['x-forwarded-for'];
    const ip = String(Array.isArray(forwarded) ? forwarded[0] : (forwarded || context.rawRequest?.ip || 'unknown'))
        .split(',')[0].trim();
    const key = crypto.createHash('sha256').update(`canvas-public-lead:${ip}`).digest('hex');
    const ref = db.collection('publicLeadRateLimits').doc(key);
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : null;
        const windowStartedAt = current?.windowStartedAt?.toMillis?.() || 0;
        const withinWindow = now - windowStartedAt < windowMs;
        const count = withinWindow ? Number(current.count || 0) + 1 : 1;
        if (count > 8) throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
        transaction.set(ref, {
            count,
            windowStartedAt: withinWindow ? current.windowStartedAt : admin.firestore.Timestamp.fromMillis(now),
            expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs)
        });
    });
}

function normalizeRequestedUpload(rawFile, index) {
    if (!rawFile || typeof rawFile !== 'object' || Array.isArray(rawFile)) {
        publicLeadError(`File ${index + 1} is invalid.`);
    }
    const name = String(rawFile.name || '').trim();
    const size = Number(rawFile.size);
    const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    let contentType = String(rawFile.type || '').trim().toLowerCase();
    if (!contentType && (extension === 'ai' || extension === 'eps')) contentType = 'application/octet-stream';
    if (!name || name.length > 180 || !/^[^/\\]+$/.test(name)) publicLeadError(`File ${index + 1} has an invalid name.`);
    if (!Number.isInteger(size) || size < 1 || size > LEAD_UPLOAD_MAX_BYTES) {
        publicLeadError(`File ${index + 1} must be smaller than 20 MB.`);
    }
    if (!LEAD_UPLOAD_EXTENSIONS.has(extension) || !LEAD_UPLOAD_TYPES.has(contentType)) {
        publicLeadError(`File ${index + 1} has an unsupported type.`);
    }
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-');
    return { name, safeName, size, type: contentType };
}

exports.createLeadUploadSession = configuredFunctions.https.onCall(async (data, context) => {
    const rawFiles = data?.files;
    if (!Array.isArray(rawFiles) || rawFiles.length < 1 || rawFiles.length > LEAD_UPLOAD_MAX_FILES) {
        publicLeadError(`Choose between 1 and ${LEAD_UPLOAD_MAX_FILES} files.`);
    }
    await enforcePublicLeadRateLimit(context);
    const requestedFiles = rawFiles.map(normalizeRequestedUpload);
    const submissionId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + LEAD_UPLOAD_TTL_MS);
    const sessionRef = db.collection('leadUploadSessions').doc(submissionId);
    const batch = db.batch();
    const authorizedFiles = requestedFiles.map((file) => ({
        fileId: crypto.randomBytes(12).toString('hex'),
        ...file
    }));
    batch.create(sessionRef, {
        token,
        fileCount: requestedFiles.length,
        allowedPaths: authorizedFiles.map((file) => `${file.fileId}/${file.safeName}`),
        files: Object.fromEntries(authorizedFiles.map((file) => [file.fileId, {
            name: file.name,
            safeName: file.safeName,
            size: file.size,
            type: file.type
        }])),
        consumed: false,
        createdAt: now,
        expiresAt
    });
    authorizedFiles.forEach((file) => {
        const { fileId } = file;
        batch.create(sessionRef.collection('files').doc(fileId), {
            name: file.name,
            safeName: file.safeName,
            size: file.size,
            type: file.type,
            token,
            createdAt: now,
            expiresAt
        });
    });
    await batch.commit();
    return { submissionId, token, expiresAt: expiresAt.toDate().toISOString(), files: authorizedFiles };
});

async function verifyLeadUploads(submissionId, rawUploads) {
    if (rawUploads === null || rawUploads === undefined || rawUploads.length === 0) {
        return { sessionRef: null, uploads: [] };
    }
    if (!Array.isArray(rawUploads) || rawUploads.length > LEAD_UPLOAD_MAX_FILES) {
        publicLeadError('Invalid uploaded files.');
    }
    const sessionRef = db.collection('leadUploadSessions').doc(submissionId);
    const sessionSnapshot = await sessionRef.get();
    if (!sessionSnapshot.exists) publicLeadError('Upload session was not found. Please upload the files again.');
    const session = sessionSnapshot.data();
    if (session.consumed || session.expiresAt.toMillis() <= Date.now() || session.fileCount !== rawUploads.length) {
        publicLeadError('Upload session is invalid or expired. Please upload the files again.');
    }

    const bucket = admin.storage().bucket();
    const uploads = await Promise.all(rawUploads.map(async (upload, index) => {
        if (!upload || typeof upload !== 'object' || Array.isArray(upload)) publicLeadError(`Upload ${index + 1} is invalid.`);
        const fileId = String(upload.fileId || '');
        const pathValue = String(upload.path || '');
        const expectedPrefix = `lead-uploads/${submissionId}/${fileId}/`;
        if (!/^[a-f0-9]{24}$/.test(fileId) || !pathValue.startsWith(expectedPrefix)) {
            publicLeadError(`Upload ${index + 1} has an invalid path.`);
        }
        const authSnapshot = await sessionRef.collection('files').doc(fileId).get();
        if (!authSnapshot.exists) publicLeadError(`Upload ${index + 1} is not authorized.`);
        const authorization = authSnapshot.data();
        let metadata;
        try {
            [metadata] = await bucket.file(pathValue).getMetadata();
        } catch (error) {
            publicLeadError(`Upload ${index + 1} was not found.`);
        }
        const custom = metadata.metadata || {};
        if (custom.submissionId !== submissionId
            || custom.fileId !== fileId
            || custom.uploadToken !== session.token
            || custom.originalName !== authorization.name
            || Number(metadata.size) !== authorization.size
            || metadata.contentType !== authorization.type) {
            publicLeadError(`Upload ${index + 1} failed verification.`);
        }
        const downloadToken = crypto.randomUUID();
        await bucket.file(pathValue).setMetadata({
            metadata: {
                ...custom,
                firebaseStorageDownloadTokens: downloadToken
            }
        });
        const encodedBucket = encodeURIComponent(bucket.name);
        const encodedPath = encodeURIComponent(pathValue);
        return {
            name: authorization.name,
            size: authorization.size,
            type: authorization.type,
            path: pathValue,
            downloadURL: `https://firebasestorage.googleapis.com/v0/b/${encodedBucket}/o/${encodedPath}?alt=media&token=${downloadToken}`
        };
    }));
    return { sessionRef, uploads };
}

/** Public website lead intake. Firestore client rules intentionally deny direct creates. */
exports.submitPublicLead = configuredFunctions.https.onCall(async (data, context) => {
    const validated = validatePublicLead(data);
    if (validated.spam) return { ok: true, id: validated.submissionId };
    await enforcePublicLeadRateLimit(context);

    const ref = db.collection('canvas_leads').doc(validated.submissionId);
    try {
        const existing = await ref.get();
        if (existing.exists) return { ok: true, id: ref.id, duplicate: true };
        const verifiedUploads = await verifyLeadUploads(validated.submissionId, validated.lead.fileUploads);
        const uploadSessionRef = verifiedUploads.sessionRef;
        const testAuthorizationRef = db.collection(CRM_TEST_AUTHORIZATIONS_COLLECTION).doc(validated.submissionId);
        if (uploadSessionRef) validated.lead.fileUploads = verifiedUploads.uploads;
        const persisted = await crmTestState.persistLeadWithAuthorization({
            db,
            leadRef: ref,
            authorizationRef: testAuthorizationRef,
            authorizationToken: validated.crmTestAuthorizationToken,
            isValidAuthorization: crmTestAuthorization.isValidAuthorization,
            uploadSessionRef,
            validateUploadSession: (session) => {
                if (session.consumed || session.expiresAt.toMillis() <= Date.now()) {
                    publicLeadError('Upload session is invalid or expired. Please upload the files again.');
                }
            },
            uploadConsumedData: {
                consumed: true,
                consumedAt: admin.firestore.FieldValue.serverTimestamp(),
                leadId: ref.id
            },
            authorizationConsumedData: {
                consumed: true,
                consumedAt: admin.firestore.FieldValue.serverTimestamp(),
                leadId: ref.id
            },
            buildLead: (testAuthorized) => ({
                ...validated.lead,
                source: crmTestAuthorization.trustedSource(validated.lead.source, testAuthorized),
                ...(testAuthorized ? { crmIntegrationTestAuthorized: true } : {}),
                communications: communicationsPolicy.capture(communicationsPolicy.configFromEnv(process.env), new Date(), testAuthorized),
                contractVersion: 2,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'new',
                notes: ''
            })
        });
        return { ok: true, id: ref.id, duplicate: !persisted.created };
    } catch (error) {
        if (error.code === 6 || error.code === 'already-exists') {
            return { ok: true, id: ref.id, duplicate: true };
        }
        console.error('Public lead submission failed:', error);
        throw new functions.https.HttpsError('internal', 'We could not send your request. Please try again.');
    }
});

// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// WORKFLOW ENGINE
// ----------------------------------------------------------------------

/**
 * Enroll a contact in a workflow
 * Creates a workflowContacts document to track progress
 */
async function enrollContactInWorkflow(contactId, workflowId, contactData) {
    try {
        console.log(`Enrolling contact ${contactId} in workflow ${workflowId}`);

        // 1. Get Workflow Definition
        const workflowDoc = await db.collection('canvas_workflows').doc(workflowId).get();
        if (!workflowDoc.exists) {
            console.error(`Workflow ${workflowId} not found`);
            return;
        }
        const workflow = workflowDoc.data();
        if (!workflow.enabled) {
            console.log(`Workflow ${workflow.name} is disabled. Skipping enrollment.`);
            return;
        }

        // SMS enrollment requires explicit stored consent; email/task steps remain eligible.
        const sourceLead = await db.collection('canvas_leads').doc(contactId).get();
        if (!communicationsPolicy.websiteAllowed(communicationsPolicy.configFromEnv(process.env), sourceLead.exists ? sourceLead.data() : null)) return { skipped: true, reason: 'website_communications_suppressed' };
        const enrollment = smsConsent.enrollment(workflow, sourceLead.exists ? sourceLead.data() : null, contactData.phone);
        if (!enrollment.allowed) return { skipped: true, reason: 'sms_consent_required' };

        // 2. Check if already active (prevent duplicate enrollment if needed)

        // 3. Create Workflow Instance (workflowContacts)
        const instanceData = {
            smsEnrollment: enrollment.smsEnrollment,
            workflowId: workflowId,
            contactId: contactId,
            contactEmail: contactData.email,
            contactPhone: contactData.phone,
            contactName: contactData.name || contactData.firstName || 'Friend',
            eventTime: contactData.eventTime || null, // NEW: Store appointment time
            status: 'active',
            currentStepIndex: 0,
            nextExecutionAt: admin.firestore.FieldValue.serverTimestamp(), // Execute Step 1 immediately
            history: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('workflowContacts').add(instanceData);

        // Update Lead Document validation (for UI visibility)
        await db.collection('canvas_leads').doc(contactId).update({
            [`workflows.${workflowId}`]: {
                status: 'active',
                startedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });

        console.log(`Enrolled successfully.`);

    } catch (error) {
        console.error('Error enrolling in workflow:', error);
    }
}

/**
 * HTTP Callable: Process Bulk Campaign
 * Enrolls a batch of leads into a workflow
 */
exports.processBulkCampaign = configuredFunctions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { workflowId, limit, batchSize } = data;
    const countLimit = limit || batchSize || 50;

    console.log(`Processing bulk campaign: WF=${workflowId}, Limit=${countLimit}, User=${context.auth.uid}`);

    try {
        // 2. Get Workflow
        const workflowDoc = await db.collection('canvas_workflows').doc(workflowId).get();
        if (!workflowDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Workflow not found');
        }
        const workflow = workflowDoc.data();

        // 3. Query Leads (Backend Filtering)
        let query = db.collection('canvas_leads');
        const targetStatus = workflow.targetStatus || 'all';

        if (targetStatus !== 'all') {
            query = query.where('status', '==', targetStatus);
        }

        // We can't easily filter "not enrolled" in Firestore query if 'workflows' is a map.
        // So we fetch and filter in memory (up to reasonable limits).
        // For production scale, would need a dedicated 'enrollments' collection query, but this works for now.
        const snapshot = await query.get();

        let eligibleLeads = [];
        snapshot.forEach(doc => {
            const lead = doc.data();
            // Check if already enrolled in THIS workflow
            const isEnrolled = lead.workflows && lead.workflows[workflowId];
            if (!isEnrolled) {
                eligibleLeads.push({ id: doc.id, ...lead });
            }
        });

        // 4. Apply Limit
        const leadsToEnroll = eligibleLeads.slice(0, countLimit);
        console.log(`Found ${eligibleLeads.length} eligible, enrolling ${leadsToEnroll.length}`);

        // 5. Enroll Loop
        const promises = leadsToEnroll.map(lead =>
            enrollContactInWorkflow(lead.id, workflowId, lead)
        );

        await Promise.all(promises);

        return {
            success: true,
            enrolled: leadsToEnroll.length,
            message: `Enrolled ${leadsToEnroll.length} leads into "${workflow.name}".`
        };

    } catch (error) {
        console.error('Bulk Campaign Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Process Workflow Queue (Scheduled Function)
 * Finds active workflow instances with due steps and executes them
 */
// Running every minute to check for due steps
exports.processWorkflowQueue = configuredFunctions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    try {
        // Query for active instances where nextExecutionAt <= now
        const snapshot = await db.collection('workflowContacts')
            .where('status', '==', 'active')
            .where('nextExecutionAt', '<=', now)
            .get();

        if (snapshot.empty) return null;

        console.log(`Found ${snapshot.size} due workflow instances.`);

        const batch = db.batch();
        const promises = [];

        snapshot.forEach(doc => {
            promises.push(processInstance(doc));
        });

        await Promise.all(promises);
        return null;

    } catch (error) {
        console.error('Error processing workflow queue:', error);
        return null;
    }
});

async function processInstance(doc) {
    const instance = doc.data();
    const instanceId = doc.id;

    try {
        // 1. Get Workflow Definition (Cached or Fresh)
        const workflowDoc = await db.collection('canvas_workflows').doc(instance.workflowId).get();
        if (!workflowDoc.exists) {
            console.error(`Workflow ${instance.workflowId} missing for instance ${instanceId}`);
            return db.collection('workflowContacts').doc(instanceId).update({ status: 'error', error: 'Workflow deleted' });
        }
        const workflow = workflowDoc.data();
        const steps = workflow.steps || [];
        const currentStep = steps[instance.currentStepIndex];

        // 2. Execute Step
        if (!currentStep) {
            // No more steps, complete workflow
            console.log(`Workflow ${instance.workflowId} completed for ${instanceId}`);
            return db.collection('workflowContacts').doc(instanceId).update({ status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() });
        }

        console.log(`Executing step ${instance.currentStepIndex} (${currentStep.type}) for ${instanceId}`);
        const result = await executeWorkflowStep(currentStep, instance);

        // 3. Update State
        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            history: admin.firestore.FieldValue.arrayUnion({
                stepIndex: instance.currentStepIndex,
                stepType: currentStep.type,
                executedAt: new Date().toISOString(),
                result: result
            })
        };

        if (result.success) {
            // Move to next step
            const nextIndex = instance.currentStepIndex + 1;
            const nextStep = steps[nextIndex];

            if (nextStep) {
                updates.currentStepIndex = nextIndex;

                // Calculate next delay
                let delayMillis = (nextStep.delay || 0) * 60 * 1000; // default minutes
                if (nextStep.unit === 'hours') {
                    delayMillis = (nextStep.delay || 0) * 60 * 60 * 1000;
                } else if (nextStep.unit === 'days') {
                    delayMillis = (nextStep.delay || 0) * 24 * 60 * 60 * 1000;
                }

                if (nextStep.relativeTo === 'event' && instance.eventTime) {
                    const eventTime = new Date(instance.eventTime).getTime();
                    const offset = nextStep.timing === 'before' ? -delayMillis : delayMillis;
                    const nextTime = eventTime + offset;
                    updates.nextExecutionAt = admin.firestore.Timestamp.fromMillis(nextTime);
                } else if (nextStep.delay) {
                    const nextTime = Date.now() + delayMillis;
                    updates.nextExecutionAt = admin.firestore.Timestamp.fromMillis(nextTime);
                } else {
                    updates.nextExecutionAt = admin.firestore.FieldValue.serverTimestamp(); // Immediate
                }
            } else {
                updates.status = 'completed';
                updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
            }
        } else {
            console.error(`Step failed: ${result.error}`);
            updates.status = 'error';
            updates.error = result.error;
        }

        await db.collection('workflowContacts').doc(instanceId).update(updates);

    } catch (error) {
        console.error(`Error processing instance ${instanceId}:`, error);
    }
}

async function executeWorkflowStep(step, instance) {
    const variables = {
        firstName: instance.contactName,
        name: instance.contactName,
        email: instance.contactEmail,
        phone: instance.contactPhone,
        service: 'Project',
        ...instance.variables
    };

    if (step.type === 'email') {
        return await sendEmail({
            to: instance.contactEmail,
            templateId: step.templateId,
            variables: variables,
            options: { workflowId: instance.workflowId, contactId: instance.contactId }
        });
    } else if (step.type === 'sms') {
        // Fresh consent and recipient binding are required before any provider/config access.
        const currentLead = await db.collection('canvas_leads').doc(instance.contactId).get();
        if (!smsConsent.canSend(instance, currentLead.exists ? currentLead.data() : null)) {
            return { success: true, skipped: true, reason: 'sms_consent_required' };
        }
        return await sendSMS({
            to: instance.contactPhone,
            templateId: step.templateId,
            variables: variables,
            options: { workflowId: instance.workflowId, contactId: instance.contactId, smsEnrollment: instance.smsEnrollment }
        });
    } else if (step.type === 'task') {
        console.log(`TASK created: ${step.description}`);
        return { success: true, message: 'Task logged' };
    }

    return { success: true, skipped: true };
}

// COMMUNICATION FUNCTIONS
// ----------------------------------------------------------------------

/**
 * Send Email via Resend and log to Firestore
 * @param {string} to Recipient email
 * @param {string} templateId ID of email template (optional if html provided)
 * @param {object} variables Data to merge into template
 * @param {object} options Extra options (subject, html, workflowId, contactId)
 */
async function sendEmail({ to, templateId, variables, options = {} }) {
    // All workflow, bulk, booking and direct-message paths use this final gate.
    if (!options.contactId) return { success: false, error: 'communications_contact_required' };
    const communicationLead = await db.collection('canvas_leads').doc(options.contactId).get();
    if (!communicationsPolicy.websiteAllowed(communicationsPolicy.configFromEnv(process.env), communicationLead.exists ? communicationLead.data() : null)) return { success: false, error: 'website_communications_suppressed' };
    if (!to) {
        console.warn('sendEmail: No recipient');
        return null;
    }

    let html, subject;

    try {
        const resendClient = getResend();
        if (!resendClient) {
            throw new Error('Resend Client unavailable');
        }

        // 1. Resolve content (Template or Direct)
        html = options.html;
        subject = options.subject;

        if (templateId) {
            const template = await getEmailTemplate(templateId);
            if (template) {
                html = replaceTemplateVariables(template.html || template, variables);
                // If template object has subject, use it, else default
                if (template.subject) {
                    subject = replaceTemplateVariables(template.subject, variables);
                }
            } else {
                // Fallback / default handled by getEmailTemplate or specialized logic
                html = replaceTemplateVariables(DEFAULT_TEMPLATES[templateId] || '', variables);
            }
        }

        if (!subject) subject = `Message from ${COMPANY_INFO.name}`;

        // 2. Send via Resend
        const payload = {
            from: 'Canvas Advertising <noreply@canvas-advertising.com>',
            to: to,
            subject: subject,
            html: html,
            tags: [
                { name: 'workflowId', value: options.workflowId || 'none' },
                { name: 'contactId', value: options.contactId || 'none' },
                { name: 'campaign', value: 'true' }
            ]
        };

        const result = await resendClient.emails.send(payload);

        if (result.error) {
            throw new Error(result.error.message);
        }

        console.log(`Email sent to ${to}: ${result.id}`);

        // 3. Log to Firestore
        await logCommunication({
            type: 'email',
            contactId: options.contactId,
            workflowId: options.workflowId,
            provider: 'resend',
            providerMessageId: result.id,
            status: 'sent',
            recipient: to,
            content: { subject, templateId },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, id: result.id };

    } catch (error) {
        console.error('sendEmail failed:', error);

        await logCommunication({
            type: 'email',
            contactId: options.contactId,
            workflowId: options.workflowId,
            provider: 'resend',
            status: 'failed',
            recipient: to,
            error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: false, error: error.message };
    }
}

/**
 * Send SMS via Plivo and log to Firestore
 * @param {string} to Recipient phone number (E.164 preferably)
 * @param {string} templateId ID of SMS template (optional if text provided)
 * @param {object} variables Data to merge
 * @param {object} options Extra options (text, workflowId, contactId)
 */
async function sendSMS({ to, templateId, variables, options = {} }) {
    // All workflow, bulk, booking and direct-message paths use this final gate.
    if (!options.contactId) return { success: false, error: 'communications_contact_required' };
    const communicationLead = await db.collection('canvas_leads').doc(options.contactId).get();
    if (!communicationsPolicy.websiteAllowed(communicationsPolicy.configFromEnv(process.env), communicationLead.exists ? communicationLead.data() : null)) return { success: false, error: 'website_communications_suppressed' };
    if (!to) {
        console.warn('sendSMS: No recipient');
        return null;
    }

    if (!options.contactId) return { success: false, error: 'sms_consent_required' };
    const currentLead = await db.collection('canvas_leads').doc(options.contactId).get();
    const lead = currentLead.exists ? currentLead.data() : null;
    const direct = options.workflowId === 'direct_message';
    const permitted = direct
        ? smsConsent.enrollment({ steps: [{ type: 'sms' }] }, lead, to).smsEnrollment.authorized
        : smsConsent.canSend({ contactPhone: to, smsEnrollment: options.smsEnrollment }, lead);
    if (!permitted) return { success: false, error: 'sms_consent_required' };

    try {
        const client = getPlivo();
        if (!client) {
            throw new Error('Plivo Client unavailable');
        }

        let messageBody = options.text;

        // 1. Resolve content from template if needed
        if (templateId && !messageBody) {
            const template = await getSMSTemplate(templateId);
            if (template) {
                messageBody = replaceTemplateVariables(template.content, variables);
            }
        }

        if (!messageBody) {
            throw new Error('No message text provided');
        }

        // 2. Format Phone (Ensure E.164)
        // Basic cleanup: remove non-digits, ensure +1 if US (simple logic)
        let formattedPhone = to.replace(/\D/g, '');
        if (formattedPhone.length === 10) formattedPhone = '1' + formattedPhone;
        // Plivo expects country code, assume US/Canada '1' if not present?
        // Better: user provides full number or we standardize.

        // 3. Send via Plivo
        const srcNumber = process.env.PLIVO_PHONE_NUMBER || runtimeConfig('plivo', 'phone_number');

        const response = await client.messages.create(
            srcNumber,
            formattedPhone,
            messageBody
        );

        console.log(`SMS sent to ${to}: ${response.messageUuid}`);

        // 4. Log to Firestore
        await logCommunication({
            type: 'sms',
            contactId: options.contactId,
            workflowId: options.workflowId,
            provider: 'plivo',
            providerMessageId: response.messageUuid && response.messageUuid[0], // Plivo returns array
            status: 'sent',
            recipient: to,
            content: { body: messageBody, templateId },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, id: response.messageUuid };

    } catch (error) {
        console.error('sendSMS failed:', error);

        await logCommunication({
            type: 'sms',
            contactId: options.contactId,
            workflowId: options.workflowId,
            provider: 'plivo',
            status: 'failed',
            recipient: to,
            error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: false, error: error.message };
    }
}

/**
 * Log communication event to Firestore
 */
async function logCommunication(data) {
    try {
        await db.collection('communicationLogs').add(data);
    } catch (e) {
        console.error('Error logging communication:', e);
    }
}

// ----------------------------------------------------------------------
// HELPER FUNCTIONS (Templates)
// ----------------------------------------------------------------------

async function getEmailTemplate(id) {
    try {
        const doc = await db.collection('emailTemplates').doc(id).get();
        if (doc.exists) return doc.data();

        // Fallback to legacy location for backward compat temporarily
        const legacyDoc = await db.collection('canvas_settings').doc('email_templates').get();
        if (legacyDoc.exists && legacyDoc.data()[id]) {
            return { html: legacyDoc.data()[id] }; // Adapt structure
        }
    } catch (e) { console.error('Template error:', e); }
    return null;
}

async function getSMSTemplate(id) {
    try {
        const doc = await db.collection('smsTemplates').doc(id).get();
        if (doc.exists) return doc.data();
    } catch (e) { console.error('SMS Template error:', e); }
    return null;
}

function replaceTemplateVariables(text, data) {
    if (!text) return '';
    let content = text;
    // Replace {{variable}} patterns
    // Supported: firstName, lastName, phone, service, etc.
    const keys = Object.keys(data);

    // Safety for null/undefined
    const getValue = (key) => (data[key] !== undefined && data[key] !== null) ? data[key] : '';

    // Standard fields
    content = content.replace(/\{\{firstName\}\}/g, getValue('firstName') || getValue('name') || 'Friend');
    content = content.replace(/\{\{lastName\}\}/g, getValue('lastName') || '');
    content = content.replace(/\{\{name\}\}/g, getValue('name') || '');
    content = content.replace(/\{\{service\}\}/g, getValue('service') || 'project');
    content = content.replace(/\{\{phone\}\}/g, getValue('phone') || '');
    content = content.replace(/\{\{email\}\}/g, getValue('email') || '');

    // Booking specific
    if (data.appointmentDate) content = content.replace(/\{\{appointmentDate\}\}/g, data.appointmentDate);
    if (data.appointmentTime) content = content.replace(/\{\{appointmentTime\}\}/g, data.appointmentTime);
    if (data.appointmentAddress) content = content.replace(/\{\{appointmentAddress\}\}/g, data.appointmentAddress);

    return content;
}

// ----------------------------------------------------------------------
// TRIGGERS (Placeholders for now, replacing old logic)
// ----------------------------------------------------------------------

exports.onNewLead = configuredFunctions.firestore
    .document('canvas_leads/{leadId}')
    .onCreate(async (snapshot, context) => {
        const leadData = snapshot.data();
        if (!communicationsPolicy.websiteAllowed(communicationsPolicy.configFromEnv(process.env), leadData)) return null;
        if (crmLeadAdapter.isSyntheticTestSubmission(
            crmLeadAdapterConfig(),
            context.params.leadId,
            leadData.source,
            leadData.crmIntegrationTestAuthorized === true
        )) {
            console.log(`Skipping Canvas notification workflows for approved CRM integration test ${context.params.leadId}.`);
            return null;
        }
        const triggerType = leadData.source === 'booking' ? 'booking' : 'form_submit';

        console.log(`New lead: ${context.params.leadId}, trigger: ${triggerType}`);

        // If this is a booking, cancel any existing active workflows for this email (e.g. nurture)
        if (triggerType === 'booking' && leadData.email) {
            const activeFlows = await db.collection('workflowContacts')
                .where('contactEmail', '==', leadData.email)
                .where('status', '==', 'active')
                .get();

            if (!activeFlows.empty) {
                console.log(`Cancelling ${activeFlows.size} active workflows for ${leadData.email} due to booking.`);
                const batch = db.batch();
                activeFlows.forEach(doc => {
                    batch.update(doc.ref, {
                        status: 'cancelled',
                        cancellationReason: 'New booking',
                        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();
            }
        }

        // Find workflows matching this trigger
        const workflows = await db.collection('canvas_workflows')
            .where('trigger', '==', triggerType)
            .where('enabled', '==', true)
            .get();

        if (workflows.empty) {
            console.log('No workflows found for this trigger.');
            return null;
        }

        const promises = [];
        workflows.forEach(doc => {
            const workflowId = doc.id;
            promises.push(enrollContactInWorkflow(context.params.leadId, workflowId, leadData));
        });

        await Promise.all(promises);
        return null;
    });

/**
 * Cal.com Webhook Handler
 * Receives booking notifications from Cal.com and saves them as leads.
 *
 * WHY: We use a custom webhook instead of Zapier because:
 * 1. Low Latency: Lead is created instantly for fast "Welcome" email.
 * 2. Data Integrity: We capture raw event times to schedule accurate "relative" reminders (e.g. 2 hours before).
 * 3. Cost: No defined limit on events compared to Zapier tiers.
 */
exports.calcomWebhook = configuredFunctions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
        const data = req.body;
        console.log('Received Cal.com webhook:', JSON.stringify(data));

        // Cal.com sends different event types
        const triggerEvent = data.triggerEvent;

        // Only process booking created events
        if (triggerEvent !== 'BOOKING_CREATED') {
            console.log('Ignoring event type:', triggerEvent);
            res.status(200).json({ success: true, message: 'Event ignored' });
            return;
        }

        const payload = data.payload || {};
        const attendees = payload.attendees || [];
        const organizer = payload.organizer || {};

        // Get attendee info (the person who booked)
        const attendee = attendees[0] || {};

        // Extract booking details
        const leadData = {
            name: attendee.name || payload.title || 'Cal.com Booking',
            email: attendee.email || null,
            phone: attendee.phone || null,
            service: payload.eventType?.title || payload.title || 'Consultation',
            message: `Booked: ${payload.title || 'Appointment'}\nTime: ${payload.startTime || 'N/A'}\nEvent ID: ${payload.uid || 'N/A'}`,
            source: 'booking',
            status: 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            notified: false,
            calcomData: {
                bookingId: payload.uid || null,
                eventType: payload.eventType?.title || null,
                startTime: payload.startTime || null,
                endTime: payload.endTime || null,
                rescheduleUrl: payload.rescheduleUrl || null,
                cancelUrl: payload.cancelUrl || null
            }
        };

        // Save to Firestore
        const docRef = await db.collection('canvas_leads').add(leadData);
        console.log('Lead created with ID:', docRef.id);

        // Auto-enroll in booking workflow if it exists
        await enrollContactInWorkflow(docRef.id, 'wf_booking', {
            ...leadData,
            eventTime: payload.startTime // Pass event time for relative reminders
        });

        res.status(200).json({
            success: true,
            leadId: docRef.id,
            message: 'Booking saved as lead'
        });

    } catch (error) {
        console.error('Error processing Cal.com webhook:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Serve Project Page (Dynamic Rendering)
 * Reads project data from Firestore and insterts it into the HTML template
 */
const fs = require('fs');
const path = require('path');

// Define redirects for legacy or consolidated projects
const REDIRECTS = {
    'commercial-transit-van': 'waterloo-fleet-wrap',
    // Add other redirects here if needed
};

exports.serveProjectPage = configuredFunctions.https.onRequest(async (req, res) => {
    // 1. Get the project slug from the URL and detect language
    // URL structure: /projects/my-project-name OR /es/proyectos/my-project-name
    const pathParts = req.path.split('/').filter(p => p);
    const isSpanish = pathParts.includes('es') && pathParts.includes('proyectos');
    const slug = pathParts[pathParts.length - 1];

    if (!slug) {
        res.status(404).send('Project not found');
        return;
    }

    // Check for Redirects (applies to both languages)
    if (REDIRECTS[slug]) {
        const newSlug = REDIRECTS[slug];
        const redirectBase = isSpanish ? '/es/proyectos/' : '/projects/';
        console.log(`Redirecting legacy slug ${slug} to ${newSlug}`);
        res.redirect(301, `${redirectBase}${newSlug}`);
        return;
    }

    try {
        // 2. Query Firestore for the project data
        const projectsRef = db.collection('canvas_projects');
        const snapshot = await projectsRef.where('slug', '==', slug).limit(1).get();

        if (snapshot.empty) {
            console.log(`Project not found for slug: ${slug}`);
            // Ideally redirect to 404 page, but sending text for now
            res.status(404).send(isSpanish ? 'Proyecto no encontrado' : 'Project not found');
            return;
        }

        const project = snapshot.docs[0].data();

        // 3. Read the appropriate HTML template
        const templateName = isSpanish ? 'project-detail-es.html' : 'project-detail.html';
        const templatePath = path.join(__dirname, 'templates', templateName);
        let html = fs.readFileSync(templatePath, 'utf8');

        // 4. Generate Images HTML
        // Assuming project.images is an array of URL strings
        let imagesHtml = '';
        if (project.images && Array.isArray(project.images)) {
            imagesHtml = project.images.map(imgUrl => `
                <div class="project-gallery-item">
                     <img src="${imgUrl}" alt="${project.title} - Image" loading="lazy">
                </div>
            `).join('');
        } else if (project.imageUrl) {
            // Fallback for single image
            imagesHtml = `
                <div class="project-gallery-item">
                     <img src="${project.imageUrl}" alt="${project.title}" loading="lazy">
                </div>
            `;
        }

        // 5. Replace placeholders - use Spanish fields if available and Spanish route
        const title = isSpanish ? (project.title_es || project.title) : project.title;
        const description = isSpanish ? (project.description_es || project.description) : project.description;
        const category = isSpanish ? (project.category_es || project.category) : project.category;
        const challenge = isSpanish ? (project.challenge_es || project.challenge) : project.challenge;
        const solution = isSpanish ? (project.solution_es || project.solution) : project.solution;
        const result = isSpanish ? (project.result_es || project.result) : project.result;

        html = html
            .replace(/{{TITLE}}/g, title || 'Project Detail')
            .replace(/{{DESCRIPTION}}/g, description || '')
            .replace(/{{CATEGORY}}/g, category || 'Portfolio')
            .replace(/{{LOCATION}}/g, project.location || 'Austin, TX')
            .replace(/{{CHALLENGE}}/g, challenge || (isSpanish ? 'Detalles próximamente...' : 'Details coming soon...'))
            .replace(/{{SOLUTION}}/g, solution || (isSpanish ? 'Detalles próximamente...' : 'Details coming soon...'))
            .replace(/{{RESULT}}/g, result || (isSpanish ? 'Detalles próximamente...' : 'Details coming soon...'))
            .replace(/{{OG_IMAGE}}/g, (project.images && project.images[0]) || project.imageUrl || '')
            .replace(/{{IMAGES_HTML}}/g, imagesHtml);

        // 6. Serve the final HTML
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600'); // Cache for 5 mins
        res.status(200).send(html);

    } catch (error) {
        console.error('Error serving project page:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Temporary Seed Function
 * Visits this URL to populate Firestore with initial data
 */
// ----------------------------------------------------------------------
// SEEDING
// ----------------------------------------------------------------------

exports.seedWorkflows = configuredFunctions.https.onRequest(async (req, res) => {
    try {
        const workflows = [
            {
                id: 'wf_welcome',
                name: 'New Form Lead Welcome',
                trigger: 'form_submit',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'welcome', delay: 0, unit: 'minutes' }, // Immediate
                    { type: 'sms', templateId: 'sms_welcome', delay: 2, unit: 'minutes' }, // 2 min delay
                    { type: 'email', templateId: 'follow_up_no_response', delay: 2, unit: 'days' } // 2 days
                ]
            },
            {
                id: 'wf_booking',
                name: 'Booking Confirmation & Reminders',
                trigger: 'booking',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'booking_confirmed', delay: 0, unit: 'minutes' },
                    { type: 'sms', templateId: 'sms_booking_confirmed', delay: 0, unit: 'minutes' },
                    { type: 'sms', templateId: 'sms_booking_confirmed', delay: 2, unit: 'hours', relativeTo: 'event', timing: 'before' } // 2 hours before
                ]
            },
            {
                id: 'wf_project_thanks',
                name: 'Project Completion Thank You',
                trigger: 'status_change',
                triggerStatus: 'completed',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'thank_you_post_project', delay: 0, unit: 'minutes' },
                    { type: 'sms', templateId: 'sms_thank_you', delay: 10, unit: 'minutes' }
                ]
            }
        ];

        const batch = db.batch();
        workflows.forEach(w => {
            const { id, ...data } = w;
            batch.set(db.collection('canvas_workflows').doc(id), {
                ...data,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        res.status(200).send(`Seeded ${workflows.length} workflows.`);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

exports.seedTemplates = configuredFunctions.https.onRequest(async (req, res) => {
    try {
        const batch = db.batch();

        // 1. Email Templates
        const emailTemplates = [
            {
                id: 'welcome',
                name: 'Welcome Email',
                subject: 'Thanks for contacting Canvas Advertising, {{firstName}}! 🙌',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h1 style="color: #000;">Thanks for Reaching Out!</h1>
                    <p>Hi {{firstName}},</p>
                    <p>Thank you for contacting <strong>Canvas Advertising</strong>! We've received your inquiry and are excited to help you with your project.</p>
                    <p>One of our team members will review your details and get back to you shortly (usually within 24 hours). </p>
                    <p>In the meantime, if you have any urgent questions, feel free to call us at <strong>${COMPANY_INFO.phone}</strong>.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 14px; color: #666;">
                        <strong>${COMPANY_INFO.name}</strong><br>
                        📞 ${COMPANY_INFO.phone}<br>
                        🌐 <a href="${COMPANY_INFO.website}" style="color: #000;">${COMPANY_INFO.website}</a>
                    </p>
                </div>`
            },
            {
                id: 'booking_confirmed',
                name: 'Booking Confirmed',
                subject: 'Your Consultation is Confirmed! 🎉',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h1 style="color: #000;">Booking Confirmed</h1>
                    <p>Hi {{firstName}},</p>
                    <p>Your consultation with <strong>Canvas Advertising</strong> is confirmed.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>📅 Date:</strong> {{appointmentDate}}</p>
                        <p style="margin: 5px 0;"><strong>⏰ Time:</strong> {{appointmentTime}}</p>
                        <p style="margin: 5px 0;"><strong>📍 Location:</strong> {{appointmentAddress}}</p>
                    </div>
                    <p>We look forward to discussing your project!</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                     <p style="font-size: 14px; color: #666;">
                        <strong>${COMPANY_INFO.name}</strong><br>
                        📞 ${COMPANY_INFO.phone}
                    </p>
                </div>`
            },
            {
                id: 'booking_reminder_24h',
                name: 'Booking Reminder (24h)',
                subject: 'Reminder: Your Appointment Tomorrow',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <p>Hi {{firstName}},</p>
                    <p>This is a quick reminder about your appointment with <strong>Canvas Advertising</strong> tomorrow.</p>
                    <p><strong>{{appointmentDate}} at {{appointmentTime}}</strong></p>
                    <p>Please let us know if you need to reschedule.</p>
                    <p>See you soon!</p>
                     <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                     <p style="font-size: 14px; color: #666;">
                        <strong>${COMPANY_INFO.name}</strong>
                    </p>
                </div>`
            },
            {
                id: 'booking_reminder_2h',
                name: 'Booking Reminder (2h)',
                subject: 'See you in 2 hours!',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <p>Hi {{firstName}},</p>
                    <p>We look forward to seeing you in about 2 hours for your consultation.</p>
                    <p><strong>Address:</strong><br>${COMPANY_INFO.website} (Check our site for map/directions)</p>
                    <p>Drive safe!</p>
                </div>`
            },
            {
                id: 'follow_up_no_response',
                name: 'Follow Up (No Response)',
                subject: 'Following up on your project inquiry',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <p>Hi {{firstName}},</p>
                    <p>I wanted to quickly follow up on your inquiry about <strong>{{serviceType}}</strong>. Are you still interested in moving forward?</p>
                    <p>If you have any questions or nede more information, just hit reply or give us a call at <strong>${COMPANY_INFO.phone}</strong>.</p>
                    <p>Best regards,</p>
                    <p><strong>The Canvas Advertising Team</strong></p>
                </div>`
            },
            {
                id: 'thank_you_post_project',
                name: 'Thank You (Post Project)',
                subject: 'Thank you for choosing Canvas Advertising! ⭐',
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h1>Thank You!</h1>
                    <p>Hi {{firstName}},</p>
                    <p>It was a pleasure working with you on your project. We hope you're thrilled with the results!</p>
                    <p>If you have a moment, we'd love your feedback. It helps us grow and serve others better.</p>
                    <p><a href="{{reviewLink}}" style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Leave a Quick Review</a></p>
                    <p>Thanks again for your business!</p>
                </div>`
            }
        ];

        emailTemplates.forEach(t => {
            batch.set(db.collection('emailTemplates').doc(t.id), {
                ...t,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // 2. SMS Templates
        const smsTemplates = [
            {
                id: 'sms_welcome',
                name: 'Welcome SMS',
                content: "Hi {{firstName}}, thanks for contacting Canvas Advertising! We'll call you shortly to discuss your project. Questions? Call us: (512) 215-8749",
                variables: ["firstName"]
            },
            {
                id: 'sms_booking_confirmed',
                name: 'Booking Confirmed SMS',
                content: "Confirmed! Your appointment is {{appointmentDate}} at {{appointmentTime}}. Address: {{appointmentAddress}}. See you then! - Canvas Advertising",
                variables: ["firstName", "appointmentDate", "appointmentTime", "appointmentAddress"]
            },
            {
                id: 'sms_reminder_24h',
                name: 'Reminder 24h SMS',
                content: "Reminder: Your appointment at Canvas Advertising is tomorrow at {{appointmentTime}}. Reply STOP to opt out.",
                variables: ["appointmentTime"]
            },
            {
                id: 'sms_reminder_2h',
                name: 'Reminder 2h SMS',
                content: "See you in 2 hours! Canvas Advertising, {{appointmentAddress}}. Call if you need to reschedule: (512) 215-8749",
                variables: ["appointmentAddress"]
            },
            {
                id: 'sms_follow_up',
                name: 'Follow Up SMS',
                content: "Hi {{firstName}}, checking in on your print project inquiry. Still interested? Give us a call: (512) 215-8749 - Canvas Advertising",
                variables: ["firstName"]
            },
            {
                id: 'sms_thank_you',
                name: 'Thank You SMS',
                content: "Thanks for choosing Canvas Advertising, {{firstName}}! We'd love a quick review: {{reviewLink}} - it helps us grow!",
                variables: ["firstName", "reviewLink"]
            }
        ];

        smsTemplates.forEach(t => {
            batch.set(db.collection('smsTemplates').doc(t.id), {
                ...t,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        res.status(200).send(`Seeded ${emailTemplates.length} email templates and ${smsTemplates.length} SMS templates.`);

    } catch (error) {
        console.error('Error seeding templates:', error);
        res.status(500).send(error.message);
    }
});

/**
 * Send a direct message (Email or SMS) to a contact
 * Callable Function for Admin Dashboard
 */
exports.sendDirectMessage = configuredFunctions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { contactId, type, content, subject, recipient } = data;

    // 2. Validation
    if (!contactId || !type || !content) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: contactId, type, content.');
    }

    try {
        let result;

        // 3. Send Message
        if (type === 'email') {
            if (!subject) throw new functions.https.HttpsError('invalid-argument', 'Email requires a subject.');

            // Use internal helper
            result = await sendEmail({
                to: recipient, // Email address
                options: {
                    subject: subject,
                    html: content, // Content passed in options
                    contactId,
                    workflowId: 'direct_message'
                }
            });

        } else if (type === 'sms') {
            // Use internal helper
            result = await sendSMS({
                to: recipient, // Phone number
                options: {
                    text: content,
                    contactId,
                    workflowId: 'direct_message'
                }
            });

        } else {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid type. Must be "email" or "sms".');
        }

        if (!result || (result.success === false)) {
            throw new functions.https.HttpsError('internal', result?.error || 'Failed to send message.');
        }

        return { success: true, messageId: result.id || result.messageUuid };

    } catch (error) {
        console.error('sendDirectMessage error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ----------------------------------------------------------------------
// WEBHOOK HANDLERS (Analytics)
// ----------------------------------------------------------------------

/**
 * Handle Resend Webhook (Email Events)
 * Events: email.sent, email.delivered, email.delivery_delayed, email.complained, email.bounced, email.opened, email.clicked
 */
exports.handleResendWebhook = configuredFunctions.https.onRequest(async (req, res) => {
    const signature = req.headers['resend-signature'];

    // Verify signature logic would go here in production
    // For now, we trust the endpoint (hidden/secret)

    try {
        const event = req.body;
        const type = event.type; // e.g. 'email.opened'
        const data = event.data; // contains email_id, to, etc.

        console.log(`Resend Webhook: ${type}`, JSON.stringify(data));

        if (!data || !data.email_id) {
            res.status(400).send('Invalid payload');
            return;
        }

        // Find the communication log (limit 1)
        const logsSnapshot = await db.collection('communicationLogs')
            .where('providerMessageId', '==', data.email_id)
            .limit(1)
            .get();

        if (logsSnapshot.empty) {
            console.log(`No log found for Resend ID: ${data.email_id}`);
            res.status(200).send('Log not found, skipped');
            return;
        }

        const logDoc = logsSnapshot.docs[0];
        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Map Resend events to our status
        // We accumulate timestamps for opens/clicks
        if (type === 'email.delivered') {
            updates.status = 'delivered';
            updates.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (type === 'email.opened') {
            updates.status = 'opened'; // Or keep 'delivered' and just add openedAt?
            // Better to show 'opened' as main status if opened.
            updates.openedAt = admin.firestore.FieldValue.serverTimestamp();
            updates.openCount = admin.firestore.FieldValue.increment(1);
        } else if (type === 'email.clicked') {
            updates.clickedAt = admin.firestore.FieldValue.serverTimestamp();
            updates.clickCount = admin.firestore.FieldValue.increment(1);
        } else if (type === 'email.bounced') {
            updates.status = 'failed';
            updates.error = 'Bounced';
            updates.bouncedAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (type === 'email.complained') {
            updates.status = 'failed';
            updates.error = 'Spam Complaint';
        }

        await logDoc.ref.update(updates);
        res.status(200).send('Event processed');

    } catch (error) {
        console.error('Resend Webhook Error:', error);
        res.status(500).send(error.message);
    }
});

/**
 * Handle Telnyx Webhook (SMS Status)
 * Telnyx sends POST with data.payload containing event_type and id
 */
exports.handleTelnyxWebhook = configuredFunctions.https.onRequest(async (req, res) => {
    try {
        const body = req.body;
        const data = body.data;

        if (!data || !data.payload) {
            res.status(400).send('Invalid Telnyx Payload');
            return;
        }

        const payload = data.payload;
        const eventType = data.event_type; // e.g., 'message.finalized', 'message.sent'
        const messageId = payload.id;

        console.log(`Telnyx Webhook: ${eventType} for ${messageId}`);

        // We only care about delivery statuses
        // Telnyx events: 'message.sent', 'message.delivered', 'message.undelivered', 'message.failed'

        const logsSnapshot = await db.collection('communicationLogs')
            .where('providerMessageId', '==', messageId)
            .limit(1)
            .get();

        if (logsSnapshot.empty) {
            console.log(`No log found for Telnyx ID: ${messageId}`);
            res.status(200).send('Log not found');
            return;
        }

        const logDoc = logsSnapshot.docs[0];
        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (eventType === 'message.delivered') {
            updates.status = 'delivered';
            updates.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (eventType === 'message.undelivered' || eventType === 'message.failed') {
            updates.status = 'failed';
            updates.error = payload.to[0].status; // Get specific error if available
            updates.failedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        if (Object.keys(updates).length > 1) {
            await logDoc.ref.update(updates);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('Telnyx Webhook Error:', error);
        res.status(500).send(error.message);
    }
});

// ----------------------------------------------------------------------
// ANALYTICS FUNCTIONS
// ----------------------------------------------------------------------

exports.getAggregatedStats = configuredFunctions.https.onCall(async (data, context) => {
    // Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    try {
        const stats = {
            email: { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 },
            sms: { sent: 0, delivered: 0, failed: 0 }
        };

        // Note: For large datasets, use Firestore Aggregation Queries (count())
        // Since we are on client-side SDK in functions (admin), we can use .count().get()
        // But admin SDK requires valid index support for complex queries.
        // We'll do a simple iteration for now as the dataset is small (<1000 logs likely).
        // UPGRADE: Switch to count() aggregation when nodejs sdk supports it fully or use raw query.

        const logsSnap = await db.collection('communicationLogs').get();

        logsSnap.forEach(doc => {
            const log = doc.data();
            const type = log.type || 'email';

            if (stats[type]) {
                stats[type].sent++;

                if (log.status === 'delivered' || log.status === 'opened' || log.status === 'clicked') {
                    stats[type].delivered++;
                }

                if (type === 'email') {
                    if (log.status === 'opened' || log.status === 'clicked' || log.openedAt) stats[type].opened++;
                    if (log.status === 'clicked' || log.clickedAt) stats[type].clicked++;
                }

                if (log.status === 'failed' || log.status === 'error') {
                    stats[type].failed++;
                }
            }
        });

        return stats;

    } catch (error) {
        console.error('Stats Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ----------------------------------------------------------------------
// GOOGLE REVIEWS (Cached)
// ----------------------------------------------------------------------
exports.getGoogleReviews = configuredFunctions.https.onCall(async (data, context) => {
    // 1. Check Cache (Firestore)
    // We store the single cached object in 'canvas_settings/reviews_cache'
    const cacheRef = db.collection('canvas_settings').doc('reviews_cache');
    const cacheDoc = await cacheRef.get();
    const now = Date.now();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Hours

    if (cacheDoc.exists) {
        const cache = cacheDoc.data();
        if (cache.updatedAt && (now - cache.updatedAt.toMillis() < CACHE_DURATION)) {
            console.log('Returning cached Google Reviews');
            return cache.reviews;
        }
    }

    // 2. Fetch from Google API
    const input = data || {};
    const placeId = input.placeId || runtimeConfig('google', 'place_id');
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || runtimeConfig('google', 'api_key') || runtimeConfig('google', 'maps_api_key');

    if (!placeId || !apiKey) {
        console.warn('Missing Google Place ID or API Key');
        // Return cached data even if expired if we can't fetch new
        if (cacheDoc.exists) return cacheDoc.data().reviews;
        return [];
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.status !== 'OK') {
            console.error('Google Places API Error:', json.status, json.error_message);
            if (cacheDoc.exists) return cacheDoc.data().reviews; // Fallback
            throw new Error(`Google API Error: ${json.status}`);
        }

        const reviews = json.result.reviews || [];

        // 3. Update Cache
        await cacheRef.set({
            reviews: reviews,
            rating: json.result.rating,
            total: json.result.user_ratings_total,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return reviews;

    } catch (error) {
        console.error('Error fetching reviews:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch reviews');
    }
});

// ----------------------------------------------------------------------
// SQUARE E-COMMERCE & ONLINE ORDERING
// ----------------------------------------------------------------------

/**
 * HTTPS Callable: Create Hosted Square Checkout Link
 */
exports.createSquareCheckoutSession = configuredFunctions.https.onCall(async (data, context) => {
    const { productName, priceInCents, quantity, artworkUrl, customerName, customerEmail, customerPhone, redirectUrl } = data;

    if (!productName || !priceInCents || !quantity || !artworkUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }
    const validatedOrder = validateStoreOrder(productName, priceInCents, quantity);

    const client = getSquare();
    const locationId = process.env.SQUARE_LOCATION_ID || runtimeConfig('square', 'location_id');

    if (!client || !locationId) {
        throw new functions.https.HttpsError('failed-precondition', 'Online payment is temporarily unavailable.');
    }

    try {
        const { randomUUID } = require('crypto');
        const idempotencyKey = randomUUID();

        const response = await client.checkout.paymentLinks.create({
            idempotencyKey: idempotencyKey,
            order: {
                locationId: locationId,
                lineItems: [
                    {
                        name: productName,
                        quantity: String(validatedOrder.quantity),
                        basePriceMoney: {
                            amount: BigInt(validatedOrder.priceInCents),
                            currency: 'USD'
                        }
                    }
                ],
                metadata: {
                    artworkUrl: String(artworkUrl).substring(0, 255),
                    customerName: String(customerName || '').substring(0, 255),
                    customerEmail: String(customerEmail || '').substring(0, 255),
                    customerPhone: String(customerPhone || '').substring(0, 255)
                }
            },
            checkoutOptions: {
                redirectUrl: redirectUrl || 'https://canvas-adnvertising.web.app/thank-you',
                merchantSupportEmail: 'sales@canvas-advertising.com',
                askForShippingAddress: false
            }
        });

        if (response?.paymentLink?.url) {
            return {
                url: response.paymentLink.url,
                paymentLinkId: response.paymentLink.id,
                orderId: response.paymentLink.orderId
            };
        } else {
            throw new Error('No payment link URL returned from Square.');
        }
    } catch (error) {
        console.error('Square Payment Link creation failed:', error);
        throw new functions.https.HttpsError('internal', `Square error: ${error.message}`);
    }
});

/**
 * HTTPS Callable: Create Mock Order (Sandbox Testing)
 */
exports.createMockOrder = configuredFunctions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.admin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Administrator access is required.');
    }

    const { productName, priceInCents, quantity, artworkUrl, customerEmail, customerName, customerPhone } = data;

    const orderData = {
        productName,
        priceInCents: Number(priceInCents),
        quantity: Number(quantity),
        artworkUrl,
        customerEmail: customerEmail || 'mock@example.com',
        customerName: customerName || 'Mock Customer',
        customerPhone: customerPhone || '512-555-0199',
        status: 'Pending',
        isMock: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('canvas_orders').add(orderData);
    return { success: true };
});

/**
 * HTTPS Callable: Get Square Client Configuration for Frontend
 */
exports.getSquareConfig = configuredFunctions.https.onCall(async (data, context) => {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN || runtimeConfig('square', 'access_token');
    const applicationId = process.env.SQUARE_APPLICATION_ID || runtimeConfig('square', 'application_id');
    const locationId = process.env.SQUARE_LOCATION_ID || runtimeConfig('square', 'location_id');
    const environment = process.env.SQUARE_ENVIRONMENT || runtimeConfig('square', 'environment') || 'sandbox';

    if (!accessToken || !applicationId || !locationId) {
        throw new functions.https.HttpsError('failed-precondition', 'Online payment is temporarily unavailable.');
    }

    return {
        applicationId,
        locationId,
        environment: environment.toLowerCase()
    };
});

/**
 * HTTPS Callable: Process Square Web Payments SDK Payment
 */
exports.processSquarePayment = configuredFunctions.https.onCall(async (data, context) => {
    const { token, productName, priceInCents, quantity, artworkUrl, customerName, customerEmail, customerPhone } = data;

    if (!productName || !priceInCents || !quantity || !artworkUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }
    const validatedOrder = validateStoreOrder(productName, priceInCents, quantity);

    const accessToken = process.env.SQUARE_ACCESS_TOKEN || runtimeConfig('square', 'access_token');
    const applicationId = process.env.SQUARE_APPLICATION_ID || runtimeConfig('square', 'application_id');
    const locationId = process.env.SQUARE_LOCATION_ID || runtimeConfig('square', 'location_id');

    if (!accessToken || !applicationId || !locationId || !token) {
        throw new functions.https.HttpsError('failed-precondition', 'Online payment is temporarily unavailable.');
    }

    // Call Square API to process the payment
    const client = getSquare();
    if (!client) {
        throw new functions.https.HttpsError('failed-precondition', 'Square client initialization failed.');
    }

    try {
        const { randomUUID } = require('crypto');
        const idempotencyKey = randomUUID();

        const response = await client.payments.create({
            sourceId: token,
            idempotencyKey: idempotencyKey,
            amountMoney: {
                amount: BigInt(validatedOrder.priceInCents),
                currency: 'USD'
            },
            buyerEmailAddress: customerEmail,
            note: productName,
            referenceId: productName
        });

        const payment = response.payment;
        if (payment && (payment.status === 'COMPLETED' || payment.status === 'APPROVED')) {
            const orderData = {
                orderId: payment.id,
                productName,
                quantity: validatedOrder.quantity,
                priceInCents: validatedOrder.priceInCents,
                artworkUrl,
                customerName: customerName || 'Store Customer',
                customerEmail: customerEmail || '',
                customerPhone: customerPhone || '',
                status: 'Pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('canvas_orders').add(orderData);

            // Send email confirmation using Resend
            const resendClient = getResend();
            if (resendClient && customerEmail) {
                try {
                    await resendClient.emails.send({
                        from: 'orders@canvas-advertising.com',
                        to: customerEmail,
                        subject: 'Thank you for your order! - Canvas Advertising',
                        html: `<p>Hi ${customerName || 'there'},</p><p>We received your order for **${productName}**! Our production team is reviewing your uploaded artwork and will be in touch shortly.</p>`
                    });
                } catch (emailErr) {
                    console.error('Failed to send order email:', emailErr);
                }
            }

            return { success: true, orderId: docRef.id, paymentId: payment.id };
        } else {
            throw new Error(`Square payment failed with status: ${payment ? payment.status : 'UNKNOWN'}`);
        }

    } catch (error) {
        console.error('Square Payment Processing failed:', error);
        throw new functions.https.HttpsError('internal', `Square payment failed: ${error.message}`);
    }
});


/**
 * HTTP Webhook: Handle Square payment notifications
 */
exports.squareWebhook = configuredFunctions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const signature = req.headers['x-square-hmacsha256-signature'];
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || runtimeConfig('square', 'webhook_signature_key');
    const webhookUrl = `https://${req.get('host')}${req.originalUrl}`;
    const bodyStr = JSON.stringify(req.body);

    if (!signatureKey) {
        console.error('Square Webhook Signature Key missing. Rejecting webhook.');
        res.status(503).send('Webhook verification unavailable');
        return;
    } else {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', signatureKey);
        const payload = webhookUrl + (req.rawBody ? req.rawBody.toString('utf8') : bodyStr);
        hmac.update(payload);
        const expected = hmac.digest('base64');

        if (signature !== expected) {
            console.error('Square Webhook Signature Verification failed.');
            res.status(400).send('Invalid Signature');
            return;
        }
    }

    const event = req.body;
    console.log('Received Square Webhook Event:', event.type);

    try {
        if (event.type === 'payment.created' || event.type === 'order.updated') {
            const dataObj = event.data?.object;
            let orderId = null;
            let amountPaid = 0;

            if (event.type === 'payment.created' && dataObj?.payment) {
                orderId = dataObj.payment.order_id;
                amountPaid = Number(dataObj.payment.amount_money?.amount || 0);
            } else if (event.type === 'order.updated' && dataObj?.order) {
                if (dataObj.order.state === 'COMPLETED' || dataObj.order.tenders?.[0]?.status === 'SUCCESS') {
                    orderId = dataObj.order.id;
                    amountPaid = Number(dataObj.order.total_money?.amount || 0);
                }
            }

            if (orderId) {
                const existingOrderSnapshot = await db.collection('canvas_orders').where('orderId', '==', orderId).get();
                if (!existingOrderSnapshot.empty) {
                    console.log(`Order ${orderId} already processed. Skipping.`);
                    res.status(200).send('Duplicate Event Handled');
                    return;
                }

                const client = getSquare();
                if (client) {
                    const orderResponse = await client.ordersApi.retrieveOrder(orderId);
                    const order = orderResponse.result.order;

                    if (order) {
                        const metadata = order.metadata || {};
                        const lineItem = order.lineItems?.[0] || {};

                        const orderData = {
                            orderId: orderId,
                            productName: lineItem.name || 'Custom Print Product',
                            quantity: Number(lineItem.quantity || 1),
                            priceInCents: amountPaid || Number(lineItem.totalMoney?.amount || 0),
                            artworkUrl: metadata.artworkUrl || '',
                            customerName: metadata.customerName || order.recipient?.displayName || '',
                            customerEmail: metadata.customerEmail || '',
                            customerPhone: metadata.customerPhone || '',
                            status: 'Pending',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        };

                        await db.collection('canvas_orders').add(orderData);
                        console.log(`Successfully recorded order ${orderId} in Firestore.`);

                        const resendClient = getResend();
                        if (resendClient && orderData.customerEmail) {
                            await resendClient.emails.send({
                                from: 'orders@canvas-advertising.com',
                                to: orderData.customerEmail,
                                subject: 'Thank you for your order! - Canvas Advertising',
                                html: `<p>Hi ${orderData.customerName || 'there'},</p><p>We received your order for **${orderData.productName}**! Our production team is reviewing your uploaded artwork and will be in touch shortly.</p>`
                            });
                        }
                    }
                }
            }
        }
        res.status(200).send('Event Handled');
    } catch (err) {
        console.error('Error processing Square webhook event:', err);
        res.status(500).send(`Internal Error: ${err.message}`);
    }
});

// ─── CRM Webhook Triggers ───────────────────

const CRM_LEAD_DELIVERIES_COLLECTION = 'crm_lead_deliveries';
const CRM_LEAD_BATCH_SIZE = 25;
const CRM_LEAD_MAX_ATTEMPTS = 8;
const crmLeadAdapter = require('./crm-lead-adapter');

function crmLeadAdapterConfig() {
    return {
        enabled: String(
            process.env.CRM_LEAD_ADAPTER_ENABLED
            || 'false'
        ).toLowerCase() === 'true',
        legacyForwardingEnabled: process.env.CRM_LEGACY_FORWARDING_ENABLED === 'true',
        baseUrl: process.env.MERKAD_LEADS_BASE_URL || '',
        tenantSlug: process.env.MERKAD_LEADS_TENANT_SLUG || '',
        keyId: process.env.MERKAD_LEADS_KEY_ID || '',
        secret: process.env.MERKAD_LEADS_SECRET || '',
        testSubmissionId: process.env.CRM_LEAD_TEST_SUBMISSION_ID || '',
        serviceAllowlistConfirmed: String(
            process.env.MERKAD_LEADS_SERVICE_ALLOWLIST_CONFIRMED
            || 'false'
        ).toLowerCase() === 'true'
    };
}

function crmLeadDeliveryReadiness(config, leadId, serverAuthorized = false) {
    return crmLeadAdapter.readiness(config, leadId, serverAuthorized);
}

function crmLeadIdempotencyKey(leadId) {
    return crmLeadAdapter.idempotencyKeyFor(leadId);
}

async function deliverCrmLead(deliveryRef, delivery) {
    const config = crmLeadAdapterConfig();
    const readiness = crmTestState.readinessForPersistedDelivery(
        config,
        { ...delivery, leadId: delivery.leadId || deliveryRef.id },
        crmLeadAdapter.readiness
    );
    const ownershipHold = communicationsPolicy.deliveryHold(communicationsPolicy.configFromEnv(process.env), delivery.communications);
    // Frozen unsuppressed payloads remain held on policy drift; never rewrite a retry.
    if (ownershipHold && JSON.parse(delivery.serializedBody || '{}').testSuppressed !== true) return { attempted: false, reason: ownershipHold };
    if (!readiness.ready) return { attempted: false, reason: readiness.reason };
    if (!delivery.serializedBody || !delivery.serviceMapping?.crmValue || delivery.serviceMapping.confirmed !== true) {
        await deliveryRef.update({
            status: 'failed',
            lastError: 'UNSUPPORTED_SERVICE_MAPPING',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { attempted: false, reason: 'unsupported-service-mapping' };
    }

    const nowMs = Date.now();
    const attemptNumber = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(deliveryRef);
        if (!currentSnapshot.exists) return 0;
        const current = currentSnapshot.data();
        if (!crmLeadAdapter.isClaimable(current, nowMs)) return 0;
        const nextAttempt = Number(current.attemptCount || 0) + 1;
        transaction.update(deliveryRef, {
            status: 'processing',
            attemptCount: nextAttempt,
            processingLeaseExpiresAt: admin.firestore.Timestamp.fromMillis(
                nowMs + crmLeadAdapter.PROCESSING_LEASE_MS
            ),
            lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return nextAttempt;
    });
    if (!attemptNumber) return { attempted: false, reason: 'not-claimable' };

    const result = await crmLeadAdapter.postSerializedDelivery({
        fetchImpl: fetch,
        baseUrl: config.baseUrl,
        tenantSlug: config.tenantSlug,
        credential: crmLeadAdapter.bearerCredential(config.keyId, config.secret),
        idempotencyKey: delivery.idempotencyKey,
        serializedBody: delivery.serializedBody
    });
    const common = {
        responseStatus: result.status || null,
        responseCode: result.code || '',
        processingLeaseExpiresAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (result.outcome === 'accepted') {
        await deliveryRef.update({
            ...common,
            status: 'accepted',
            acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
            crmLeadId: result.data.leadId,
            crmContactId: result.data.contactId || null,
            crmOpportunityId: result.data.opportunityId || null,
            duplicate: result.duplicate === true,
            lastError: admin.firestore.FieldValue.delete(),
            nextAttemptAt: admin.firestore.FieldValue.delete()
        });
        return { attempted: true, accepted: true };
    }

    if (result.outcome === 'retry' && attemptNumber < CRM_LEAD_MAX_ATTEMPTS) {
        const delayMinutes = Math.min(5 * (2 ** (attemptNumber - 1)), 360);
        await deliveryRef.update({
            ...common,
            status: 'retry',
            lastError: result.code || 'transient_delivery_failure',
            nextAttemptAt: admin.firestore.Timestamp.fromMillis(
                Date.now() + (delayMinutes * (0.8 + Math.random() * 0.4)) * 60 * 1000
            )
        });
        return { attempted: true, accepted: false };
    }

    await deliveryRef.update({
        ...common,
        status: result.outcome === 'conflict' ? 'conflict' : 'failed',
        lastError: result.code || 'non_retryable_delivery_failure',
        validationErrors: result.errors || [],
        nextAttemptAt: admin.firestore.FieldValue.delete()
    });
    return { attempted: true, accepted: false };
}

// Preserve the deployed v6 disabled legacy guard under its existing export.
exports.syncLeadToCRM = functions.firestore.document('canvas_leads/{leadId}')
    .onCreate(require('./legacy-crm-trigger').runtimeHandler(process.env, (...args) => fetch(...args)));

// New adapter identity: never replace the preserved legacy trigger implicitly.
exports.onCanvasLeadForCRM = functions
    .runWith({ secrets: ['MERKAD_LEADS_KEY_ID', 'MERKAD_LEADS_SECRET'] })
    .firestore
    .document('canvas_leads/{leadId}')
    .onCreate(async (snapshot, context) => {
        const leadId = context.params.leadId;
        const leadData = snapshot.data();
        await createCrmLeadDelivery(leadId, leadData, context.timestamp);
        return null;
    });

async function createCrmLeadDelivery(leadId, leadData, timestamp) {
    const idempotencyKey = crmLeadIdempotencyKey(leadId);
    const config = crmLeadAdapterConfig();
    const testAuthorized = leadData.crmIntegrationTestAuthorized === true;
    let readiness = crmLeadDeliveryReadiness(config, leadId, testAuthorized);
    const deliveryRef = db.collection(CRM_LEAD_DELIVERIES_COLLECTION).doc(leadId);
    const mapping = crmLeadAdapter.buildRequestMapping(
        leadId,
        leadData,
        new Date(timestamp || Date.now()).toISOString(),
        communicationsPolicy.configFromEnv(process.env)
    );
    mapping.serviceMapping.confirmed = config.serviceAllowlistConfirmed;

    await crmTestState.createOutboxIfAbsent(db, deliveryRef, {
        leadId,
        idempotencyKey,
        serializedBody: mapping.serializedBody,
        serviceMapping: mapping.serviceMapping,
        unsupportedFields: mapping.unsupportedFields,
        testAuthorized,
        ...(leadData.communications ? { communications: leadData.communications } : {}),
        status: readiness.ready ? 'pending' : 'held',
        holdReason: readiness.ready ? null : readiness.reason,
        attemptCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (!readiness.ready) {
        console.log(`CRM lead ${leadId} held: ${readiness.reason}. Canvas lead remains accepted.`);
        return { created: true, delivered: false, reason: readiness.reason };
    }

    const deliverySnapshot = await deliveryRef.get();
    await deliverCrmLead(deliveryRef, deliverySnapshot.data());
    return { created: true, delivered: true };
}

exports.processCrmLeadDeliveryQueue = functions
    .runWith({ secrets: ['MERKAD_LEADS_KEY_ID', 'MERKAD_LEADS_SECRET'] })
    .pubsub
    .schedule('every 5 minutes')
    .onRun(async () => {
        const config = crmLeadAdapterConfig();
        const readiness = crmLeadDeliveryReadiness(config, config.testSubmissionId, true);
        if (!readiness.ready) {
            console.log(`CRM lead queue paused: ${readiness.reason}.`);
            return null;
        }

        const now = Date.now();
        if (readiness.mode === 'test-only') {
            const deliveryRef = db.collection(CRM_LEAD_DELIVERIES_COLLECTION).doc(config.testSubmissionId);
            const leadRef = db.collection('canvas_leads').doc(config.testSubmissionId);
            const testDoc = await crmTestState.recoverExactTestOutbox({
                deliveryRef,
                leadRef,
                createDelivery: (leadData) => createCrmLeadDelivery(
                    config.testSubmissionId,
                    leadData,
                    leadData.createdAt?.toDate?.() || new Date()
                )
            });
            if (testDoc && testDoc.exists && crmLeadAdapter.isClaimable(testDoc.data(), now)) {
                await deliverCrmLead(testDoc.ref, testDoc.data());
            }
            return null;
        }

        const snapshot = await db.collection(CRM_LEAD_DELIVERIES_COLLECTION)
            // Held records were captured while forwarding was disabled. They
            // require a separately reviewed replay operation and are excluded.
            .where('status', 'in', ['pending', 'retry', 'processing'])
            .limit(CRM_LEAD_BATCH_SIZE)
            .get();
        const eligible = snapshot.docs.filter((doc) => crmLeadAdapter.isClaimable(doc.data(), now));
        await Promise.all(eligible.map((doc) => deliverCrmLead(doc.ref, doc.data())));
        return null;
    });

exports.syncOrderToCRM = configuredFunctions.firestore
    .document('canvas_orders/{orderId}')
    .onCreate(async (snapshot, context) => {
        const orderData = snapshot.data();
        const orderId = context.params.orderId;

        console.log(`syncOrderToCRM triggered for order: ${orderId}`);

        const crmUrl = process.env.CRM_API_URL || runtimeConfig('crm', 'api_url');
        const crmApiKey = process.env.CRM_API_KEY || runtimeConfig('crm', 'api_key');

        if (!crmUrl) {
            console.log('CRM API URL not configured. Skipping sync.');
            return null;
        }

        const payload = {
            id: orderId,
            eventType: 'order.created',
            timestamp: new Date().toISOString(),
            data: orderData
        };

        const headers = {
            'Content-Type': 'application/json'
        };
        if (crmApiKey) {
            headers['Authorization'] = `Bearer ${crmApiKey}`;
        }

        try {
            console.log(`Sending order to CRM: ${crmUrl}`);
            const response = await fetch(crmUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(`CRM returned status ${response.status}: ${responseText}`);
            }

            console.log(`Successfully synced order ${orderId} to CRM.`);
        } catch (error) {
            console.error(`Error syncing order ${orderId} to CRM:`, error);
        }
        return null;
    });

// ----------------------------------------------------------------------
// SYSTEM MAINTENANCE: Scheduled Firestore Backups
// ----------------------------------------------------------------------

exports.cleanupExpiredLeadUploads = configuredFunctions.pubsub
    .schedule('every 6 hours')
    .onRun(async () => {
        const now = admin.firestore.Timestamp.now();
        const sessions = await db.collection('leadUploadSessions')
            .where('expiresAt', '<=', now)
            .limit(100)
            .get();
        const bucket = admin.storage().bucket();

        await Promise.all(sessions.docs.map(async (sessionSnapshot) => {
            const session = sessionSnapshot.data();
            if (!session.consumed) {
                await bucket.deleteFiles({
                    prefix: `lead-uploads/${sessionSnapshot.id}/`,
                    force: true
                });
            }
            const fileAuthorizations = await sessionSnapshot.ref.collection('files').get();
            const batch = db.batch();
            fileAuthorizations.docs.forEach((fileSnapshot) => batch.delete(fileSnapshot.ref));
            batch.delete(sessionSnapshot.ref);
            await batch.commit();
        }));

        console.log(`Cleaned ${sessions.size} expired lead upload sessions.`);
        return null;
    });

exports.scheduledFirestoreBackup = configuredFunctions.pubsub
    .schedule('every 24 hours')
    .onRun(async (context) => {
        const client = new firestore.v1.FirestoreAdminClient();
        const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'canvas-adnvertising';
        const databaseName = client.databasePath(projectId, '(default)');

        // Use the dedicated Firebase Storage bucket backups folder
        const bucket = 'gs://canvas-adnvertising.firebasestorage.app/backups';

        try {
            console.log(`Starting Firestore export for database: ${databaseName}`);
            const [responses] = await client.exportDocuments({
                name: databaseName,
                outputUriPrefix: bucket,
                collectionIds: [] // Empty array exports all collections
            });
            console.log(`Firestore export operation started successfully: ${responses.name}`);
            return { success: true, operationName: responses.name };
        } catch (err) {
            console.error('Firestore automated backup failed:', err);
            throw new functions.https.HttpsError('internal', 'Backup export operation failed: ' + err.message);
        }
    });
