const functions = require('firebase-functions');
const admin = require('firebase-admin');
const plivo = require('plivo');
const { Resend } = require('resend');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ----------------------------------------------------------------------
// INTEGRATIONS: Resend & Plivo
// ----------------------------------------------------------------------

// 1. Get Resend Client (Lazy)
let resend = null;
function getResend() {
    if (!resend) {
        const apiKey = process.env.RESEND_API_KEY || functions.config().resend?.api_key || 're_123';
        if (!apiKey) {
            console.warn('Resend API Key missing.');
            return null;
        }
        resend = new Resend(apiKey);
    }
    return resend;
}

// 2. Get Plivo Client (Lazy)
let plivoClient = null;
function getPlivo() {
    if (!plivoClient) {
        const authId = process.env.PLIVO_AUTH_ID || functions.config().plivo?.auth_id;
        const authToken = process.env.PLIVO_AUTH_TOKEN || functions.config().plivo?.auth_token;
        if (!authId || !authToken) {
            console.warn('Plivo credentials missing.');
            return null;
        }
        plivoClient = new plivo.Client(authId, authToken);
    }
    return plivoClient;
}

// Company Info
const COMPANY_INFO = {
    name: 'Canvas Advertising',
    phone: '(512) 945-9783',
    website: 'https://canvas-adnvertising.web.app'
};

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

        // 2. Check if already active (prevent duplicate enrollment if needed)

        // 3. Create Workflow Instance (workflowContacts)
        const instanceData = {
            workflowId: workflowId,
            contactId: contactId,
            contactEmail: contactData.email,
            contactPhone: contactData.phone,
            contactName: contactData.name || contactData.firstName || 'Friend',
            status: 'active',
            currentStepIndex: 0,
            nextExecutionAt: admin.firestore.FieldValue.serverTimestamp(), // Execute Step 1 immediately
            history: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('workflowContacts').add(instanceData);
        console.log(`Enrolled successfully.`);

    } catch (error) {
        console.error('Error enrolling in workflow:', error);
    }
}

/**
 * Process Workflow Queue (Scheduled Function)
 * Finds active workflow instances with due steps and executes them
 */
// Running every minute to check for due steps
exports.processWorkflowQueue = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
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
                if (nextStep.delay) {
                    // delay is in minutes
                    const delayMillis = (nextStep.delay || 0) * 60 * 1000;
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
        return await sendSMS({
            to: instance.contactPhone,
            templateId: step.templateId,
            variables: variables,
            options: { workflowId: instance.workflowId, contactId: instance.contactId }
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
    if (!to) {
        console.warn('sendEmail: No recipient');
        return null;
    }

    try {
        const resendClient = getResend();
        if (!resendClient) {
            throw new Error('Resend Client unavailable');
        }

        // 1. Resolve content (Template or Direct)
        let html = options.html;
        let subject = options.subject;

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
        const result = await resendClient.emails.send({
            from: 'Canvas Advertising <noreply@canvas-advertising.com>',
            to: to,
            subject: subject,
            html: html
        });

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
    if (!to) {
        console.warn('sendSMS: No recipient');
        return null;
    }

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
        const srcNumber = process.env.PLIVO_PHONE_NUMBER || functions.config().plivo?.phone_number;

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

exports.onNewLead = functions.firestore
    .document('canvas_leads/{leadId}')
    .onCreate(async (snapshot, context) => {
        const leadData = snapshot.data();
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
 * Receives booking notifications from Cal.com and saves them as leads
 */
exports.calcomWebhook = functions.https.onRequest(async (req, res) => {
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

exports.serveProjectPage = functions.https.onRequest(async (req, res) => {
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

exports.seedWorkflows = functions.https.onRequest(async (req, res) => {
    try {
        const workflows = [
            {
                id: 'wf_welcome',
                name: 'New Form Lead Welcome',
                trigger: 'form_submit',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'welcome', delay: 0 }, // Immediate
                    { type: 'sms', templateId: 'sms_welcome', delay: 2 }, // 2 min delay
                    { type: 'task', description: 'Review new lead submission', delay: 0 },
                    { type: 'email', templateId: 'follow_up_no_response', delay: 2880 } // 48 hours (2880 mins)
                ]
            },
            {
                id: 'wf_booking',
                name: 'Booking Confirmation & Reminders',
                trigger: 'booking',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'booking_confirmed', delay: 0 },
                    { type: 'sms', templateId: 'sms_booking_confirmed', delay: 0 },
                    { type: 'task', description: 'Prepare for consultation', delay: 0 }
                ]
            },
            {
                id: 'wf_project_thanks',
                name: 'Project Completion Thank You',
                trigger: 'status_change',
                triggerStatus: 'completed',
                enabled: true,
                steps: [
                    { type: 'email', templateId: 'thank_you_post_project', delay: 0 },
                    { type: 'sms', templateId: 'sms_thank_you', delay: 10 } // 10 mins
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

exports.seedTemplates = functions.https.onRequest(async (req, res) => {
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
