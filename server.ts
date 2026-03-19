import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(cors());
  app.use(express.json());

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log("Firebase Admin initialized successfully.");
      } else {
        console.warn("Firebase Admin credentials missing. Push notifications won't work.");
      }
    } catch (error) {
      console.error("Error initializing Firebase Admin:", error);
    }
  }

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/notify", async (req, res) => {
    try {
      const { callerId, calleeId, type } = req.body;

      if (!callerId || !calleeId) {
        return res.status(400).json({ error: "Missing callerId or calleeId" });
      }

      if (!admin.apps.length) {
        return res.status(500).json({ error: "Firebase Admin not configured" });
      }

      const db = admin.firestore();
      
      // Get caller info
      const callerDoc = await db.collection('users').doc(callerId).get();
      const callerName = callerDoc.exists ? callerDoc.data()?.displayName : 'Someone';

      // Get callee info
      const calleeDoc = await db.collection('users').doc(calleeId).get();
      if (!calleeDoc.exists) {
        return res.status(404).json({ error: "Callee not found" });
      }

      const fcmToken = calleeDoc.data()?.fcmToken;
      if (!fcmToken) {
        return res.status(400).json({ error: "Callee has no FCM token" });
      }

      const message = {
        notification: {
          title: 'Incoming Call',
          body: `${callerName} is calling you via ${type}...`,
        },
        data: {
          url: process.env.APP_URL || 'https://web-calling-6k2.pages.dev/'
        },
        token: fcmToken,
        webpush: {
          fcmOptions: {
            link: process.env.APP_URL || 'https://web-calling-6k2.pages.dev/'
          }
        }
      };

      await admin.messaging().send(message);
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
