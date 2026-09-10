"use strict";
// Only explicit booleans from supported consent schemas authorize workflow SMS.
function explicitConsent(lead) {
    if (!lead) return false;
    if (Object.prototype.hasOwnProperty.call(lead, 'productionRequest')) {
        return lead.productionRequest?.version === 1 && lead.productionRequest.smsConsent === true;
    }
    return lead.boatSurvey?.smsConsent === true;
}
function phone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 10 ? '1' + digits : digits;
}
function enrollment(workflow, lead, recipient) {
    const target = phone(recipient);
    const authorized = explicitConsent(lead) && target.length >= 10 && target === phone(lead?.phone);
    const steps = workflow.steps || [];
    return {
        allowed: !steps.length || steps.some(step => step.type !== 'sms') || authorized,
        smsEnrollment: { version: 1, authorized, phone: target }
    };
}
function canSend(instance, lead) {
    const grant = instance.smsEnrollment;
    const target = phone(instance.contactPhone);
    return grant?.version === 1 && grant.authorized === true && target.length >= 10 &&
        target === grant.phone && target === phone(lead?.phone) && explicitConsent(lead);
}
module.exports = { explicitConsent, enrollment, canSend };
