/* ===================================
   Canvas Advertising - Firebase Configuration
   =================================== */

// Firebase configuration for merkadagency project
const firebaseConfig = {
    apiKey: "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // TODO: Add your API key
    authDomain: "merkadagency-dd2aa.firebaseapp.com",
    projectId: "merkadagency-dd2aa",
    storageBucket: "merkadagency-dd2aa.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID", // TODO: Add from Firebase console
    appId: "YOUR_APP_ID" // TODO: Add from Firebase console
};

// Initialize Firebase (loaded from CDN in HTML)
let db = null;

function initializeFirebase() {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
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
        throw new Error('Firebase not initialized');
    }

    const lead = {
        ...leadData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: 'website',
        status: 'new',
        notified: false
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

// Export functions for use in main.js
window.CanvasFirebase = {
    init: initializeFirebase,
    submitLead: submitLead,
    trackPhoneClick: trackPhoneClick,
    trackDirectionsClick: trackDirectionsClick
};
