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

// Initialize Firebase (loaded from CDN in HTML)
let db = null;
let auth = null;

function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        // Check if already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();
        console.log('Firebase initialized successfully');
        return true;
    }
    console.warn('Firebase SDK not loaded');
    return false;
}

/**
 * Submit lead to Firebase Firestore
 * @param {Object} leadData - Form data object
 * @returns {Promise} - Firestore document reference
 */
async function submitLead(leadData) {
    if (!db) {
        // Try to initialize
        if (!initializeFirebase()) {
            throw new Error('Firebase not available');
        }
    }

    const lead = {
        ...leadData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: 'form_submit',
        status: 'new',
        notes: ''
    };

    try {
        const docRef = await db.collection('canvas_leads').add(lead);
        console.log('Lead submitted with ID:', docRef.id);

        // Track conversion event
        if (typeof gtag !== 'undefined') {
            gtag('event', 'generate_lead', {
                'event_category': 'engagement',
                'event_label': leadData.service || 'general'
            });
        }

        return docRef;
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

// Export functions for use in main.js and admin.js
window.CanvasFirebase = {
    init: initializeFirebase,
    submitLead: submitLead,
    getLeads: getLeads,
    updateLead: updateLead,
    trackPhoneClick: trackPhoneClick,
    trackDirectionsClick: trackDirectionsClick,
    getAuth: () => auth,
    getDb: () => db
};
