import { Router } from "express";
import crypto from "crypto";
import { prisma } from "./prisma";
import { redis } from "./rateLimiter";

const router = Router();

router.get("/connect", async (req, res) => {
  try {
    const userId = Number(req.query.userId);

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const state = crypto.randomBytes(32).toString("hex");

    await redis.set(
      `slack_oauth_state:${state}`,
      String(userId),
      "EX",
      600
    );

    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      redirect_uri:
        process.env.SLACK_REDIRECT_URI!,
      state,
      user_scope: "",
      scope: "chat:write,incoming-webhook",
    });

    const slackUrl =
      `https://slack.com/oauth/v2/authorize?${params.toString()}`;

    return res.redirect(slackUrl);
  } catch (error) {
    console.error(
      "Slack connect error:",
      error
    );

    return res.status(500).json({
      error: "Failed to start Slack connection",
    });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!code || !state) {
      return res.status(400).json({
        error: "Missing Slack OAuth code or state",
      });
    }

    const userIdValue = await redis.get(
      `slack_oauth_state:${state}`
    );

    if (!userIdValue) {
      return res.status(400).json({
        error: "Invalid or expired OAuth state",
      });
    }

    await redis.del(
      `slack_oauth_state:${state}`
    );

    const response = await fetch(
      "https://slack.com/api/oauth.v2.access",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id:
            process.env.SLACK_CLIENT_ID!,
          client_secret:
            process.env.SLACK_CLIENT_SECRET!,
          code,
          redirect_uri:
            process.env.SLACK_REDIRECT_URI!,
        }),
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error(
        "Slack OAuth error:",
        data
      );

      return res.status(400).json({
        error:
          data.error ||
          "Slack OAuth failed",
      });
    }

    const userId = Number(userIdValue);

    await prisma.slackConnection.upsert({
      where: {
        userId,
      },

      update: {
        slackUserId:
          data.authed_user?.id || null,

        teamId:
          data.team?.id || null,

        accessToken:
          data.access_token,

        webhookUrl:
          data.incoming_webhook?.url || null,

        connectedAt: new Date(),
      },

      create: {
        userId,

        slackUserId:
          data.authed_user?.id || null,

        teamId:
          data.team?.id || null,

        accessToken:
          data.access_token,

        webhookUrl:
          data.incoming_webhook?.url || null,
      },
    });

    console.log(
      `Slack connected successfully for user ${userId}`
    );

    return res.redirect(
      "http://localhost:3000/?slack=connected"
    );
  } catch (error) {
    console.error(
      "Slack callback error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to complete Slack connection",
    });
  }
});

export default router;