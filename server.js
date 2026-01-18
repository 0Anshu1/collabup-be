import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
dotenv.config();

const PORT = process.env.PORT || 5050;
const app = express();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var");
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("✅ Firebase Admin initialized via applicationDefault");
    }
  } catch (err) {
    console.error("❌ Failed to initialize Firebase Admin:", err.message);
  }
}

// Initialize Google Cloud Storage client (uses Cloud Run service account by default)
const storage = new Storage();
const bucketName = process.env.BUCKET_NAME;

// Allow multiple origins for CORS (development and production)
const allowedOrigins = [
  'https://frontend-two-omega-26.vercel.app',
  'http://Collabup.live',
  'https://Collabup.live',
  'http://collabup.live',
  'https://collabup.live',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

// Add custom origins from environment variables if provided
if (process.env.ALLOWED_ORIGIN) {
  allowedOrigins.push(process.env.ALLOWED_ORIGIN.trim().replace(/\/$/, ""));
}
if (process.env.ALLOWED_ORIGINS) {
  const origins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().replace(/\/$/, ""));
  allowedOrigins.push(...origins);
}

// Clean up existing allowedOrigins to remove trailing slashes for safety
const cleanedAllowedOrigins = allowedOrigins.map(o => o.trim().replace(/\/$/, ""));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Normalize the origin by removing trailing slash for comparison
    const normalizedOrigin = origin.trim().replace(/\/$/, "");
    
    if (cleanedAllowedOrigins.indexOf(normalizedOrigin) !== -1) {
      return callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// Simple health check
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// Middleware to verify Firebase Auth ID token
async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // contains uid, email, etc.
    return next();
  } catch (err) {
    console.error("Auth verify error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Fetch user's role from Firestore (fallback to 'student' if not found)
async function getUserRole(uid) {
  try {
    const snap = await admin.firestore().doc(`users/${uid}`).get();
    const role = snap.exists ? snap.get('role') : null;
    return (role || 'student').toString();
  } catch (err) {
    console.error('Error fetching user role:', err);
    return 'student';
  }
}

// Check whether the objectPath is allowed for this role and user
function isPathAllowedForRole(role, uid, objectPath) {
  const baseByRole = {
    student: [
      `users/students/${uid}/`,
      'projects/student-projects/',
    ],
    faculty: [
      `users/faculty/${uid}/`,
      'projects/research-projects/',
    ],
    mentor: [
      `users/mentors/${uid}/`,
    ],
    startup: [
      `users/startups/${uid}/`,
      'projects/startup-projects/',
    ],
    admin: [
      `users/admins/${uid}/`,
      'projects/',
      'users/',
    ],
  };

  // Legacy prefixes kept for compatibility while migrating paths
  const legacy = [
    `profile-pictures/${uid}/`,
    `id-documents/${uid}/`,
    `enrollments/${uid}/`,
    // old project path style: project-files/{projectId}/{userId}/...
    'project-files/',
  ];

  const allowedPrefixes = [ ...(baseByRole[role] || []), ...legacy ];
  const hasAllowedPrefix = allowedPrefixes.some((p) => objectPath.startsWith(p));
  if (!hasAllowedPrefix) return false;

  // Non-admins must only operate on paths that include their uid
  const includesUid = objectPath.includes(uid);
  if (role !== 'admin' && !includesUid) return false;
  return true;
}

// Issue a V4 signed URL for direct browser upload to Cloud Storage
// Expects JSON: { objectPath: string, contentType: string }
// Enforces that objectPath includes the caller's uid to prevent cross-user writes
app.post("/signed-url", verifyAuth, async (req, res) => {
  try {
    if (!bucketName) {
      return res.status(500).json({ error: "BUCKET_NAME env var not set" });
    }

    const { objectPath, contentType } = req.body || {};
    if (!objectPath || !contentType) {
      return res.status(400).json({ error: "objectPath and contentType are required" });
    }

    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    // Role-based path enforcement
    const role = await getUserRole(uid);
    if (!isPathAllowedForRole(role, uid, objectPath)) {
      return res.status(403).json({ error: "Upload path not allowed for your role" });
    }

    // Optional: further scope uploads to certain prefixes only
    // e.g., allow only under user-uploads/{uid}/
    // if (!objectPath.startsWith(`user-uploads/${uid}/`)) {
    //   return res.status(403).json({ error: "Invalid upload path" });
    // }

    const [url] = await storage
      .bucket(bucketName)
      .file(objectPath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        contentType,
      });

    return res.status(200).json({ url });
  } catch (err) {
    console.error("Signed URL error:", err);
    return res.status(500).json({ error: "Failed to create signed URL" });
  }
});

// Issue a V4 signed URL for reading a private object
// Expects JSON: { objectPath: string }
app.post("/signed-url-read", verifyAuth, async (req, res) => {
  try {
    if (!bucketName) {
      return res.status(500).json({ error: "BUCKET_NAME env var not set" });
    }
    const { objectPath } = req.body || {};
    if (!objectPath) {
      return res.status(400).json({ error: "objectPath is required" });
    }
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const role = await getUserRole(uid);
    if (!isPathAllowedForRole(role, uid, objectPath)) {
      return res.status(403).json({ error: "Read path not allowed for your role" });
    }
    const [url] = await storage
      .bucket(bucketName)
      .file(objectPath)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      });
    return res.status(200).json({ url });
  } catch (err) {
    console.error("Signed URL read error:", err);
    return res.status(500).json({ error: "Failed to create signed read URL" });
  }
});

