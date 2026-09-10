'use strict';

async function persistLeadWithAuthorization(options) {
    return options.db.runTransaction(async (transaction) => {
        const leadSnapshot = await transaction.get(options.leadRef);
        if (leadSnapshot.exists) return { created: false, duplicate: true };

        const authorizationSnapshot = await transaction.get(options.authorizationRef);
        const uploadSnapshot = options.uploadSessionRef
            ? await transaction.get(options.uploadSessionRef)
            : null;
        const testAuthorized = authorizationSnapshot.exists
            && options.isValidAuthorization(authorizationSnapshot.data(), options.authorizationToken);

        if (uploadSnapshot) {
            options.validateUploadSession(uploadSnapshot.data());
            transaction.update(options.uploadSessionRef, options.uploadConsumedData);
        }
        if (testAuthorized) {
            transaction.update(options.authorizationRef, options.authorizationConsumedData);
        }
        transaction.create(options.leadRef, options.buildLead(testAuthorized));
        return { created: true, duplicate: false, testAuthorized };
    });
}

async function createOutboxIfAbsent(db, deliveryRef, deliveryData) {
    return db.runTransaction(async (transaction) => {
        const existing = await transaction.get(deliveryRef);
        if (existing.exists) return { created: false };
        transaction.create(deliveryRef, deliveryData);
        return { created: true };
    });
}

function readinessForPersistedDelivery(config, delivery, readiness) {
    return readiness(config, delivery.leadId, delivery.testAuthorized === true);
}

async function recoverExactTestOutbox(options) {
    let deliverySnapshot = await options.deliveryRef.get();
    if (deliverySnapshot.exists) return deliverySnapshot;
    const leadSnapshot = await options.leadRef.get();
    if (!leadSnapshot.exists || leadSnapshot.data().crmIntegrationTestAuthorized !== true) return null;
    await options.createDelivery(leadSnapshot.data());
    deliverySnapshot = await options.deliveryRef.get();
    return deliverySnapshot.exists ? deliverySnapshot : null;
}

module.exports = {
    createOutboxIfAbsent,
    persistLeadWithAuthorization,
    recoverExactTestOutbox,
    readinessForPersistedDelivery
};
