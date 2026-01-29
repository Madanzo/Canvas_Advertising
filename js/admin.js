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
    status_change: '🔄 Status Changed'
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

        if (createWorkflowBtn) createWorkflowBtn.addEventListener('click', openCreateWorkflowModal);
        if (closeWorkflowModalBtn) closeWorkflowModalBtn.addEventListener('click', closeWorkflowModal);
        if (workflowForm) workflowForm.addEventListener('submit', saveWorkflow);
        if (workflowTrigger) {
            workflowTrigger.addEventListener('change', function () {
                document.getElementById('statusTriggerConfig').style.display =
                    this.value === 'status_change' ? 'block' : 'none';
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
async function loadLeads() {
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    leadsBody.innerHTML = '';

    try {
        allLeads = await window.CanvasFirebase.getLeads();
        updateStats();
        renderLeads(allLeads);
    } catch (error) {
        console.error('Error loading leads:', error);
        loadingState.innerHTML = '<p>Error loading leads. Please refresh.</p>';
    }
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

// View lead details
async function viewLead(leadId) {
    currentLead = allLeads.find(l => l.id === leadId);
    if (!currentLead) return;

    // Fetch automation history
    let automationHistory = [];
    try {
        const db = window.CanvasFirebase.getDb();
        const snapshot = await db.collection('workflowContacts')
            .where('contactId', '==', leadId)
            .orderBy('enrolledAt', 'desc')
            .get();
        automationHistory = snapshot.docs.map(doc => doc.data());
    } catch (e) {
        console.error('Error loading automation history:', e);
    }

    modalBody.innerHTML = `
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
            <label>Automation History</label>
            ${automationHistory.length > 0 ? `
                <div style="background: #f8f9fa; padding: 1rem; border-radius: 6px;">
                    ${automationHistory.map(h => `
                        <div style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span><strong>${h.workflowId}</strong> (${h.status})</span>
                            <span style="color: #6c757d;">Step ${h.currentStepIndex + 1}</span>
                        </div>
                    `).join('')}
                </div>
            ` : '<p style="font-size: 0.9rem; color: #6c757d;">No active automations.</p>'}
        </div>

        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid var(--gray-light);">
        
        <div class="form-group">
            <label for="leadNotes">Notes</label>
            <textarea id="leadNotes" class="form-textarea" placeholder="Add notes about this lead...">${currentLead.notes || ''}</textarea>
        </div>
        <button class="btn btn--primary" onclick="saveNotes()">Save Notes</button>
    `;

    leadModal.classList.add('active');
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
                'logs': 'Activity Logs'
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

    logsLoading.style.display = 'block';
    logsEmpty.style.display = 'none';
    logsBody.innerHTML = '';

    try {
        const db = window.CanvasFirebase.getDb();
        const snapshot = await db.collection('communicationLogs')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            logsLoading.style.display = 'none';
            logsEmpty.style.display = 'block';
            return;
        }

        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderLogs(logs);
        logsLoading.style.display = 'none';

    } catch (error) {
        console.error('Error loading logs:', error);
        logsLoading.innerHTML = 'Error loading logs.';
    }
}

function renderLogs(logs) {
    const logsBody = document.getElementById('logsBody');
    if (!logsBody) return;

    logsBody.innerHTML = logs.map(log => `
        <tr>
            <td>${formatDate(log.timestamp)} ${formatTime(log.timestamp)}</td>
            <td>
                <span class="badge badge--${log.type === 'email' ? 'blue' : 'green'}">
                    ${log.type === 'email' ? '📧 Email' : '💬 SMS'}
                </span>
            </td>
            <td>${escapeHtml(log.recipient)}</td>
            <td>
                <span class="status-dot ${log.status === 'sent' ? 'status-dot--success' : 'status-dot--error'}"></span>
                ${log.status}
            </td>
            <td>
                <small>${log.content ? (log.content.subject || log.content.body || log.content.templateId || 'No content') : '-'}</small>
                ${log.error ? `<div class="error-text">${log.error}</div>` : ''}
            </td>
        </tr>
    `).join('');
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

if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', saveTemplate);
}



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
                <span class="workflow-card__status ${workflow.enabled ? 'workflow-card__status--active' : 'workflow-card__status--inactive'}">
                    ${workflow.enabled ? '✓ Active' : 'Inactive'}
                </span>
            </div>
            <div class="workflow-card__trigger">
                ${TRIGGER_LABELS[workflow.trigger] || workflow.trigger}
                ${workflow.trigger === 'status_change' && workflow.triggerStatus ? `→ ${workflow.triggerStatus}` : ''}
            </div>
            <div class="workflow-card__details">
                <div class="workflow-stats">
                    <span class="stat-bubble" title="Active Enrollments">👥 ${workflow.activeCount || 0} Active</span>
                    <span class="stat-bubble" title="Steps">⚡ ${workflow.steps ? workflow.steps.length : 1} Steps</span>
                    ${workflow.category ? `<span class="stat-bubble" style="background:#eee;">📁 ${escapeHtml(workflow.category)}</span>` : ''}
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

    // Switch to settings tab
    switchWfTab('settings');
    renderSteps();

    document.getElementById('workflowEnabled').checked = true;
    document.getElementById('statusTriggerConfig').style.display = 'none';
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

    switchWfTab('settings');
    renderSteps();

    document.getElementById('workflowEnabled').checked = currentWorkflow.enabled !== false;
    document.getElementById('statusTriggerConfig').style.display =
        currentWorkflow.trigger === 'status_change' ? 'block' : 'none';
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

    list.innerHTML = currentWorkflow.steps.map((step, index) => `
        <div class="workflow-step-item">
            <div class="step-header">
                <span class="step-badge step-badge--${step.type}">
                    ${step.type === 'email' ? '📧' : step.type === 'sms' ? '💬' : '⏳'} ${step.type.toUpperCase()}
                </span>
                <button type="button" class="btn-icon-danger" onclick="removeStep(${index})">×</button>
            </div>
            
            <div class="step-config">
                ${step.type === 'delay' ? `
                    <label>Wait (minutes)</label>
                    <input type="number" class="form-input step-input" value="${step.delay || 0}" 
                        onchange="updateStep(${index}, 'delay', this.value)">
                ` : `
                    <label>Template ID</label>
                    <div style="display: flex; gap: 0.5rem;">
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
                    </div>
                    <div id="step-preview-${index}" class="step-preview-box" style="display: none; margin-top: 0.5rem; border: 1px solid #ddd; padding: 0.5rem; background: #fff; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                        <small style="color: #999;">Loading...</small>
                    </div>
                `}
            </div>
        </div>
    `).join('');
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
    if (type === 'delay') newStep.delay = 1440; // Default 1 day
    else newStep.templateId = 'form';

    currentWorkflow.steps.push(newStep);
    renderSteps();
}

// Remove Step
function removeStep(index) {
    currentWorkflow.steps.splice(index, 1);
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

    const workflowData = {
        name: document.getElementById('workflowName').value.trim(),
        category: document.getElementById('workflowCategory').value.trim() || null, // NEW
        trigger: document.getElementById('workflowTrigger').value,
        triggerStatus: document.getElementById('workflowTrigger').value === 'status_change'
            ? document.getElementById('triggerStatus').value : null,
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