app.post("/send-feedback", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: process.env.MAIL_RECEIVER,
      subject: `New Feedback from ${name}`,
      text: `
You have received a new feedback:

Name: ${name}
Email: ${email}
Message: ${message}
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Email sent!" });
  } catch (error) {
    console.error("Mail error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.post("/api/send-email", async (req, res) => {
  console.log('DEBUG: /api/send-email req.body:', req.body);
  const { to, subject, text, html } = req.body;
  if (!to || !subject || !text) {
    return res.status(400).json({ error: "To, subject, and text are required." });
  }
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
    const mailOptions = {
      from: `CollabUp <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
      html: html || `<p>${text}</p>`
    };
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Email sent!" });
  } catch (error) {
    console.error("Mail error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// --- Role-Specific Business Logic APIs ---

// Create a research project (Faculty only)
app.post("/api/projects/research", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'faculty' && userData.role !== 'admin') {
      return res.status(403).json({ error: "Only faculty can create research projects" });
    }

    const projectData = {
      ...req.body,
      facultyId: uid,
      facultyName: userData.fullName || userData.name || "Unknown Faculty",
      instituteName: userData.instituteName || userData.institute || "Unknown Institute",
      facultyEmail: userData.email || req.user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await admin.firestore().collection("researchProjects").add(projectData);
    return res.status(201).json({ id: docRef.id, ...projectData });
  } catch (err) {
    console.error("Create research project error:", err);
    return res.status(500).json({ error: "Failed to create research project" });
  }
});

// Create a startup project (Startup only)
app.post("/api/projects/startup", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'startup' && userData.role !== 'admin') {
      return res.status(403).json({ error: "Only startups can create projects" });
    }

    const projectData = {
      ...req.body,
      startupId: uid,
      startupName: userData.startupName || userData.company || req.body.company || "Your Startup",
      founderName: userData.fullName || userData.name || "Unknown Founder",
      startupEmail: userData.email || req.user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await admin.firestore().collection("startupProjects").add(projectData);
    return res.status(201).json({ id: docRef.id, ...projectData });
  } catch (err) {
    console.error("Create startup project error:", err);
    return res.status(500).json({ error: "Failed to create startup project" });
  }
});

// Create a student project (Student only)
app.post("/api/projects/student", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }
    
    const userData = userDoc.data();
    if (userData.role !== 'student' && userData.role !== 'admin') {
      return res.status(403).json({ error: "Only students can create projects" });
    }

    const projectData = {
      ...req.body,
      ownerId: uid,
      ownerName: userData.fullName || userData.name || req.body.ownerName || "Unknown Student",
      ownerEmail: userData.email || req.user.email || req.body.ownerEmail,
      instituteName: userData.instituteName || userData.institute || "Unknown Institute",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await admin.firestore().collection("studentProjects").add(projectData);
    return res.status(201).json({ id: docRef.id, ...projectData });
  } catch (err) {
    console.error("Create student project error:", err);
    return res.status(500).json({ error: "Failed to create student project" });
  }
});

