'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, Timestamp } = require('firebase/firestore');
const {
  deleteObject,
  getBytes,
  ref,
  uploadBytes
} = require('firebase/storage');

const projectId = 'demo-canvas-integration';
const bucket = `${projectId}.firebasestorage.app`;
const submissionId = 'storage_test_submission_0001';
const fileId = '0123456789abcdef01234567';
const fileName = 'artwork.pdf';
const uploadPath = `lead-uploads/${submissionId}/${fileId}/${fileName}`;
const bytes = new Uint8Array([37, 80, 68, 70]);
const metadata = {
  contentType: 'application/pdf',
  customMetadata: {
    submissionId,
    fileId,
    uploadToken: 'test-upload-token',
    originalName: fileName
  }
};
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8')
    }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'leadUploadSessions', submissionId), {
      allowedPaths: [`${fileId}/${fileName}`],
      consumed: false,
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      token: 'test-upload-token'
    });
  });
});

after(async () => {
  await env.cleanup();
});

function storageFor(context) {
  return context.storage(bucket);
}

test('anonymous visitor can create only the exact server-authorized upload', async () => {
  const storage = storageFor(env.unauthenticatedContext());
  await assertSucceeds(uploadBytes(ref(storage, uploadPath), bytes, metadata));
  await assertFails(uploadBytes(ref(storage, `lead-uploads/${submissionId}/${fileId}/wrong.pdf`), bytes, metadata));
  await assertFails(getBytes(ref(storage, uploadPath)));
  await assertFails(deleteObject(ref(storage, uploadPath)));
});

test('authenticated non-staff user has no additional Storage access', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(storageFor(context), uploadPath), bytes, metadata);
  });
  const storage = storageFor(env.authenticatedContext('outsider', {
    email: 'visitor@example.invalid',
    email_verified: true
  }));
  await assertFails(getBytes(ref(storage, uploadPath)));
  await assertFails(deleteObject(ref(storage, uploadPath)));
  await assertFails(uploadBytes(ref(storage, 'projects/unauthorized.webp'), bytes, { contentType: 'image/webp' }));
  await assertFails(uploadBytes(ref(storage, 'other/arbitrary.bin'), bytes));
});

test('verified allowlisted staff can manage project media and inspect/remove lead uploads', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(storageFor(context), uploadPath), bytes, metadata);
  });
  const storage = storageFor(env.authenticatedContext('staff', {
    email: 'sales@canvas-advertising.com',
    email_verified: true
  }));
  await assertSucceeds(getBytes(ref(storage, uploadPath)));
  await assertSucceeds(deleteObject(ref(storage, uploadPath)));
  const project = ref(storage, 'projects/portfolio.webp');
  await assertSucceeds(uploadBytes(project, bytes, { contentType: 'image/webp' }));
  await assertSucceeds(getBytes(project));
  await assertSucceeds(deleteObject(project));
  await assertFails(uploadBytes(ref(storage, 'other/arbitrary.bin'), bytes));
});

test('unverified allowlisted identity is not staff', async () => {
  const storage = storageFor(env.authenticatedContext('unverified-staff', {
    email: 'sales@canvas-advertising.com',
    email_verified: false
  }));
  await assertFails(uploadBytes(ref(storage, 'projects/unverified.webp'), bytes, { contentType: 'image/webp' }));
});

