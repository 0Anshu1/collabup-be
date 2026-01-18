// Script to delete all mock startup projects from Firestore
// Usage: node scripts/deleteMockStartupProjects.js

const admin = require('firebase-admin');
const serviceAccount = require('../path/to/your/serviceAccountKey.json'); // <-- Update this path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const batchSize = snapshot.size;
  if (batchSize === 0) {
    console.log(`No documents found in ${collectionName}.`);
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(`Deleted ${batchSize} documents from ${collectionName}.`);
}

async function main() {
  // Delete all startup projects
  await deleteCollection('startupProjects');
  // Optionally, delete all startups
  await deleteCollection('startups');
  // Optionally, delete all projects
  await deleteCollection('projects');
  console.log('Cleanup complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
