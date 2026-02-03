/* ===================================
   Canvas Advertising - Admin Dashboard JavaScript
   =================================== */

// Allowed admin emails (whitelist)
const ALLOWED_EMAILS = [
    'camiloreyna@canvas-advertising.com',
    'camilo@canvas-advertising.com',
    'sales@canvas-advertising.com'
];

// Trigger labels
const TRIGGER_LABELS = {
    form_submit: '📝 Quote Form Submitted',
    booking: '📅 Cal.com Booking',
    status_change: '🔄 Status Changed',
    manual_campaign: '📢 Bulk Campaign (Manual)'
};

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const googleSignInBtn = document.getElementById('googleSignIn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailEl = document.getElementById('userEmail');
const leadsBody = document.getElementById('leadsBody');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');
const leadModal = document.getElementById('leadModal');
const closeModal = document.getElementById('closeModal');
const modalBody = document.getElementById('modalBody');

// Stats elements
const totalLeadsEl = document.getElementById('totalLeads');
const newLeadsEl = document.getElementById('newLeads');
const contactedLeadsEl = document.getElementById('contactedLeads');
const quotedLeadsEl = document.getElementById('quotedLeads');
const wonLeadsEl = document.getElementById('wonLeads');

// State
let allLeads = [];
let currentLead = null;
let allEmailTemplates = [];
let allSmsTemplates = [];
let allWorkflows = [];
let currentWorkflow = null;
let currentWfFolder = 'all'; // State

// Initialize Firebase
document.addEventListener('DOMContentLoaded', async function () {
    // --- WORKFLOW LISTENERS (Moved to top for safety) ---
    try {
        const createWorkflowBtn = document.getElementById('createWorkflowBtn');
        const closeWorkflowModalBtn = document.getElementById('closeWorkflowModal');
        const workflowForm = document.getElementById('workflowForm');
        const workflowTrigger = document.getElementById('workflowTrigger');
        const deleteWorkflowBtn = document.getElementById('deleteWorkflowBtn');
        const workflowModal = document.getElementById('workflowModal');
        // Define saveTemplateBtn here which was missing
        const saveTemplateBtn = document.getElementById('saveTemplateBtn');

        if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', saveTemplate);
        if (createWorkflowBtn) createWorkflowBtn.addEventListener('click', openCreateWorkflowModal);
        if (closeWorkflowModalBtn) closeWorkflowModalBtn.addEventListener('click', closeWorkflowModal);
        if (workflowForm) workflowForm.addEventListener('submit', saveWorkflow);
        if (workflowTrigger) {
            workflowTrigger.addEventListener('change', function () {
                const val = this.value;
                document.getElementById('statusTriggerConfig').style.display =
                    val === 'status_change' ? 'block' : 'none';

                // Show Audience/Status selector for Campaigns
                const audienceGroup = document.getElementById('audienceConfig');
                if (audienceGroup) {
                    audienceGroup.style.display = val === 'manual_campaign' ? 'block' : 'none';
                }
            });
        }
        if (deleteWorkflowBtn) deleteWorkflowBtn.addEventListener('click', deleteWorkflow);
        if (workflowModal) {
            workflowModal.addEventListener('click', function (e) {
                if (e.target === workflowModal) closeWorkflowModal();
            });
        }
        document.querySelectorAll('[data-wf-tab]').forEach(tab => {
            tab.addEventListener('click', () => switchWfTab(tab.dataset.wfTab));
        });
    } catch (e) { console.error('Listener Init Error:', e); }
    // ----------------------------------------------------

    // --- MOBILE SIDEBAR LOGIC ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function toggleSidebar(show) {
        if (show) {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        } else {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        }
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => toggleSidebar(true));
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Close sidebar when clicking a nav link (mobile UX)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                toggleSidebar(false);
            }
        });
    });
    // -----------------------------

    if (window.CanvasFirebase) {
        window.CanvasFirebase.init();
    }

    // Set auth persistence to LOCAL (persists across browser restarts)
    try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (error) {
        console.error('Error setting persistence:', error);
    }

    // Check auth state
    firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
            // Check if user email is in whitelist
            if (isAuthorizedUser(user.email)) {
                showDashboard(user);
                loadLeads();
            } else {
                // Not authorized - sign out
                firebase.auth().signOut();
                loginError.textContent = 'Access denied. Your email is not authorized.';
            }
        } else {
            showLogin();
        }
    });
});

// Check if user is authorized
function isAuthorizedUser(email) {
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Checking authorization for email:', normalizedEmail);
    console.log('Allowed emails:', ALLOWED_EMAILS);
    const isAllowed = ALLOWED_EMAILS.includes(normalizedEmail);
    console.log('Authorization result:', isAllowed);
    return isAllowed;
}

// Show login screen
function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
}

// Show dashboard
function showDashboard(user) {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'flex'; // Changed from block to flex for sidebar layout
    userEmailEl.textContent = user.email;

    // Set initial title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = 'Leads Dashboard';
}

// Google Sign-In
googleSignInBtn.addEventListener('click', async function () {
    loginError.textContent = '';

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    try {
        await firebase.auth().signInWithPopup(provider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            loginError.textContent = 'Sign-in cancelled.';
        } else if (error.code === 'auth/popup-blocked') {
            loginError.textContent = 'Pop-up blocked. Please allow pop-ups for this site.';
        } else {
            loginError.textContent = 'Sign-in failed. Please try again.';
        }
    }
});

// Logout
logoutBtn.addEventListener('click', function () {
    firebase.auth().signOut();
});

// Load leads from Firestore
// Load leads from Firestore (Real-time listener)
function loadLeads() {
    loadingState.style.display = 'block';

    // Check if db is explicitly available, if not try to get it
    let db = window.CanvasFirebase.getDb();
    if (!db) {
        window.CanvasFirebase.init();
        db = window.CanvasFirebase.getDb();
    }

    if (!db) {
        console.error('Firestore not initialized');
        loadingState.innerHTML = '<p>Error connecting to database.</p>';
        return;
    }

    // Replace single fetch with onSnapshot
    db.collection('canvas_leads')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            loadingState.style.display = 'none';
            emptyState.style.display = 'none';

            allLeads = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filter out deleted leads purely as a safety mechanism implies they should be gone from snapshot anyway
            // but if we have local state management, this overwrites it cleanly.

            if (allLeads.length === 0) {
                emptyState.style.display = 'block';
                leadsBody.innerHTML = '';
            } else {
                updateStats();
                filterLeads(); // This calls renderLeads
            }
        }, (error) => {
            console.error('Error loading leads:', error);
            loadingState.innerHTML = '<p>Error loading leads. Please refresh.</p>';
        });
}

// Update stats
function updateStats() {
    totalLeadsEl.textContent = allLeads.length;
    newLeadsEl.textContent = allLeads.filter(l => l.status === 'new').length;
    contactedLeadsEl.textContent = allLeads.filter(l => l.status === 'contacted').length;
    quotedLeadsEl.textContent = allLeads.filter(l => l.status === 'quoted').length;
    wonLeadsEl.textContent = allLeads.filter(l => l.status === 'won').length;
}