// Fetch talent matches for a startup
app.get("/api/talent/matches", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = await getUserRole(uid);
    if (role !== 'startup' && role !== 'admin') {
      return res.status(403).json({ error: "Only startups can access talent matches" });
    }

    // Mock AI matching: in a real app, this would query based on project requirements
    const studentsSnap = await admin.firestore().collection("users")
      .where("role", "==", "student")
      .limit(10)
      .get();
    
    const matches = studentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      matchScore: Math.floor(Math.random() * 20) + 80 // Random score 80-100%
    }));

    return res.status(200).json({ matches });
  } catch (err) {
    console.error("Talent matches error:", err);
    return res.status(500).json({ error: "Failed to fetch talent matches" });
  }
});

// Fetch faculty leaderboard
app.get("/api/faculty/leaderboard", async (_req, res) => {
  try {
    const snap = await admin.firestore().collection("users")
      .where("role", "==", "faculty")
      .orderBy("collabCount", "desc")
      .limit(10)
      .get();
    
    const leaderboard = snap.docs.map(doc => ({
      id: doc.id,
      fullName: doc.get("fullName"),
      institute: doc.get("institute"),
      collabCount: doc.get("collabCount") || 0
    }));

    return res.status(200).json({ leaderboard });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Securely update collaboration request and notify student
app.post("/api/requests/update-status", verifyAuth, async (req, res) => {
  try {
    const { requestId, collectionName, status, studentEmail, projectName } = req.body;
    const uid = req.user.uid;

    if (!requestId || !collectionName || !status) {
      return res.status(400).json({ error: "requestId, collectionName, and status are required" });
    }

    const requestRef = admin.firestore().collection(collectionName).doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Verify the user owns this request (e.g., facultyId or mentorId matches)
    const data = requestSnap.data();
    if (data.facultyId !== uid && data.mentorId !== uid && data.startupId !== uid) {
      return res.status(403).json({ error: "Unauthorized to update this request" });
    }

    await requestRef.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Send notification email if studentEmail is provided
    if (studentEmail) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });

      const mailOptions = {
        from: `CollabUp <${process.env.MAIL_USER}>`,
        to: studentEmail,
        subject: `Update on your request for ${projectName || 'a project'}`,
        text: `Your request has been ${status}. Log in to CollabUp to see more details.`,
        html: `<h3>Status Update</h3><p>Your request for <b>${projectName || 'the project'}</b> has been <b>${status}</b>.</p><p>Log in to <a href="https://collabup.live">CollabUp</a> to see more details.</p>`
      };

      await transporter.sendMail(mailOptions);
    }

    return res.status(200).json({ success: true, message: `Request ${status} and notification sent.` });
  } catch (err) {
    console.error("Request update error:", err);
    return res.status(500).json({ error: "Failed to update request" });
  }
});

// Update mentor impact stats
app.post("/api/mentor/stats", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = await getUserRole(uid);
    if (role !== 'mentor' && role !== 'admin') {
      return res.status(403).json({ error: "Only mentors can update impact stats" });
    }

    const { totalHours, menteesHelped, rating } = req.body;
    const statsUpdate = {
      impactStats: {
        totalHours: Number(totalHours) || 0,
        menteesHelped: Number(menteesHelped) || 0,
        rating: Number(rating) || 5.0,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin.firestore().collection("users").doc(uid).update(statsUpdate);
    return res.status(200).json({ success: true, stats: statsUpdate.impactStats });
  } catch (err) {
    console.error("Update mentor stats error:", err);
    return res.status(500).json({ error: "Failed to update mentor stats" });
  }
});

// Fetch mentor impact stats
app.get("/api/mentor/stats/:uid", async (req, res) => {
  try {
    const uid = req.params.uid;
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Mentor not found" });
    }
    
    const data = userDoc.data();
    if (data.role !== 'mentor') {
      return res.status(400).json({ error: "User is not a mentor" });
    }
    
    return res.status(200).json(data.impactStats || { totalHours: 0, menteesHelped: 0, rating: 5.0 });
  } catch (err) {
    console.error("Fetch mentor stats error:", err);
    return res.status(500).json({ error: "Failed to fetch mentor stats" });
  }
});

console.log("Loaded [server.js](http://_vscodecontentref_/0) and registered role-specific APIs");
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
