/* ===================================
   Canvas Advertising - Firebase Configuration
   =================================== */

// Firebase configuration for canvas-adnvertising project
const firebaseConfig = {
    apiKey: "AIzaSyD51YXSY2Wp2q5PwSHeAeUaUUkbWCfM5QU",
    authDomain: "canvas-adnvertising.firebaseapp.com",
    projectId: "canvas-adnvertising",
    storageBucket: "canvas-adnvertising.firebasestorage.app",
    messagingSenderId: "835646149135",
    appId: "1:835646149135:web:b34edc32dd43c69923c97a",
    measurementId: "G-K6P9JYBWP3"
};
const APP_CHECK_SITE_KEY = '6Le6eq8tAAAAACnz0Kp-IId4zWzgiorK3tBMIP4-';

// Initialize Firebase (loaded from CDN in HTML)
let db = null;
let auth = null;
let storage = null;
let appCheck = null;
let firebaseClientReadyPromise = null;

function loadFirebaseCompatComponent(component) {
    if (typeof firebase === 'undefined') {
        return Promise.reject(new Error('Firebase core SDK is unavailable'));
    }
    const version = firebase.SDK_VERSION || '10.12.2';
    const source = `https://www.gstatic.com/firebasejs/${version}/firebase-${component}-compat.js`;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const onLoad = () => {
            script.dataset.canvasLoaded = 'true';
            resolve();
        };
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', () => reject(new Error(`Firebase ${component} SDK failed to load`)), { once: true });
        script.src = source;
        script.async = true;
        document.head.appendChild(script);
    });
}

async function ensureFirebaseClient(options = {}) {
    if (typeof firebase === 'undefined') throw new Error('Firebase core SDK is unavailable');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    if (!firebaseClientReadyPromise) {
        firebaseClientReadyPromise = (async () => {
            if (!firebase.appCheck || !firebase.appCheck.ReCaptchaEnterpriseProvider) {
                await loadFirebaseCompatComponent('app-check');
            }
            initializeFirebase();
            if (!firebase.functions) await loadFirebaseCompatComponent('functions');
            return true;
        })().catch((error) => {
            firebaseClientReadyPromise = null;
            throw error;
        });
    }
    await firebaseClientReadyPromise;

    if (options.storage && !firebase.storage) await loadFirebaseCompatComponent('storage');
    initializeFirebase();
    if (!appCheck || typeof appCheck.getToken !== 'function') {
        throw new Error('Firebase App Check is unavailable');
    }
    await appCheck.getToken(false);
    return true;
}

function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        // Check if already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        if (!appCheck && firebase.appCheck && firebase.appCheck.ReCaptchaEnterpriseProvider) {
            appCheck = firebase.appCheck();
            appCheck.activate(
                new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
                true
            );
        }
        db = firebase.firestore();
        // Safe init for Auth (optional for public site)
        if (firebase.auth) {
            auth = firebase.auth();
        }

        if (firebase.storage) {
            storage = firebase.storage();
        }

        // Safe init for Functions (optional)
        if (firebase.functions) {
            // firebase.functions(); // Initialize if needed, usually lazy
        }
        console.log('Firebase initialized successfully');
        return true;
    }
    console.warn('Firebase SDK not loaded');
    return false;
}

/**
 * Upload lead files to Firebase Storage.
 * @param {File[]} files - Browser File objects.
 * @param {string} pathPrefix - Storage folder prefix.
 * @returns {Promise<Array>} uploaded file metadata.
 */
async function uploadLeadFiles(files, pathPrefix) {
    await ensureFirebaseClient({ storage: true });
    if (!storage || !firebase.functions) throw new Error('Secure upload service is unavailable');
    const requestedFiles = files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || (/\.(ai|eps)$/i.test(file.name) ? 'application/octet-stream' : '')
    }));
    const sessionResponse = await firebase.functions().httpsCallable('createLeadUploadSession')({ files: requestedFiles });
    const session = sessionResponse && sessionResponse.data;
    if (!session || !session.submissionId || !session.token || !Array.isArray(session.files)
        || session.files.length !== files.length) {
        throw new Error('Secure upload service returned an invalid response');
    }

    const uploads = files.map(async (file, index) => {
        const authorizedFile = session.files[index];
        const safeName = authorizedFile.safeName || file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const filePath = `lead-uploads/${session.submissionId}/${authorizedFile.fileId}/${safeName}`;
        const ref = storage.ref().child(filePath);
        await ref.put(file, {
            contentType: authorizedFile.type,
            customMetadata: {
                source: String(pathPrefix || 'lead_upload').slice(0, 100),
                submissionId: session.submissionId,
                fileId: authorizedFile.fileId,
                originalName: authorizedFile.name,
                uploadToken: session.token
            }
        });
        return {
            name: authorizedFile.name,
            size: authorizedFile.size,
            type: authorizedFile.type,
            path: filePath,
            fileId: authorizedFile.fileId,
            submissionId: session.submissionId
        };
    });

    return Promise.all(uploads);
}