// Render leads table
function renderLeads(leads) {
    loadingState.style.display = 'none';

    if (leads.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    leadsBody.innerHTML = leads.map(lead => `
        <tr data-id="${lead.id}">
            <td>${formatDate(lead.createdAt)}</td>
            <td>
                <strong>${escapeHtml(lead.name)}</strong>
                <span class="source-badge source-badge--${lead.source || 'website'}" title="${lead.source === 'booking' ? 'Cal.com Booking' : 'Quote Form'}">
                    ${lead.source === 'booking' ? '📅' : '📝'}
                </span>
            </td>
            <td><a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a></td>
            <td>${lead.email ? `<a href="mailto:${lead.email}">${escapeHtml(lead.email)}</a>` : '-'}</td>
            <td>${lead.service || '-'}</td>
            <td>
                <select class="status-select" onchange="updateStatus('${lead.id}', this.value)">
                    <option value="new" ${lead.status === 'new' ? 'selected' : ''}>🔴 New</option>
                    <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>🔵 Contacted</option>
                    <option value="quoted" ${lead.status === 'quoted' ? 'selected' : ''}>🟡 Quoted</option>
                    <option value="won" ${lead.status === 'won' ? 'selected' : ''}>🟢 Won</option>
                    <option value="lost" ${lead.status === 'lost' ? 'selected' : ''}>⚪ Lost</option>
                </select>
            </td>
            <td>
                <div class="action-btns">
                    <button class="btn btn--outline btn--small" onclick="viewLead('${lead.id}')">View</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update lead status
async function updateStatus(leadId, newStatus) {
    try {
        await window.CanvasFirebase.updateLead(leadId, { status: newStatus });

        // Update local state
        const lead = allLeads.find(l => l.id === leadId);
        if (lead) {
            lead.status = newStatus;
            updateStats();
        }
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update status. Please try again.');
        loadLeads(); // Reload to reset
    }
}

// Modal Tab Switching
document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        tab.classList.add('active');

        // Hide all content content
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

        // Show target content
        const targetId = tab.dataset.modalTab;
        const targetContent = document.getElementById(`tab-${targetId}`);
        if (targetContent) targetContent.classList.add('active');

        // Load History if selected
        if (targetId === 'history' && currentLead) {
            loadContactHistory(currentLead);
        }
    });
});

// View lead details (Contact Profile)
async function viewLead(leadId) {
    currentLead = allLeads.find(l => l.id === leadId);
    if (!currentLead) return;

    // Reset Tabs
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

    // Default to Profile
    document.querySelector('[data-modal-tab="profile"]').classList.add('active');

    // Main Container
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <!-- Profile Tab -->
        <div id="tab-profile" class="modal-tab-content active">
            <!-- Quick Actions -->
            <div class="quick-actions" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #eee;">
                <button class="btn btn--outline btn--small" onclick="openComposeModal('email')">📧 Send Email</button>
                <button class="btn btn--outline btn--small" onclick="openComposeModal('sms')">💬 Send SMS</button>
            </div>

            <div class="detail-row">
                <span class="detail-row__label">Name</span>
                <span class="detail-row__value">${escapeHtml(currentLead.name)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-row__label">Phone</span>
                <span class="detail-row__value"><a href="tel:${currentLead.phone}">${escapeHtml(currentLead.phone)}</a></span>
            </div>
            <div class="detail-row">
                <span class="detail-row__label">Email</span>
                <span class="detail-row__value">${currentLead.email ? `<a href="mailto:${currentLead.email}">${escapeHtml(currentLead.email)}</a>` : '-'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-row__label">Service</span>
                <span class="detail-row__value">${currentLead.service || '-'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-row__label">Message</span>
                <span class="detail-row__value">${currentLead.message ? escapeHtml(currentLead.message) : '-'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-row__label">Date</span>
                <span class="detail-row__value">${formatDate(currentLead.createdAt)} at ${formatTime(currentLead.createdAt)}</span>
            </div>
            
            <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid var(--gray-light);">
            
            <div class="form-group">
                <label for="leadNotes">Notes</label>
                <textarea id="leadNotes" class="form-textarea" placeholder="Add notes about this lead...">${currentLead.notes || ''}</textarea>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                <button class="btn btn--primary" onclick="saveNotes()">Save Notes</button>
                <button class="btn btn--outline" style="color: #dc3545; border-color: #dc3545;" onclick="deleteLead('${currentLead.id}')">Delete Lead</button>
            </div>
        </div>

        <!-- History Tab (Timeline) -->
        <div id="tab-history" class="modal-tab-content">
            <div id="historyTimeline" class="timeline">
                <div style="text-align: center; color: #999;">Loading history...</div>
            </div>
        </div>
    `;

    leadModal.classList.add('active');
}

function getStatusBadge(status) {
    if (!status) return '';
    const styles = {
        'sent': 'background: #e2e8f0; color: #475569;',
        'delivered': 'background: #dcfce7; color: #166534;',
        'opened': 'background: #dbeafe; color: #1e40af;',
        'clicked': 'background: #fae8ff; color: #86198f;',
        'failed': 'background: #fee2e2; color: #991b1b;',
        'error': 'background: #fee2e2; color: #991b1b;'
    };
    const labels = {
        'sent': 'Sent',
        'delivered': 'Delivered',
        'opened': 'Opened',
        'clicked': 'Clicked',
        'failed': 'Failed',
        'error': 'Error'
    };
    return `<span style="padding: 2px 6px; border-radius: 4px; font-weight: 500; ${styles[status] || styles['sent']}">${labels[status] || status}</span>`;
}

// Load Contact History (Timeline)
async function loadContactHistory(lead) {
    const timelineContainer = document.getElementById('historyTimeline');
    if (!timelineContainer) return;

    timelineContainer.innerHTML = '<div style="text-align: center; color: #999;">Loading conversation history...</div>';

    try {
        const db = window.CanvasFirebase.getDb();

        // NEW APPROACH: Client-side sorting to bypass complex Index requirements
        // 1. Try fetching by Contact ID (reliable)
        let snapshot = await db.collection('communicationLogs')
            .where('contactId', '==', lead.id)
            .get();

        // 2. If no ID match or just to cover bases, we could query by email, 
        // but 'IN' queries + Sort are what caused the error.
        // Let's rely on Contact ID for now as it's saved by the new system.

        // If empty and we have an email, try simple email query (without sort)
        if (snapshot.empty && lead.email) {
            snapshot = await db.collection('communicationLogs')
                .where('recipient', '==', lead.email)
                .get();
        }

        if (snapshot.empty) {
            timelineContainer.innerHTML = '<div class="empty-state">No history found. (0 messages)</div>';
            return;
        }

        let logs = snapshot.docs.map(doc => doc.data());

        // Manual Sort (Newest First)
        logs.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
            const tB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
            return tB - tA;
        });

        timelineContainer.innerHTML = logs.map(log => {
            const isEmail = log.type === 'email';
            const icon = isEmail ? '📧' : '💬';
            const typeClass = isEmail ? 'email' : 'sms';

            // Safe access to content
            const content = log.content || {};
            const subject = content.subject || 'No Subject';
            const body = content.body || content.message || ''; // Handle both fields

            const title = isEmail ? (subject) : 'SMS Sent';

            return `
                <div class="timeline-item">
                    <div class="timeline-icon ${typeClass}">${icon}</div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <strong>${escapeHtml(title)}</strong>
                            <span class="timeline-date">${formatDate(log.timestamp)} ${formatTime(log.timestamp)}</span>
                        </div>
                        <div class="timeline-body">
                            ${body ? `<p>${escapeHtml(body)}</p>` : `<small>Template: ${content.templateId || 'N/A'}</small>`}
                            
                            <div style="margin-top: 5px; font-size: 0.8em;">
                                ${getStatusBadge(log.status)}
                                ${log.error ? `<span style="color:red; margin-left: 5px;">(${log.error})</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error("Error loading history:", e);
        timelineContainer.innerHTML = `<div style="color: red; text-align: center;">Error loading history: ${e.message}</div>`;
    }
}

// Save notes
async function saveNotes() {
    if (!currentLead) return;

    const notes = document.getElementById('leadNotes').value;

    try {
        await window.CanvasFirebase.updateLead(currentLead.id, { notes });
        currentLead.notes = notes;
        leadModal.classList.remove('active');
    } catch (error) {
        console.error('Error saving notes:', error);
        alert('Failed to save notes. Please try again.');
    }
}

// Close modal
closeModal.addEventListener('click', function () {
    leadModal.classList.remove('active');
});

leadModal.addEventListener('click', function (e) {
    if (e.target === leadModal) {
        leadModal.classList.remove('active');
    }
});

// Search and filter
searchInput.addEventListener('input', filterLeads);
statusFilter.addEventListener('change', filterLeads);

function filterLeads() {
    const search = searchInput.value.toLowerCase();
    const status = statusFilter.value;

    let filtered = allLeads;

    if (search) {
        filtered = filtered.filter(lead =>
            lead.name.toLowerCase().includes(search) ||
            lead.phone.includes(search) ||
            (lead.email && lead.email.toLowerCase().includes(search))
        );
    }

    if (status) {
        filtered = filtered.filter(lead => lead.status === status);
    }

    renderLeads(filtered);
}


// Delete Lead
async function deleteLead(leadId) {
    if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
        return;
    }

    try {
        await window.CanvasFirebase.deleteLead(leadId);

        // Update local state
        allLeads = allLeads.filter(l => l.id !== leadId);
        updateStats();

        // Re-render table (applying current filters)
        filterLeads();

        // Force reload from server to ensure UI is in sync (fixes "didn't disappear" issue)
        await loadLeads();

        // Close modal
        leadModal.classList.remove('active');

    } catch (error) {
        console.error('Error deleting lead:', error);
        alert('Failed to delete lead: ' + error.message);
    }
}

// Refresh
refreshBtn.addEventListener('click', loadLeads);

// Utility functions
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally available
window.updateStatus = updateStatus;
window.viewLead = viewLead;
window.saveNotes = saveNotes;
window.deleteLead = deleteLead;
window.runCampaign = runCampaign;

/* ===================================
   Email Templates Section
   =================================== */

// Default email templates
const DEFAULT_TEMPLATES = {
    form: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #1a1a1a;">Thanks for Reaching Out! 🙌</h1>
    <p>Hi {{name}},</p>
    <p>Thank you for contacting <strong>Canvas Advertising</strong>!</p>
    <p>We've received your request for <strong>{{service}}</strong> and will get back to you within 24 hours with a free quote.</p>
    <p>In the meantime, feel free to call us at <strong>(512) 945-9783</strong> if you have any urgent questions.</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <p><strong>Canvas Advertising</strong><br>
    📞 (512) 945-9783<br>
    🌐 https://canvas-adnvertising.web.app</p>
</div>`,
    booking: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #1a1a1a;">Your Consultation is Confirmed! 🎉</h1>
    <p>Hi {{name}},</p>
    <p>Thank you for booking a consultation with <strong>Canvas Advertising</strong>!</p>
    <p><strong>Scheduled Time:</strong> {{startTime}}</p>
    <p>We're excited to discuss how we can help transform your brand visibility with our professional vehicle wraps, signage, and printing services.</p>
    <hr style="border: 1px solid #eee; margin: 20px 0;">
    <p><strong>Canvas Advertising</strong><br>
    📞 (512) 945-9783<br>
    🌐 https://canvas-adnvertising.web.app</p>
</div>`
};

// Template state
let currentTemplateType = 'form';
let templates = { ...DEFAULT_TEMPLATES };

// ==========================================
// ANALYTICS & CHARTS
// ==========================================

let deliveryChartInstance = null;
let funnelChartInstance = null;

async function loadAnalytics() {
    const statsContainer = document.querySelector('#analyticsTab .stats');
    if (statsContainer) statsContainer.style.opacity = '0.5';

    try {
        const getAggregatedStats = window.CanvasFirebase.functions.httpsCallable('getAggregatedStats');
        const result = await getAggregatedStats();
        const data = result.data;

        const email = data.email;

        // Calculate Rates
        const openRate = email.delivered > 0 ? ((email.opened / email.delivered) * 100).toFixed(1) : 0;
        const clickRate = email.delivered > 0 ? ((email.clicked / email.delivered) * 100).toFixed(1) : 0;
        const bounceRate = email.sent > 0 ? ((email.failed / email.sent) * 100).toFixed(1) : 0;

        // Update Stat Cards
        document.getElementById('emailSent').textContent = email.sent;
        document.getElementById('emailOpenRate').textContent = openRate + '%';
        document.getElementById('emailClickRate').textContent = clickRate + '%';
        document.getElementById('emailBounceRate').textContent = bounceRate + '%';

        // Update Charts
        updateCharts(email);

    } catch (error) {
        console.error("Analytics Error:", error);
        alert("Failed to load analytics: " + error.message);
    } finally {
        if (statsContainer) statsContainer.style.opacity = '1';
    }
}

function updateCharts(emailData) {
    const deliveryCtx = document.getElementById('deliveryChart').getContext('2d');
    const funnelCtx = document.getElementById('funnelChart').getContext('2d');

    // 1. Delivery Pie Chart
    if (deliveryChartInstance) deliveryChartInstance.destroy();

    deliveryChartInstance = new Chart(deliveryCtx, {
        type: 'doughnut',
        data: {
            labels: ['Delivered', 'Failed'],
            datasets: [{
                data: [emailData.delivered, emailData.failed],
                backgroundColor: ['#10B981', '#EF4444'], // Green, Red
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Funnel Bar Chart
    if (funnelChartInstance) funnelChartInstance.destroy();

    funnelChartInstance = new Chart(funnelCtx, {
        type: 'bar',
        data: {
            labels: ['Sent', 'Delivered', 'Opened', 'Clicked'],
            datasets: [{
                label: 'Email Counts',
                data: [emailData.sent, emailData.delivered, emailData.opened, emailData.clicked],
                backgroundColor: ['#6366F1', '#10B981', '#3B82F6', '#8B5CF6'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}
// Tab Navigation
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
        const tabId = this.dataset.tab;
        const pageTitle = document.getElementById('pageTitle');

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        // Update dynamic page title
        if (pageTitle) {
            const labels = {
                'leads': 'Leads Dashboard',
                'emails': 'Automation Workflows',
                'logs': 'Activity Logs',
                'analytics': 'Analytics'
            };
            pageTitle.textContent = labels[tabId] || 'Dashboard';
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });

        const targetTab = document.getElementById(tabId + 'Tab');
        if (targetTab) {
            targetTab.style.display = 'block';
            targetTab.classList.add('active');
        }

        // Load templates and workflows when switching to emails tab
        if (tabId === 'emails') {
            loadTemplates();
            loadWorkflows();
        }

        // Load logs when switching to logs tab
        if (tabId === 'logs') {
            loadLogs();
        }

        // Load analytics when switching to analytics tab
        if (tabId === 'analytics') {
            loadAnalytics();
        }
    });
});



// ----------------------------------------------------------------------
// LOGS SECTION
// ----------------------------------------------------------------------

async function loadLogs() {
    const logsBody = document.getElementById('logsBody');
    const logsLoading = document.getElementById('logsLoadingState');
    const logsEmpty = document.getElementById('logsEmptyState');

    if (!logsBody) return;

    if (logsLoading) logsLoading.style.display = 'block';
    if (logsEmpty) logsEmpty.style.display = 'none';
    logsBody.innerHTML = '';

    try {
        // Ensure DB initialized
        let db = window.CanvasFirebase.getDb();
        if (!db) {
            window.CanvasFirebase.init();
            db = window.CanvasFirebase.getDb();
        }

        if (!db) throw new Error("Database not initialized");

        // Use a simpler query first to debug
        const snapshot = await db.collection('communicationLogs')
            .limit(20)
            .get();

        if (snapshot.empty) {
            if (logsLoading) logsLoading.style.display = 'none';
            if (logsEmpty) {
                logsEmpty.style.display = 'block';
                logsEmpty.innerHTML = `
                    <p>No logs found in 'communicationLogs' collection.</p>
                    <p><small>(This means no emails/SMS have been successfully logged yet.)</small></p>
                `;
            }
            return;
        }

        let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Client-side Sort (Newest First)
        logs.sort((a, b) => {
            const tA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : 0;
            const tB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : 0;
            return tB - tA;
        });

        renderLogs(logs);
        if (logsLoading) logsLoading.style.display = 'none';

    } catch (error) {
        console.error('Error loading logs:', error);
        if (logsLoading) logsLoading.innerHTML = `<p style="color:red">Error: ${error.message}</p><p><small>Check console for details.</small></p>`;
    }
}

function renderLogs(logs) {
    const logsBody = document.getElementById('logsBody');
    if (!logsBody) return;

    logsBody.innerHTML = logs.map(log => {
        const type = log.type || 'unknown'; // default
        const status = log.status || 'unknown';
        const recipient = log.recipient || 'Unknown Recipient';

        // Safe timestamp handling
        let dateStr = '-';
        if (log.timestamp) {
            try {
                dateStr = formatDate(log.timestamp) + ' ' + formatTime(log.timestamp);
            } catch (e) { dateStr = 'Invalid Date'; }
        }

        const icon = type === 'email' ? '📧' : (type === 'sms' ? '💬' : '❓');
        const badgeColor = type === 'email' ? 'blue' : (type === 'sms' ? 'green' : 'gray');

        // Safe content handling
        let details = '-';
        if (log.content) {
            details = log.content.subject || log.content.body || log.content.templateId || 'No content';
        }

        return `
        <tr>
            <td>${dateStr}</td>
            <td>
                <span class="badge badge--${badgeColor}">
                    ${icon} ${type.toUpperCase()}
                </span>
            </td>
            <td>${escapeHtml(recipient)}</td>
            <td>
                <span class="status-dot ${status === 'sent' || status === 'delivered' ? 'status-dot--success' : 'status-dot--error'}"></span>
                ${status.toUpperCase()}
            </td>
            <td>
                <small>${escapeHtml(details)}</small>
                ${log.error ? `<div class="error-text">${escapeHtml(log.error)}</div>` : ''}
            </td>
        </tr>
    `}).join('');
}

const refreshLogsBtn = document.getElementById('refreshLogsBtn');
if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadLogs);
}



/* ===================================
   Template Manager Logic
   =================================== */

// Elements
const tmList = document.getElementById('tmList');
const tmFolderList = document.getElementById('tmFolderList'); // NEW
const folderOptions = document.getElementById('folderOptions'); // NEW
const tmSearch = document.getElementById('tmSearch');
const tmTypeFilter = document.getElementById('tmTypeFilter');
const tmForm = document.getElementById('tmForm');
const tmEditor = document.getElementById('tmEditor');
const tmEmptyState = document.getElementById('tmEmptyState');

const tmId = document.getElementById('tmId');
const tmIsNew = document.getElementById('tmIsNew');
const tmType = document.getElementById('tmType');
const tmName = document.getElementById('tmName');
const tmCategory = document.getElementById('tmCategory'); // NEW
const tmSubject = document.getElementById('tmSubject');
const tmSubjectGroup = document.getElementById('tmSubjectGroup');
const tmBody = document.getElementById('tmBody');
const tmPreview = document.getElementById('tmPreview'); // NEW
const tmDeleteBtn = document.getElementById('tmDeleteBtn');
const tmTestBtn = document.getElementById('tmTestBtn');
const createNewTemplateBtn = document.getElementById('createNewTemplateBtn');

let currentTmSelection = null;
let currentFolderSelection = 'all'; // 'all', 'uncategorized', or specific name

// Helper
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Alias for tab switching
async function loadTemplates() {
    // Ensure data is loaded
    if (allEmailTemplates.length === 0) {
        await loadAllTemplates();
    }
    renderFolderList(); // NEW
    renderTemplateList();
}

// 0. Render Folders
function renderFolderList() {
    if (!tmFolderList) return;

    // Extract categories
    const allTemplates = [...allEmailTemplates, ...allSmsTemplates];
    const categories = new Set();
    allTemplates.forEach(t => {
        if (t.category) categories.add(t.category);
    });

    const sortedCategories = Array.from(categories).sort();

    // Update Datalist for Autocomplete
    if (folderOptions) {
        folderOptions.innerHTML = sortedCategories.map(c => `<option value="${c}">`).join('');
    }

    // Render Sidebar List
    let html = `
        <div class="folder-item ${currentFolderSelection === 'all' ? 'active' : ''}" onclick="selectFolder('all')">
            📂 All Templates
        </div>
        <div class="folder-item ${currentFolderSelection === 'uncategorized' ? 'active' : ''}" onclick="selectFolder('uncategorized')">
            📁 Uncategorized
        </div>
    `;

    sortedCategories.forEach(cat => {
        html += `
            <div class="folder-item ${currentFolderSelection === cat ? 'active' : ''}" onclick="selectFolder('${cat}')">
                📁 ${escapeHtml(cat)}
            </div>
        `;
    });

    tmFolderList.innerHTML = html;
}

window.selectFolder = function (folder) {
    currentFolderSelection = folder;
    renderFolderList(); // Highlight
    renderTemplateList(); // Filter
}

// 1. Render List (Modified for Folders)
function renderTemplateList() {
    if (!tmList) return;

    const searchTerm = tmSearch ? tmSearch.value.toLowerCase() : '';
    const typeFilter = tmTypeFilter ? tmTypeFilter.value : 'all';

    // Combine lists
    let items = [];
    if (typeFilter === 'all' || typeFilter === 'email') {
        items = items.concat(allEmailTemplates.map(t => ({ ...t, _type: 'email' })));
    }
    if (typeFilter === 'all' || typeFilter === 'sms') {
        items = items.concat(allSmsTemplates.map(t => ({ ...t, _type: 'sms' })));
    }

    // Filter by Folder
    if (currentFolderSelection !== 'all') {
        if (currentFolderSelection === 'uncategorized') {
            items = items.filter(i => !i.category);
        } else {
            items = items.filter(i => i.category === currentFolderSelection);
        }
    }

    // Filter by Search
    items = items.filter(item => {
        const matchesSearch = (item.id.toLowerCase().includes(searchTerm) ||
            (item.subject || '').toLowerCase().includes(searchTerm) ||
            (item.message || '').toLowerCase().includes(searchTerm));
        return matchesSearch;
    });

    // Render
    if (items.length === 0) {
        tmList.innerHTML = '<div style="padding:1rem;color:#999;text-align:center;">No templates found.</div>';
        return;
    }

    tmList.innerHTML = items.map(item => `
        <div class="tm-list-item ${currentTmSelection === item.id ? 'active' : ''}" onclick="selectTemplate('${item.id}', '${item._type}')">
            <div class="tm-item-title">${escapeHtml(item.name || item.id)}</div>
            <div class="tm-item-meta">
                <span>${item._type === 'email' ? '📧' : '💬'}</span>
                <span>${item.category ? `<span style="background:#eee;padding:0 2px;border-radius:2px;">${escapeHtml(item.category)}</span>` : ''}</span>
            </div>
        </div>
    `).join('');
}

// 2. Select Template
window.selectTemplate = function (id, type) {
    currentTmSelection = id;
    renderTemplateList(); // Re-render to highlight active

    const collection = type === 'email' ? allEmailTemplates : allSmsTemplates;
    const template = collection.find(t => t.id === id);

    if (!template) return;

    // Show Form
    tmEmptyState.style.display = 'none';
    tmForm.style.display = 'block';

    // Populate
    tmId.value = template.id;
    tmIsNew.value = 'false';
    tmType.value = type;
    tmType.disabled = true;
    tmName.value = template.id;
    tmName.disabled = true;

    // Set Category
    tmCategory.value = template.category || '';

    if (type === 'email') {
        tmSubjectGroup.style.display = 'block';
        tmSubject.value = template.subject || '';
        tmBody.value = template.html || '';
        tmBody.placeholder = '<html>\n  <body>\n    <p>Hi {{firstName}},</p>\n    ...\n  </body>\n</html>';
    } else {
        tmSubjectGroup.style.display = 'none';
        tmBody.value = template.message || '';
        tmBody.placeholder = 'Enter SMS message...';
    }

    updateLivePreview(); // Initial render
};

// 3. Create New logic
function openNewTemplate() {
    currentTmSelection = null;
    renderTemplateList();

    tmEmptyState.style.display = 'none';
    tmForm.style.display = 'block';

    tmId.value = '';
    tmIsNew.value = 'true';
    tmType.value = 'email';
    tmType.disabled = false;
    tmName.value = '';
    tmName.disabled = false;
    tmSubject.value = '';
    tmBody.value = '';

    // Default Category to current folder if specific
    if (currentFolderSelection !== 'all' && currentFolderSelection !== 'uncategorized') {
        tmCategory.value = currentFolderSelection;
    } else {
        tmCategory.value = '';
    }

    tmSubjectGroup.style.display = 'block';
}

// 4. Save Template
async function saveTemplateManager(e) {
    e.preventDefault();

    const isNew = tmIsNew.value === 'true';
    const type = tmType.value;
    const id = tmName.value.trim();
    const category = tmCategory.value.trim(); // NEW
    const subject = tmSubject.value.trim();
    const body = tmBody.value.trim();

    if (!id || (type === 'email' && !subject) || !body) {
        alert('Please fill all fields.');
        return;
    }

    const collectionName = type === 'email' ? 'emailTemplates' : 'smsTemplates';
    const data = {
        id,
        name: id,
        category: category || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (type === 'email') {
        data.subject = subject;
        data.html = body;
    } else {
        data.message = body;
    }

    try {
        const db = window.CanvasFirebase.getDb();

        if (isNew) {
            const check = await db.collection(collectionName).doc(id).get();
            if (check.exists) {
                alert('Template ID already exists. Choose another.');
                return;
            }
            await db.collection(collectionName).doc(id).set(data);
        } else {
            await db.collection(collectionName).doc(id).set(data, { merge: true });
        }

        alert('Template saved successfully!');

        // Reload global list
        await loadAllTemplates();

        // Refresh UI
        renderFolderList();
        renderTemplateList();

        if (isNew) selectTemplate(id, type);

    } catch (error) {
        console.error('Error saving template:', error);
        alert('Error saving: ' + error.message);
    }
}

// Event Listeners
if (tmSearch) tmSearch.addEventListener('input', renderTemplateList);
if (tmTypeFilter) tmTypeFilter.addEventListener('change', renderTemplateList);
if (createNewTemplateBtn) createNewTemplateBtn.addEventListener('click', openNewTemplate);
if (tmForm) tmForm.addEventListener('submit', saveTemplateManager);
if (tmType) tmType.addEventListener('change', function () {
    tmSubjectGroup.style.display = this.value === 'email' ? 'block' : 'none';
    updateLivePreview(); // Update on type change
});

// Live Preview Listener
if (tmBody) {
    tmBody.addEventListener('input', updateLivePreview);
}

function updateLivePreview() {
    if (!tmPreview || !tmBody) return;

    // Simple render. For HTML, just set innerHTML.
    // For SMS, maybe wrap in a bubble?
    const content = tmBody.value;

    if (tmType && tmType.value === 'sms') {
        tmPreview.innerHTML = `
            <div style="background: #e5e5ea; padding: 10px 15px; border-radius: 20px; color: #000; font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 80%; margin: 10px;">
                ${escapeHtml(content).replace(/\n/g, '<br>')}
            </div>
            <div style="font-size: 10px; color: #999; margin-left: 15px;">SMS Preview</div>
        `;
    } else {
        // Email - unsafe IS OKAY for admin preview (assuming admin doesn't self-XSS)
        // If really paranoid, we could sanitize, but we need to see styles.
        // We can replace line breaks with <br> if it's plain text? No, assume HTML.
        tmPreview.innerHTML = content;
    }
}


/*
 * Event listener moved to DOMContentLoaded
 */



/* ===================================
   Workflows Section
   =================================== */





// Load workflows from Firestore


async function loadWorkflows() {
    const workflowsList = document.getElementById('workflowsList');
    if (!workflowsList) return;

    try {
        const db = window.CanvasFirebase.getDb();
        const snapshot = await db.collection('canvas_workflows').get();
        allWorkflows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load templates for dropdowns if not loaded
        if (allEmailTemplates.length === 0) {
            await loadAllTemplates();
        }

        // Fetch stats (Active Enrolled Count)
        for (let wf of allWorkflows) {
            try {
                const stats = await db.collection('workflowContacts')
                    .where('workflowId', '==', wf.id)
                    .where('status', '==', 'active')
                    .get();
                wf.activeCount = stats.size;
            } catch (e) {
                console.warn('Stats loading error (likely missing index):', e);
                wf.activeCount = 0;
            }
        }

        renderWorkflowFolderList(); // NEW
        renderWorkflows();
    } catch (error) {
        console.error('Error loading workflows:', error);
        workflowsList.innerHTML = `<div class="workflows-empty" style="color:red;">Error loading workflows: ${error.message}</div>`;
    }
}

// Render Workflow Folders (Sidebar)
function renderWorkflowFolderList() {
    const list = document.getElementById('wfFolderList');
    const options = document.getElementById('wfFolderOptions');
    if (!list) return;

    // Extract categories
    const categories = new Set();
    allWorkflows.forEach(w => {
        if (w.category) categories.add(w.category);
    });
    const sorted = Array.from(categories).sort();

    // Update Datalist
    if (options) {
        options.innerHTML = sorted.map(c => `<option value="${c}">`).join('');
    }

    // Render Sidebar
    let html = `
        <div class="folder-item ${currentWfFolder === 'all' ? 'active' : ''}" onclick="selectWfFolder('all')">
            📂 All Workflows
        </div>
        <div class="folder-item ${currentWfFolder === 'uncategorized' ? 'active' : ''}" onclick="selectWfFolder('uncategorized')">
            📁 Uncategorized
        </div>
    `;

    sorted.forEach(cat => {
        html += `
            <div class="folder-item ${currentWfFolder === cat ? 'active' : ''}" onclick="selectWfFolder('${cat}')">
                📁 ${escapeHtml(cat)}
            </div>
        `;
    });

    list.innerHTML = html;
}

window.selectWfFolder = function (folder) {
    currentWfFolder = folder;
    renderWorkflowFolderList();
    renderWorkflows();
}

// Render workflows list
function renderWorkflows() {
    const workflowsList = document.getElementById('workflowsList');
    if (!workflowsList) return;

    let items = allWorkflows;

    // Filter by Folder
    if (currentWfFolder !== 'all') {
        if (currentWfFolder === 'uncategorized') {
            items = items.filter(w => !w.category);
        } else {
            items = items.filter(w => w.category === currentWfFolder);
        }
    }

    if (items.length === 0) {
        workflowsList.innerHTML = `
            <div class="workflows-empty">
                <p>No workflows found in this folder. Click "+ New Workflow" to create one.</p>
            </div>
        `;
        return;
    }

    workflowsList.innerHTML = items.map(workflow => `
        <div class="workflow-card ${!workflow.enabled ? 'workflow-card--disabled' : ''}" data-id="${workflow.id}">
            <div class="workflow-card__header">
                <span class="workflow-card__title">${escapeHtml(workflow.name)}</span>
                ${workflow.trigger === 'manual_campaign'
            ? `<button class="btn btn--primary btn--small" onclick="event.stopPropagation(); runCampaign('${workflow.id}')" style="padding: 2px 8px; font-size: 0.75rem;">🚀 Run Now</button>`
            : `<span class="workflow-card__status ${workflow.enabled ? 'workflow-card__status--active' : 'workflow-card__status--inactive'}">
                        ${workflow.enabled ? '✓ Active' : 'Inactive'}
                       </span>`
        }
            </div>
            <div class="workflow-card__trigger">
                ${TRIGGER_LABELS[workflow.trigger] || workflow.trigger}
                ${workflow.trigger === 'status_change' && workflow.triggerStatus ? `→ ${workflow.triggerStatus}` : ''}
                ${workflow.trigger === 'manual_campaign' ? ` (Target: ${workflow.targetStatus ? workflow.targetStatus.toUpperCase() : 'ALL'})` : ''}
            </div>
            <div class="workflow-card__details">
                <div class="workflow-stats">
                    <span class="stat-bubble" title="Active Enrollments">👥 ${workflow.activeCount || 0} Active</span>
                    <span class="stat-bubble" title="Steps">⚡ ${workflow.steps ? workflow.steps.length : 1} Steps</span>
                    ${workflow.category ? `<span class="stat-bubble" style="background:#eee;">📁 ${escapeHtml(workflow.category)}</span>` : ''}
                    <button class="btn btn--outline btn--small" onclick="event.stopPropagation(); showCampaignStats('${workflow.id}')" style="padding: 2px 6px; font-size: 0.7rem; margin-left: auto;">📊 Report</button>
                </div>
            </div>
        </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.workflow-card').forEach(card => {
        card.addEventListener('click', () => editWorkflow(card.dataset.id));
    });
}

// Open create workflow modal
function openCreateWorkflowModal() {
    currentWorkflow = { steps: [] }; // Init empty steps
    document.getElementById('workflowModalTitle').textContent = 'Create Workflow';
    document.getElementById('workflowId').value = '';
    document.getElementById('workflowName').value = '';
    document.getElementById('workflowCategory').value = currentWfFolder !== 'all' && currentWfFolder !== 'uncategorized' ? currentWfFolder : ''; // Set category
    document.getElementById('workflowTrigger').value = '';
    document.getElementById('triggerStatus').value = 'contacted';
    const targetStatusEl = document.getElementById('targetStatus');
    if (targetStatusEl) targetStatusEl.value = 'all';

    // Switch to settings tab
    switchWfTab('settings');
    renderSteps();

    document.getElementById('workflowEnabled').checked = true;
    document.getElementById('statusTriggerConfig').style.display = 'none';
    const audienceGroup = document.getElementById('audienceConfig');
    if (audienceGroup) audienceGroup.style.display = 'none';

    document.getElementById('deleteWorkflowBtn').style.display = 'none';
    document.getElementById('workflowModal').classList.add('active');
}

// Edit existing workflow
function editWorkflow(workflowId) {
    currentWorkflow = allWorkflows.find(w => w.id === workflowId);
    if (!currentWorkflow) return;

    // Ensure steps array exists
    if (!currentWorkflow.steps) {
        currentWorkflow.steps = [];
        // Migration: If has legacy templateId, add as Step 1
        if (currentWorkflow.templateId) {
            currentWorkflow.steps.push({ type: 'email', templateId: currentWorkflow.templateId });
        }
    }

    document.getElementById('workflowModalTitle').textContent = 'Edit Workflow';
    document.getElementById('workflowId').value = currentWorkflow.id;
    document.getElementById('workflowName').value = currentWorkflow.name || '';
    document.getElementById('workflowCategory').value = currentWorkflow.category || ''; // Populate category
    document.getElementById('workflowTrigger').value = currentWorkflow.trigger || '';
    document.getElementById('triggerStatus').value = currentWorkflow.triggerStatus || 'contacted';
    document.getElementById('targetStatus').value = currentWorkflow.targetStatus || 'all'; // NEW

    switchWfTab('settings');
    renderSteps();

    document.getElementById('workflowEnabled').checked = currentWorkflow.enabled !== false;

    // Show correct config sections
    document.getElementById('statusTriggerConfig').style.display =
        currentWorkflow.trigger === 'status_change' ? 'block' : 'none';

    const audienceGroup = document.getElementById('audienceConfig');
    if (audienceGroup) {
        audienceGroup.style.display = currentWorkflow.trigger === 'manual_campaign' ? 'block' : 'none';
    }

    document.getElementById('deleteWorkflowBtn').style.display = 'block';
    document.getElementById('workflowModal').classList.add('active');
}

// Render Steps
function renderSteps() {
    const list = document.getElementById('workflowStepsList');
    if (!list) return;

    if (!currentWorkflow.steps || currentWorkflow.steps.length === 0) {
        list.innerHTML = '<p class="empty-steps">No steps added yet.</p>';
        return;
    }

    list.innerHTML = currentWorkflow.steps.map((step, index) => {
        // Fix labels
        let label = step.type.toUpperCase();
        if (label === 'TASK') label = 'ACTION'; // Rename TASKS to ACTIONS for clarity if they exist

        return `
        <div class="workflow-step-item">
            <div class="step-header">
                <span class="step-badge step-badge--${step.type}">
                    ${step.type === 'email' ? '📧' : step.type === 'sms' ? '💬' : '⏳'} ${label}
                </span>
                <div class="step-actions">
                    ${index > 0 ? `<button type="button" class="btn-icon-move" onclick="moveStep(${index}, -1)" title="Move Up">⬆️</button>` : ''}
                    ${index < currentWorkflow.steps.length - 1 ? `<button type="button" class="btn-icon-move" onclick="moveStep(${index}, 1)" title="Move Down">⬇️</button>` : ''}
                    <button type="button" class="btn-icon-danger" onclick="removeStep(${index})" title="Remove">×</button>
                </div>
            </div>
            
            <div class="step-config">
                ${step.type === 'delay' ? `
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                            <div style="flex: 1.5;">
                                <label>Wait</label>
                                <input type="number" class="form-input step-input" value="${step.delay || 0}" 
                                    onchange="updateStep(${index}, 'delay', this.value)">
                            </div>
                            <div style="flex: 1;">
                                <label>Unit</label>
                                <select class="form-select step-input" onchange="updateStep(${index}, 'unit', this.value)">
                                    <option value="minutes" ${step.unit === 'minutes' ? 'selected' : ''}>Minutes</option>
                                    <option value="hours" ${step.unit === 'hours' ? 'selected' : ''}>Hours</option>
                                    <option value="days" ${step.unit === 'days' || !step.unit ? 'selected' : ''}>Days</option>
                                </select>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                            <div style="flex: 1;">
                                <label>Timing</label>
                                <select class="form-select step-input" onchange="updateStep(${index}, 'timing', this.value)">
                                    <option value="after" ${step.timing === 'after' || !step.timing ? 'selected' : ''}>After</option>
                                    <option value="before" ${step.timing === 'before' ? 'selected' : ''}>Before</option>
                                </select>
                            </div>
                            <div style="flex: 1.5;">
                                <label>Relative To</label>
                                <select class="form-select step-input" onchange="updateStep(${index}, 'relativeTo', this.value)">
                                    <option value="now" ${step.relativeTo === 'now' || !step.relativeTo ? 'selected' : ''}>Previous Step</option>
                                    <option value="event" ${step.relativeTo === 'event' ? 'selected' : ''}>Appointment Time</option>
                                </select>
                            </div>
                        </div>
                    </div>
` : `
                    <label>${step.type === 'task' ? 'Description' : 'Template ID'}</label>
                    <div style="display: flex; gap: 0.5rem;">
                        ${step.type === 'task' ? `
                            <input type="text" class="form-input step-input" value="${step.description || ''}" 
                                onchange="updateStep(${index}, 'description', this.value)" placeholder="e.g. Call client" style="flex:1;">
                        ` : `
                            <select class="form-select step-input" onchange="updateStep(${index}, 'templateId', this.value)" style="flex:1;">
                                <option value="">Select Template...</option>
                                ${(step.type === 'sms' ? allSmsTemplates : allEmailTemplates).map(t => `
                                    <option value="${t.id}" ${step.templateId === t.id ? 'selected' : ''}>
                                        ${t.name || t.id}
                                    </option>
                                `).join('')}
                            </select>
                            <button type="button" class="btn btn--outline btn--small" onclick="toggleStepPreview(${index})" title="Preview Content">
                                👁️
                            </button>
                        `}
                    </div>
                    <div id="step-preview-${index}" class="step-preview-box" style="display: none; margin-top: 0.5rem; border: 1px solid #ddd; padding: 0.5rem; background: #fff; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                        <small style="color: #999;">Loading...</small>
                    </div>
                `}
            </div>
        </div>
    `}).join('');
}

// Toggle Step Preview
function toggleStepPreview(index) {
    const step = currentWorkflow.steps[index];
    const previewBox = document.getElementById(`step-preview-${index}`);

    if (!previewBox) return;

    if (previewBox.style.display === 'none') {
        // Show
        previewBox.style.display = 'block';

        let content = '';
        if (step.templateId) {
            const collection = step.type === 'sms' ? allSmsTemplates : allEmailTemplates;
            const template = collection.find(t => t.id === step.templateId);

            if (template) {
                if (step.type === 'email') {
                    // Render HTML safely? 
                    // Just show subject and body
                    content = `
                        <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 5px;">Subject: ${escapeHtml(template.subject)}</div>
                        <div style="font-size: 0.8rem; border-top: 1px solid #eee; padding-top: 5px;">${template.html}</div>
                    `;
                } else {
                    content = `<div style="font-size: 0.85rem;">${escapeHtml(template.message)}</div>`;
                }
            } else {
                content = '<small style="color: red;">Template not found</small>';
            }
        } else {
            content = '<small>Please select a template</small>';
        }
        previewBox.innerHTML = content;

    } else {
        // Hide
        previewBox.style.display = 'none';
    }
}

// Add Step
function addStep(type) {
    if (!currentWorkflow.steps) currentWorkflow.steps = [];

    const newStep = { type };
    if (type === 'delay') {
        newStep.delay = 1;
        newStep.unit = 'days';
    } else {
        newStep.templateId = '';
    }

    currentWorkflow.steps.push(newStep);
    renderSteps();
}

// Remove Step
function removeStep(index) {
    if (confirm('Are you sure you want to remove this step?')) {
        currentWorkflow.steps.splice(index, 1);
        renderSteps();
    }
}

// Move Step (Reorder)
function moveStep(index, direction) {
    const steps = currentWorkflow.steps;
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= steps.length) return;

    // Swap
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    renderSteps();
}

// Update Step
function updateStep(index, field, value) {
    if (currentWorkflow.steps[index]) {
        if (field === 'delay') value = parseInt(value);
        currentWorkflow.steps[index][field] = value;
    }
}

// Workflow Tab Switching
function switchWfTab(tabName) {
    document.querySelectorAll('[data-wf-tab]').forEach(t => {
        t.classList.toggle('active', t.dataset.wfTab === tabName);
    });

    document.getElementById('wfSettingsTab').style.display = tabName === 'settings' ? 'block' : 'none';
    document.getElementById('wfStepsTab').style.display = tabName === 'steps' ? 'block' : 'none';
}

// Close workflow modal
function closeWorkflowModal() {
    document.getElementById('workflowModal').classList.remove('active');
    currentWorkflow = null;
}

// Save workflow
async function saveWorkflow(e) {
    e.preventDefault();

    const trigger = document.getElementById('workflowTrigger').value;
    const workflowData = {
        name: document.getElementById('workflowName').value.trim(),
        category: document.getElementById('workflowCategory').value.trim() || null,
        trigger: trigger,
        triggerStatus: trigger === 'status_change' ? document.getElementById('triggerStatus').value : null,
        targetStatus: trigger === 'manual_campaign' ? document.getElementById('targetStatus').value : null, // NEW: Campaign Audience
        steps: currentWorkflow.steps || [],
        enabled: document.getElementById('workflowEnabled').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!workflowData.name || !workflowData.trigger) {
        alert('Please fill in all required fields.');
        return;
    }

    try {
        const db = window.CanvasFirebase.getDb();
        const workflowId = document.getElementById('workflowId').value;

        if (workflowId) {
            // Update existing
            await db.collection('canvas_workflows').doc(workflowId).update(workflowData);
        } else {
            // Create new
            workflowData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('canvas_workflows').add(workflowData);
        }

        closeWorkflowModal();
        loadWorkflows();
    } catch (error) {
        console.error('Error saving workflow:', error);
        alert('Failed to save workflow. Please try again.');
    }
}

// Run Campaign (Manual Workflow)
// Run Campaign (Manual Workflow)
async function runCampaign(workflowId) {
    const workflow = allWorkflows.find(w => w.id === workflowId);
    if (!workflow) return;

    const targetStatus = workflow.targetStatus || 'all';

    // 1. Filter Audience
    let audience = allLeads;
    if (targetStatus !== 'all') {
        audience = allLeads.filter(l => l.status === targetStatus);
    }

    // SMART BATCHING: Filter out leads who have already started this workflow
    const initialCount = audience.length;
    audience = audience.filter(l => {
        return !l.workflows || !l.workflows[workflowId];
    });

    const eligibleCount = audience.length;
    const excludedCount = initialCount - eligibleCount;

    if (eligibleCount === 0) {
        alert(`No eligible leads found with status "${targetStatus}".\n(${excludedCount} leads were excluded because they are already enrolled).`);
        return;
    }

    // Prompt for Batch Size
    const batchSizeInput = prompt(
        `🚀 Ready to launch "${workflow.name}"?\n\n` +
        `Target: ${targetStatus === 'all' ? 'All Leads' : targetStatus.toUpperCase()}\n` +
        `Eligible Audience: ${eligibleCount} leads\n` +
        `${excludedCount > 0 ? `(Excluded ${excludedCount} already enrolled leads)\n` : ''}\n` +
        `How many leads do you want to start now? (Enter number)`,
        Math.min(50, eligibleCount)
    );

    if (batchSizeInput === null) return; // Cancelled

    let limit = parseInt(batchSizeInput);
    if (isNaN(limit) || limit <= 0) {
        alert("Invalid number entered.");
        return;
    }

    if (limit > eligibleCount) limit = eligibleCount;

    // Slice audience to limit
    const targetBatch = audience.slice(0, limit);

    if (!confirm(`Confirm sending to ${targetBatch.length} leads?`)) {
        return;
    }

    // 2. Execution Logic (Cloud Function)
    const btn = document.querySelector(`button[onclick*="runCampaign('${workflowId}')"]`);
    if (btn) btn.innerText = 'Processing...';

    try {
        const processBulk = firebase.functions().httpsCallable('processBulkCampaign');
        const result = await processBulk({
            workflowId: workflowId,
            limit: limit
        });

        const data = result.data;
        if (data.success) {
            alert(`✅ ${data.message}`);
        } else {
            alert(`⚠️ Warning: ${data.message || 'Unknown response'}`);
        }

        // Real-time listener will update the list automatically

    } catch (e) {
        console.error('Campaign Error:', e);
        alert('Error executing campaign: ' + e.message);
    } finally {
        if (btn) btn.innerText = '🚀 Run Now'; // Reset
    }
}

// Delete workflow
async function deleteWorkflow() {
    if (!currentWorkflow) return;

    if (!confirm(`Delete "${currentWorkflow.name}"? This cannot be undone.`)) return;

    try {
        const db = window.CanvasFirebase.getDb();
        await db.collection('canvas_workflows').doc(currentWorkflow.id).delete();
        closeWorkflowModal();
        loadWorkflows();
    } catch (error) {
        console.error('Error deleting workflow:', error);
        alert('Failed to delete workflow. Please try again.');
    }
}



// Delete Template Listener
if (tmDeleteBtn) {
    tmDeleteBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this template?')) return;

        try {
            const id = document.getElementById('tmId').value;
            await window.CanvasFirebase.deleteTemplate(id); // Ensure this function exists in firebase-config.js or implement here
            document.getElementById('tmForm').style.display = 'none';
            document.getElementById('tmEmptyState').style.display = 'flex';
            loadTemplates(); // Refresh list
        } catch (error) {
            console.error(error);
            alert('Failed to delete template: ' + error.message);
        }
    });
}

// Test Template Listener
if (tmTestBtn) {
    tmTestBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent form submission if inside form

        const type = document.getElementById('tmType').value;
        const subject = document.getElementById('tmSubject').value;
        const body = document.getElementById('tmBody').value;

        const testRecipient = prompt(`Enter ${type === 'email' ? 'email' : 'phone number'} to send test to:`);
        if (!testRecipient) return;

        if (!body || !body.trim()) {
            alert('Please enter message content before sending a test.');
            return;
        }

        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = 'Sending...';
        btn.disabled = true;

        try {
            const sendDirectMessage = window.CanvasFirebase.functions.httpsCallable('sendDirectMessage');

            await sendDirectMessage({
                contactId: 'TEST-USER',
                type,
                recipient: testRecipient,
                subject: type === 'email' ? (subject || 'Test Email') : null,
                content: body
            });

            alert('Test message sent successfully!');
        } catch (error) {
            console.error('Error sending test:', error);
            alert('Failed to send test: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}

// Load ALL templates from collections (for dropdowns)
async function loadAllTemplates() {
    try {
        const db = window.CanvasFirebase.getDb();

        // Load Email Templates
        const emailSnap = await db.collection('emailTemplates').get();
        allEmailTemplates = emailSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load SMS Templates
        const smsSnap = await db.collection('smsTemplates').get();
        allSmsTemplates = smsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log('Loaded templates:', allEmailTemplates.length, 'email', allSmsTemplates.length, 'sms');
    } catch (error) {
        console.error('Error loading all templates:', error);
    }
}

// Workflow Modal Tabs


// Expose step functions globally
window.addStep = addStep;
window.removeStep = removeStep;
window.updateStep = updateStep;
window.toggleStepPreview = toggleStepPreview;
window.openComposeModal = openComposeModal;

/* ===================================
   Direct Messaging Logic
   =================================== */
const composeModal = document.getElementById('composeModal');
const closeComposeModal = document.getElementById('closeComposeModal');
const composeForm = document.getElementById('composeForm');

if (closeComposeModal) {
    closeComposeModal.addEventListener('click', () => composeModal.classList.remove('active'));
}

if (composeModal) {
    composeModal.addEventListener('click', (e) => {
        if (e.target === composeModal) composeModal.classList.remove('active');
    });
}

function openComposeModal(type) {
    if (!currentLead) return;

    // Reset Form
    document.getElementById('composeType').value = type;
    document.getElementById('composeContactId').value = currentLead.id;

    // Set Recipient
    const recipient = type === 'email' ? currentLead.email : currentLead.phone;
    if (!recipient) {
        alert(`This contact does not have a valid ${type === 'email' ? 'email address' : 'phone number'}.`);
        return;
    }
    document.getElementById('composeRecipient').value = recipient;

    // Update Title
    document.getElementById('composeTitle').textContent = type === 'email' ? 'New Email' : 'New SMS';

    // Toggle Subject (Email Only)
    const subjectGroup = document.getElementById('composeSubjectGroup');
    if (type === 'email') {
        subjectGroup.style.display = 'block';
        document.getElementById('composeSubject').required = true;
    } else {
        subjectGroup.style.display = 'none';
        document.getElementById('composeSubject').required = false;
    }

    // Reset Fields
    document.getElementById('composeSubject').value = '';
    document.getElementById('composeContent').value = '';

    composeModal.classList.add('active');
}

if (composeForm) {
    composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('btnSendDirect');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending...';

        const type = document.getElementById('composeType').value;
        const contactId = document.getElementById('composeContactId').value;
        const recipient = document.getElementById('composeRecipient').value;
        const subject = document.getElementById('composeSubject').value;
        const content = document.getElementById('composeContent').value;

        try {
            const sendDirectMessage = window.CanvasFirebase.functions.httpsCallable('sendDirectMessage');

            const result = await sendDirectMessage({
                contactId,
                type,
                recipient,
                subject: type === 'email' ? subject : null,
                content
            });

            if (result.data && result.data.success) {
                alert('Message sent successfully!');
                composeModal.classList.remove('active');

                // Refresh History if open
                if (document.querySelector('.modal-tab[data-modal-tab="history"]').classList.contains('active')) {
                    loadContactHistory(currentLead);
                }
            } else {
                throw new Error(result.data?.error || 'Unknown error');
            }

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

// Campaign Stats Logic
let statsUnsubscribe = null;

async function showCampaignStats(workflowId) {
    const modal = document.getElementById('statsModal');
    const tbody = document.getElementById('statsBody');
    const totalEl = document.getElementById('statsTotal');
    const deliveredEl = document.getElementById('statsDelivered');
    const opensEl = document.getElementById('statsOpens');
    const clicksEl = document.getElementById('statsClicks');

    // Reset UI
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading logs...</td></tr>';
    totalEl.textContent = '0';
    deliveredEl.textContent = '0';
    opensEl.textContent = '0%';
    clicksEl.textContent = '0%';
    modal.classList.add('active');

    if (statsUnsubscribe) statsUnsubscribe();

    const db = window.CanvasFirebase.getDb();

    // Query logs for this workflow
    const q = db.collection('communicationLogs')
        .where('content.workflowId', '==', workflowId)
        .orderBy('timestamp', 'desc')
        .limit(200);

    statsUnsubscribe = q.onSnapshot(snapshot => {
        const logs = [];
        let total = 0;
        let delivered = 0;
        let opens = 0;
        let clicks = 0;

        snapshot.forEach(doc => {
            const log = doc.data();
            logs.push(log);
            total++;

            if (log.status === 'delivered' || log.status === 'opened' || log.status === 'clicked') delivered++;
            if (log.status === 'opened' || log.status === 'clicked') opens++;
            if (log.status === 'clicked') clicks++;
        });

        // Update Summary
        totalEl.textContent = total;
        deliveredEl.textContent = total > 0 ? `${delivered} (${Math.round(delivered / total * 100)}%)` : '0';
        opensEl.textContent = delivered > 0 ? `${Math.round(opens / delivered * 100)}%` : '0%';
        clicksEl.textContent = opens > 0 ? `${Math.round(clicks / opens * 100)}%` : '0%';

        // Render Table
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No activity recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const date = log.timestamp && log.timestamp.toDate ? log.timestamp.toDate() : new Date();
            let statusColor = '#666';
            if (log.status === 'sent') statusColor = '#2196F3'; // Blue
            if (log.status === 'delivered') statusColor = '#4CAF50'; // Green
            if (log.status === 'opened') statusColor = '#9C27B0'; // Purple
            if (log.status === 'failed') statusColor = '#F44336'; // Red

            return `
                <tr>
                    <td>${date.toLocaleString()}</td>
                    <td>${escapeHtml(log.recipient)}</td>
                    <td>
                        <span class="status-badge" style="background:${statusColor}; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem;">
                            ${log.status.toUpperCase()}
                        </span>
                        ${log.error ? `<small style="display:block; color:red;">${log.error}</small>` : ''}
                    </td>
                    <td>
                        ${log.type === 'email' ? '📧' : '💬'}
                    </td>
                </tr>
            `;
        }).join('');

    }, error => {
        console.error("Error loading stats:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error loading stats. Check console.<br>You likely need to deploy the index.</td></tr>`;
    });

    // Handle Close
    const closeBtn = document.getElementById('closeStatsModal');
    closeBtn.onclick = () => {
        modal.classList.remove('active');
        if (statsUnsubscribe) statsUnsubscribe();
    };

    // Refresh button
    const refreshBtn = document.getElementById('refreshStatsBtn');
    refreshBtn.onclick = () => {
        // Re-trigger (onSnapshot handles live, but user might want force refresh if connection drop)
    };
}
