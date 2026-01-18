// Script to ensure all users in students, mentor, and faculty collections have correct roles in 'users' collection
// and to check/correct project and hackathons collections for owner/mentor/faculty references
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = getFirestore();

async function ensureUserDoc(uid, data, role) {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();
  const update = {
    role,
    fullName: data.fullName || data.name || 'User',
    email: data.email || '',
    instituteName: data.instituteName || data.college || '',
  };
  if (!userDoc.exists) {
    await userRef.set(update);
    console.log(`Created user doc for ${uid} as ${role}`);
  } else {
    await userRef.update(update);
    console.log(`Updated user doc for ${uid} as ${role}`);
  }
}

async function fixAllUserRoles() {
  // Students
  const students = await db.collection('students').get();
  for (const doc of students.docs) {
    await ensureUserDoc(doc.id, doc.data(), 'student');
  }
  // Mentors
  const mentors = await db.collection('mentors').get();
  for (const doc of mentors.docs) {
    await ensureUserDoc(doc.id, doc.data(), 'mentor');
  }
  // Faculty
  const faculties = await db.collection('faculty').get();
  for (const doc of faculties.docs) {
    await ensureUserDoc(doc.id, doc.data(), 'faculty');
  }
}

async function fixProjectAndHackathonOwners() {
  // Projects
  const projects = await db.collection('projects').get();
  for (const doc of projects.docs) {
    const data = doc.data();
    // Ensure ownerId/mentorId/facultyId fields are valid
    // (Assume ownerId is a student, mentorId is a mentor, facultyId is a faculty)
    // You can add more logic here if needed
    if (data.ownerId) {
      const userDoc = await db.collection('users').doc(data.ownerId).get();
      if (!userDoc.exists) {
        console.warn(`Project ${doc.id} has invalid ownerId: ${data.ownerId}`);
      }
    }
    if (data.mentorId) {
      const userDoc = await db.collection('users').doc(data.mentorId).get();
      if (!userDoc.exists) {
        console.warn(`Project ${doc.id} has invalid mentorId: ${data.mentorId}`);
      }
    }
    if (data.facultyId) {
      const userDoc = await db.collection('users').doc(data.facultyId).get();
      if (!userDoc.exists) {
        console.warn(`Project ${doc.id} has invalid facultyId: ${data.facultyId}`);
      }
    }
  }
  // Hackathons
  const hackathons = await db.collection('hackathons').get();
  for (const doc of hackathons.docs) {
    const data = doc.data();
    if (data.ownerId) {
      const userDoc = await db.collection('users').doc(data.ownerId).get();
      if (!userDoc.exists) {
        console.warn(`Hackathon ${doc.id} has invalid ownerId: ${data.ownerId}`);
      }
    }
  }
}

async function main() {
  await fixAllUserRoles();
  await fixProjectAndHackathonOwners();
  console.log('User roles and references fix complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