/**
 * Submit a public lead through the validated Cloud Function.
 * @param {Object} leadData - Form data object
 * @returns {Promise<Object>} submission result
 */
async function submitLead(leadData) {
    await ensureFirebaseClient();
    if (!firebase.functions) throw new Error('Secure lead service is unavailable');

    const uploadSubmissionId = Array.isArray(leadData.fileUploads)
        ? leadData.fileUploads.find((file) => file && file.submissionId)?.submissionId
        : null;
    const submissionId = leadData.submissionId || uploadSubmissionId || (
        window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
    );
    leadData.submissionId = submissionId;
    const lead = {
        ...leadData,
        submissionId,
        source: leadData.source || 'form_submit',
        service: leadData.service || 'General Inquiry'
    };

    try {
        const callable = firebase.functions().httpsCallable('submitPublicLead');
        const response = await callable(lead);
        if (!response || !response.data || response.data.ok !== true) {
            throw new Error('Secure lead service returned an invalid response');
        }
        console.log('Lead submitted with ID:', response.data.id);
        return response.data;
    } catch (error) {
        console.error('Error submitting lead:', error);
        throw error;
    }
}

/**
 * Get all leads (for admin dashboard)
 */
async function getLeads() {
    if (!db) {
        if (!initializeFirebase()) {
            throw new Error('Firebase not available');
        }
    }

    const snapshot = await db.collection('canvas_leads')
        .orderBy('createdAt', 'desc')
        .get();

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

/**
 * Update lead status
 */
async function updateLead(leadId, updates) {
    if (!db) {
        if (!initializeFirebase()) {
            throw new Error('Firebase not available');
        }
    }

    await db.collection('canvas_leads').doc(leadId).update({
        ...updates,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Track phone click events
 */
function trackPhoneClick() {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'phone_click', {
            'event_category': 'engagement',
            'event_label': 'header_phone'
        });
    }
}

/**
 * Track directions click
 */
function trackDirectionsClick() {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'directions_click', {
            'event_category': 'engagement'
        });
    }
}


/**
 * Delete a lead
 */
async function deleteLead(leadId) {
    if (!db) {
        if (!initializeFirebase()) {
            throw new Error('Firebase not available');
        }
    }

    await db.collection('canvas_leads').doc(leadId).delete();
}

/**
 * Delete a template
 */
async function deleteTemplate(templateId) {
    if (!db) {
        if (!initializeFirebase()) {
            throw new Error('Firebase not available');
        }
    }

    // Check both collections as we don't know the type from just ID easily without type param
    // But typically we pass type or just try deletion
    // For now, simpler to just try deleting from both or rely on ID uniqueness
    // Better: update backend to store all in one collection or pass type.
    // For now: Try email first, then SMS.

    try {
        await db.collection('emailTemplates').doc(templateId).delete();
        await db.collection('smsTemplates').doc(templateId).delete();
    } catch (e) {
        console.error("Error deleting template", e);
        throw e;
    }
}

// Export functions for use in main.js and admin.js
window.CanvasFirebase = {
    init: initializeFirebase,
    ready: ensureFirebaseClient,
    submitLead: submitLead,
    addLead: submitLead,
    uploadLeadFiles: uploadLeadFiles,
    getLeads: getLeads,
    updateLead: updateLead,
    deleteLead: deleteLead,
    deleteTemplate: deleteTemplate,
    trackPhoneClick: trackPhoneClick,
    trackDirectionsClick: trackDirectionsClick,
    getAuth: () => auth,
    getDb: () => db,
    get functions() {
        if (typeof firebase !== 'undefined' && firebase.functions) return firebase.functions();
        console.warn('Firebase Functions SDK not loaded');
        return null;
    }
};
