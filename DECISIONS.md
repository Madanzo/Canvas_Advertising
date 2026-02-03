# Architecture Design Record (ADR)

This document records key architectural decisions and their context.

## 1. Serverless Architecture (Firebase)
- **Status**: Accepted
- **Context**: We needed a scalable, low-maintenance backend for a small team.
- **Decision**: Use Firebase (Functions, Firestore, Hosting, Auth).
- **Consequences**:
  - (+) Zero server management.
  - (+) Easy scaling.
  - (-) Vendor lock-in (Google Cloud).
  - (-) specialized logic required for "cold starts" and triggers.

## 2. NoSQL Database (Firestore)
- **Status**: Accepted
- **Context**: The data schema for leads, workflows, and logs needs to be flexible as features evolve.
- **Decision**: Use Firestore (Document-based NoSQL).
- **Consequences**:
  - (+) Fast development, easy schema changes.
  - (+) Real-time listeners for dashboard UI.
  - (-) Complex queries are limited (require composite indexes).

## 3. Custom Admin Dashboard vs CRM
- **Status**: Accepted
- **Context**: We needed highly specific automation logic (Cal.com integration + multi-channel workflows) that standard CRMs (HubSpot, Salesforce) make expensive or rigid.
- **Decision**: Build a custom SPA Admin Dashboard (`admin.html` + `admin.js`).
- **Consequences**:
  - (+) Infinite customization (Direct SMS, specific workflow steps).
  - (+) No monthly per-seat fees.
  - (-) We own the maintenance burden (UI, Auth, Security).

## 4. Communication Providers
- **Status**: Accepted
- **Context**: Need reliable transactional Email and SMS.
- **Decision**: 
  - **Resend** for Email (Developer friendly, good free tier).
  - **Plivo** for SMS (Reliable, pay-as-you-go).
- **Consequences**:
  - (+) Best-in-class delivery for each channel.
  - (+) Decoupled from Firebase (can switch providers if needed by changing helper functions).

## 5. Client-Side Rendering (Dashboard)
- **Status**: Accepted
- **Context**: The admin dashboard requires high interactivity (workflow builder, real-time status).
- **Decision**: Single Page Application (SPA) approach using Raw JS + DOM manipulation.
- **Consequences**:
  - (+) Fast transitions (no page reloads).
  - (+) Simple hosting (static files).
  - (-) Initial load time is slightly higher (not an issue for admin tools).
  - (-) Project structure relies heavily on `admin.js` organization.
