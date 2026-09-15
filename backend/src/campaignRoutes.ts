import { Router } from "express";
import { prisma } from "./prisma";
import { scheduleBulkEmails } from "./bulkScheduler";

const router = Router();

/*
 * POST /api/campaigns
 *
 * Creates a campaign and schedules all
 * recipient emails through BullMQ.
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      subject,
      body,
      startTime,
      hourlyLimit,
      delayMs,
      userId,
      senderId,
      recipients,
    } = req.body;

    /*
     * Basic validation.
     */
    if (
      !name ||
      !subject ||
      !body ||
      !startTime ||
      !userId ||
      !senderId ||
      !Array.isArray(recipients)
    ) {
      return res.status(400).json({
        error:
          "name, subject, body, startTime, userId, senderId and recipients are required",
      });
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        error:
          "At least one recipient is required",
      });
    }

    /*
     * Validate start time.
     */
    const campaignStartTime =
      new Date(startTime);

    if (
      isNaN(
        campaignStartTime.getTime()
      )
    ) {
      return res.status(400).json({
        error: "Invalid startTime",
      });
    }

    if (
      campaignStartTime.getTime() <
      Date.now()
    ) {
      return res.status(400).json({
        error:
          "startTime must be in the future",
      });
    }

    /*
     * Make sure the sender belongs
     * to the requested user.
     */
    const sender =
      await prisma.sender.findFirst({
        where: {
          id: Number(senderId),
          userId: Number(userId),
        },
      });

    if (!sender) {
      return res.status(400).json({
        error:
          "Sender not found for this user",
      });
    }

    /*
     * Create campaign in PostgreSQL.
     */
    const campaign =
      await prisma.campaign.create({
        data: {
          name,
          subject,
          body,
          startTime: campaignStartTime,
          hourlyLimit:
            hourlyLimit !== undefined
              ? Number(hourlyLimit)
              : null,
          delayMs:
            delayMs !== undefined
              ? Number(delayMs)
              : null,
          userId: Number(userId),
          senderId: Number(senderId),
        },
      });

    /*
     * Schedule all recipient emails.
     *
     * This creates the Email records
     * and BullMQ jobs.
     */
    const schedulingResult =
      await scheduleBulkEmails({
        campaignId: campaign.id,
        recipients,
      });

    return res.status(201).json({
      message:
        "Campaign created and emails scheduled successfully",
      campaign,
      scheduling: schedulingResult,
    });
  } catch (error) {
    console.error(
      "Create campaign error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to create campaign",
    });
  }
});


export default router;