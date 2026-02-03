# Project Backlog & Todo

## High Priority
- [ ] **Security Updates**: Fix `npm audit` findings (9 vulnerabilities in `form-data`, `protobufjs`).
- [ ] **Spanish SEO**: Implement dynamic project pages for the Spanish version (`project-detail-es.html`).
- [ ] **Backup Strategy**: Automate Firestore backups to Google Cloud Storage.
- [ ] **Tests**: Create basic smoke tests for the Critical Path (Lead Form -> Database -> Admin View).

## Enhancements
- [ ] **Analytics**: Add dashboard charts for "Leads over time" and "Conversion Rate".
- [ ] **Email Open Tracking**: Integrate Resend webhooks to track if emails are opened.
- [ ] **SMS Replies**: Handle incoming SMS logic (via Plivo webhook) to show replies in History.
- [ ] **Role-Based Access**: Distinguish between "Owner" (can delete) and "Staff" (can only view/edit).

## Maintenance / Tech Debt
- [ ] **Refactor `admin.js`**: Split the 1500+ line file into modules (ES6 Modules).
- [ ] **Environment Variables**: Ensure all API keys are strictly using Firebase Config, not hardcoded.
- [ ] **Types**: Consider migrating key backend logic to TypeScript for safety.
