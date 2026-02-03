# Architecture & System Design

Canvas Advertising is built on a **Serverless Architecture** using the Google Firebase ecosystem. This ensures scalability, low maintenance, and real-time capabilities.

## 🔄 System Overview

The system consists of three main components:
1. **Public Website**: Static content + dynamic lead capture forms.
2. **Admin Dashboard**: Secure Single-Page Application (SPA) for internal management.
3. **Backend Engine**: Event-driven Cloud Functions handling automation and logic.

---

## 💾 detailed Data Flow

### 1. Lead Capture
- **Source**: User submits a Quote Request form on `index.html`.
- **Action**: Frontend writes directly to Firestore `leads` collection.
- **Trigger**: `onNewLead` Cloud Function fires.
- **Outcome**: 
  - Admin receives notification.
  - "Welcome" email sent to lead via Resend.
  - Lead enrolled in "Prospect" workflow.

### 2. Workflow Automation
- **Engine**: `processWorkflowQueue` (Scheduled Function / Cron).
- **Process**: 
  - Scans `workflowContacts` for steps due (`nextExecutionAt` <= now).
  - Executes step (Email, SMS, or Status Change).
  - Calculates time for next step based on delay settings.
  - Updates document with result and increments step index.

### 3. Direct Communication
- **Source**: Admin clicks "Send Email" in Dashboard.
- **Action**: Frontend calls `sendDirectMessage` (Callable Function).
- **Logic**: Function validates Auth -> calls Resend API -> logs to `communicationLogs`.

---

## 🗄️ Firestore Data Model

### Core Collections
- **`leads`**: Central record for all contacts.
  - `status`: new | contacted | quoted | won | lost
  - `source`: website | booking

- **`workflowContacts`**: Instance of a contact moving through a workflow.
  - Links `contactId` to `workflowId`.
  - Tracks `currentStepIndex` and `history`.

- **`communicationLogs`**: Immutable audit trail.
  - Stores every Email/SMS sent.
  - Fields: `recipient`, `type`, `status`, `providerMessageId`.

- **`canvas_workflows`**: Definitions of automation sequences.
  - Contains array of `steps` (type: email/sms/delay).

- **`emailTemplates` / `smsTemplates`**: Reusable content.
  - Supports Handlebars-style variables (e.g., `{{firstName}}`).

---

## ☁️ Cloud Functions

| Function Name | Type | Purpose |
|--------------|------|---------|
| `onNewLead` | Firestore Trigger | Reacts to new documents in `leads`. auto-enrolls in workflows. |
| `processWorkflowQueue` | Scheduled | Runs every minute (conceptually) to execute pending steps. |
| `calcomWebhook` | HTTPS | Receives booking data from Cal.com and creates leads. |
| `sendDirectMessage` | Callable | Secure endpoint for manual Admin messaging. |
| `serveProjectPage` | HTTPS | Dynamically renders SEO-friendly project case studies. |

---

## 🔒 Security & Access

- **Authentication**: Firebase Auth (Google Provider).
- **Authorization**: 
  - Frontend: `admin.js` checks for authenticated user before rendering sensitive data.
  - Backend: Callable functions (`sendDirectMessage`) enforce `context.auth`.
  - Database: `firestore.rules` restrict write access to `leads` (public) and read/write for everything else (admins only).

---

## 🌐 Third-Party Services
- **Resend**: reliable Email API.
- **Plivo**: SMS Gateway.
- **Cal.com**: Scheduling system.
