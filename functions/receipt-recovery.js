'use strict';
const crypto = require('node:crypto');
// Offline/server-side planning only. No export, scheduler, transport or auto-repair.
// Authority is supplied by an authenticated server operator, never intake JSON.
function planReview({ leadId, lead, delivery, authority }) {
    if (!authority?.authenticated || authority.role !== 'communications_reviewer') return { allowed: false, reason: 'reviewer_required' };
    if (authority.leadId !== leadId || !authority.approvalId) return { allowed: false, reason: 'exact_id_approval_required' };
    const obligation = lead?.receiptObligation;
    if (!obligation || obligation.owner !== 'crm' || obligation.status !== 'unresolved') return { allowed: false, reason: 'no_unresolved_obligation' };
    if (lead.communications?.testSuppressed || lead.crmIntegrationTestAuthorized) return { allowed: false, reason: 'test_suppressed' };
    if (!delivery) return { allowed: false, reason: 'original_delivery_missing_manual_review', leadId };
    if (delivery.leadId !== leadId || delivery.idempotencyKey !== 'canvas-lead:' + leadId) return { allowed: false, reason: 'identity_mismatch' };
    return { allowed: true, action: 'request_crm_receipt_evidence_only', leadId,
        approvalId: authority.approvalId, actorId: authority.actorId,
        idempotencyKey: delivery.idempotencyKey,
        payloadSha256: crypto.createHash('sha256').update(delivery.serializedBody).digest('hex'),
        capturedAt: obligation.capturedAt, transitionId: obligation.transitionId,
        purpose: 'lead_received', maySend: false, mayRewrite: false };
}
module.exports = { planReview };

// Trusted operator tooling only; not exported as a Function. Records a review,
// never resolves the obligation or changes the original delivery.
async function recordReview(db, leadId, authority) {
    if (!authority?.authenticated || authority.role !== 'communications_reviewer'
        || authority.leadId !== leadId || !authority.actorId
        || !/^[A-Za-z0-9_-]{8,80}$/.test(authority.approvalId || '')
        || !/^[A-Za-z0-9_-]{1,128}$/.test(leadId)) throw new Error('authenticated_exact_id_review_required');
    const leadRef=db.collection('canvas_leads').doc(leadId);
    const deliveryRef=db.collection('crm_lead_deliveries').doc(leadId);
    const reviewRef=leadRef.collection('receiptRecoveryReviews').doc(authority.approvalId);
    return db.runTransaction(async tx=>{
        const [lead,delivery,existing]=await Promise.all([tx.get(leadRef),tx.get(deliveryRef),tx.get(reviewRef)]);
        const decision=planReview({leadId,lead:lead.data(),delivery:delivery.exists?delivery.data():null,authority});
        const record={version:1,actorId:authority.actorId,approvalId:authority.approvalId,decision};
        if(existing.exists){const {recordedAt,...prior}=existing.data();if(!require('node:util').isDeepStrictEqual(prior,record))throw new Error('review_conflict');return existing.data();}
        const dated={...record,recordedAt:new Date().toISOString()};tx.create(reviewRef,dated);return dated;
    });
}
module.exports.recordReview=recordReview;
