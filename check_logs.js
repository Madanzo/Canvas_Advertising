const admin = require('firebase-admin');
var serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkLogs() {
    console.log('Checking communicationLogs...');
    const snapshot = await db.collection('communicationLogs').limit(5).get();
    console.log(`Found ${snapshot.size} logs.`);
    snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
    });
}

checkLogs().catch(console.error);
