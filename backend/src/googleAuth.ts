import { Router } from "express";
import { google } from "googleapis";
import { prisma } from "./prisma";

const router = Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:5000/api/auth/callback/google"
);

router.get("/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
  });

  res.redirect(url);
});

router.get("/callback/google", async (req, res) => {
  try {
    const code = String(req.query.code || "");

    if (!code) {
      return res.status(400).json({
        error: "Authorization code is missing",
      });
    }

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const { data } = await oauth2.userinfo.get();

    if (!data.email) {
      return res.status(400).json({
        error: "Google account email not found",
      });
    }

    const user = await prisma.user.upsert({
      where: {
        email: data.email,
      },
      update: {
        name: data.name || null,
        avatarUrl: data.picture || null,
      },
      create: {
        email: data.email,
        name: data.name || null,
        avatarUrl: data.picture || null,
      },
    });

    console.log("Google login successful:", user.email);

    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}?login=success&userId=${user.id}`
    );
  } catch (error) {
    console.error("Google OAuth error:", error);

    return res.status(500).json({
      error: "Google authentication failed",
    });
  }
});

router.get("/user/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!userId) {
      return res.status(400).json({
        error: "Invalid userId",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    return res.json({
      user,
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      error: "Failed to fetch user",
    });
  }
});

export default router;