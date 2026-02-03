# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- **SEO**: Spanish dynamic project pages (Planned).
- **Testing**: End-to-end test suite (Planned).

## [1.5.0] - 2026-01-29
### Added
- **Direct Communication**: Admin can now send "Quick Emails" and "Quick SMS" directly from the Contact Profile.
- **Compose Modal**: UI for writing distinct messages without a template.
- **Backend**: `sendDirectMessage` Cloud Function to handle one-off messaging.

## [1.4.0] - 2026-01-29
### Changed
- **Contact Management**: Renamed "Leads" to "Contacts" to reflect broader scope.
- **Profile UI**: Upgraded Lead Detail modal to a full "Contact Profile" with tabs.
### Added
- **History View**: Timeline of all communication logs (Email/SMS) for a specific contact.

## [1.3.0] - 2026-01-28
### Added
- **Workflow Reordering**: "Up" and "Down" buttons to rearrange workflow steps.
- **Relative Timing**: Workflow steps can now be scheduled "Before" or "After" a booking event.
- **Booking Integration**: Cal.com webhooks now trigger workflow enrollment with event time data.

## [1.2.0] - 2026-01-27
### Added
- **Template Manager**: Advanced editor for HTML Emails and SMS templates.
- **Folders**: Organization system for templates and workflows.
- **Visual Builder**: Modal-based editor for adding steps to workflows.

## [1.1.0] - 2026-01-26
### Added
- **Admin Dashboard**: Secure internal dashboard for managing leads.
- **Authentication**: Google Sign-In integration.
- **Workflow Engine**: Backend logic (`processWorkflowQueue`) to execute scheduled tasks.

## [1.0.0] - 2026-01-20
### Initial Release
- **Public Website**: Responsive HTML5 website with portfolio functionality.
- **Lead Capture**: Quote Request form connected to Firestore.
- **Hosting**: Deployed to Firebase Hosting.
