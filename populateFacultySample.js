// Script to populate the 'faculty' collection with sample data for CollabUp
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = getFirestore();

const facultySamples = [
  {
    id: 'faculty1',
    fullName: 'Arpita Roy',
    email: 'me22b1078@iiitdm.ac.in',
    instituteName: 'IIITDM Kancheepuram',
    researchInterests: ['AI/ML', 'Data Science'],
    spotsAvailable: 5,
    startDate: '2024-01-01',
  },
  {
    id: 'faculty2',
    fullName: 'Rishit Rastogi',
    email: 'me22b2017@iiitdm.ac.in',
    instituteName: 'IIITDM Kancheepuram',
    researchInterests: ['Robotics', 'Manufacturing'],
    spotsAvailable: 3,
    startDate: '2024-02-01',
  },
  {
    id: 'faculty3',
    fullName: 'Kush Jain',
    email: 'cs22b2010@iiitdm.ac.in',
    instituteName: 'IIITDM Kancheepuram',
    researchInterests: ['Cybersecurity', 'Networks'],
    spotsAvailable: 2,
    startDate: '2024-03-01',
  },
  {
    id: 'faculty4',
    fullName: 'Subhash Bishnoi',
    email: 'me22b2044@iiitdm.ac.in',
    instituteName: 'IIITDM Kancheepuram',
    researchInterests: ['Robotics', 'Manufacturing'],
    spotsAvailable: 4,
    startDate: '2024-04-01',
  },
  {
    id: 'faculty5',
    fullName: 'Dr. Amit Singh',
    email: 'amit.singh@example.com',
    instituteName: 'IIT Madras',
    researchInterests: ['Blockchain', 'Distributed Systems'],
    spotsAvailable: 1,
    startDate: '2024-05-01',
  },
  {
    id: 'faculty6',
    fullName: 'Dr. Neha Gupta',
    email: 'neha.gupta@example.com',
    instituteName: 'IIT Kharagpur',
    researchInterests: ['Cybersecurity', 'Network Security'],
    spotsAvailable: 2,
    startDate: '2024-06-01',
  },
  {
    id: 'faculty7',
    fullName: 'Dr. Sanjay Kumar',
    email: 'sanjay.kumar@example.com',
    instituteName: 'IIT Roorkee',
    researchInterests: ['IoT', 'Embedded Systems'],
    spotsAvailable: 3,
    startDate: '2024-07-01',
  },
  {
    id: 'faculty8',
    fullName: 'Dr. Kavita Sharma',
    email: 'kavita.sharma@example.com',
    instituteName: 'IIT Guwahati',
    researchInterests: ['Robotics', 'Control Systems'],
    spotsAvailable: 1,
    startDate: '2024-08-01',
  },
  {
    id: 'faculty9',
    fullName: 'Dr. Vikram Malhotra',
    email: 'vikram.malhotra@example.com',
    instituteName: 'IIT Hyderabad',
    researchInterests: ['Natural Language Processing', 'Deep Learning'],
    spotsAvailable: 2,
    startDate: '2024-09-01',
  }
];

async function populateFaculty() {
  for (const faculty of facultySamples) {
    await db.collection('faculty').doc(faculty.id).set(faculty, { merge: true });
    console.log(`Upserted faculty: ${faculty.fullName}`);
  }
  console.log('Sample faculty data population complete.');
  process.exit(0);
}

populateFaculty().catch(e => { console.error(e); process.exit(1); });
