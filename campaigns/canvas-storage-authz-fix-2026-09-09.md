# Canvas Storage authorization fix

Status: prepared for review; not deployed.

## Authorization evidence

The current admin UI allows Google sign-in, then checks a three-address Canvas
allowlist. Firestore Rules enforce the same allowlist plus `email_verified ==
true`. Storage previously treated every Firebase identity as staff. This change
uses the Firestore staff predicate in Storage Rules.

## Permission matrix

| Path | Anonymous | Authenticated non-staff | Verified allowlisted staff | Backend Admin SDK |
|---|---|---|---|---|
| `lead-uploads/{submissionId}/{fileId}/{fileName}` | Create only with a live server-issued session, exact path/token/metadata, approved type and size | Same create-only public capability; no read/update/delete | Read and delete; no update | Verify, set metadata, and delete |
| `projects/{allPaths=**}` | Public read; no write | Public read; no write | Read/write | Read/write |
| Any other path | Deny | Deny | Deny | Allowed when backend code requires it |

## Deployment plan

1. Review the allowlisted staff addresses against current business ownership.
2. Run `npm ci` and `npm run test:storage-rules` with local Firestore and Storage emulators.
3. Compare the candidate rules to the active deployed ruleset.
4. Deploy only Storage Rules from the project root after explicit approval:
   `firebase deploy --only storage --project canvas-adnvertising`.
5. Repeat anonymous authorized-upload, authenticated outsider denial, staff
   project-media CRUD, and backend expired-upload cleanup checks in a controlled
   non-customer fixture.
6. Monitor denied Storage requests and the upload-cleanup function; roll back to
   the immediately preceding ruleset only if a legitimate path was missed.

No Functions, Hosting, Firestore Rules, credentials, CRM forwarding, or historical
lead replay are part of this deployment.
