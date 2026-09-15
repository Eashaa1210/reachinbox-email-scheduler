import { Router } from "express";
import { prisma } from "./prisma";
import { emailQueue } from "./queue";

const router = Router();

/*
 * GET /api/emails
 *
 * Returns emails for a user.
 *
 * Optional query parameter:
 * ?status=SCHEDULED
 * ?status=SENT
 * ?status=FAILED
 */
router.get("/", async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const status = req.query.status as string | undefined;

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const where: {
      userId: number;
      status?: string;
    } = {
      userId,
    };

    if (status) {
      where.status = status;
    }

    const emails = await prisma.email.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
    });

    return res.json({
      count: emails.length,
      emails,
    });
  } catch (error) {
    console.error(
      "Get emails error:",
      error
    );

    return res.status(500).json({
      error: "Failed to fetch emails",
    });
  }
});

/*
 * POST /api/emails/schedule
 *
 * Schedule one email.
 */
router.post("/schedule", async (req, res) => {
  try {
    const {
      recipient,
      subject,
      body,
      scheduledAt,
      userId,
      senderId,
    } = req.body;

    if (
      !recipient ||
      !subject ||
      !body ||
      !scheduledAt ||
      !userId ||
      !senderId
    ) {
      return res.status(400).json({
        error:
          "recipient, subject, body, scheduledAt, userId and senderId are required",
      });
    }

    const scheduleDate =
      new Date(scheduledAt);

    if (isNaN(scheduleDate.getTime())) {
      return res.status(400).json({
        error: "Invalid scheduledAt date",
      });
    }

    const delay =
      scheduleDate.getTime() -
      Date.now();

    if (delay < 0) {
      return res.status(400).json({
        error:
          "scheduledAt must be in the future",
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
     * Create email in PostgreSQL.
     */
    const email =
      await prisma.email.create({
        data: {
          recipient,
          subject,
          body,
          scheduledAt: scheduleDate,
          status: "SCHEDULED",
          userId: Number(userId),
          senderId: Number(senderId),
        },
      });

    /*
     * Create deterministic BullMQ job.
     *
     * attempts:
     * The job can be retried if it fails.
     *
     * backoff:
     * Provides a small delay between retries.
     *
     * Rate-limit rescheduling is handled
     * separately by the worker.
     */
    const job =
      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
        },
        {
          delay,
          jobId: `email-${email.id}`,
          attempts: 10,
          backoff: {
            type: "fixed",
            delay: 5000,
          },
        }
      );

    /*
     * Store BullMQ job ID in PostgreSQL.
     */
    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        jobId: String(job.id),
      },
    });

    return res.status(201).json({
      message:
        "Email scheduled successfully",
      email,
      jobId: job.id,
    });
  } catch (error) {
    console.error(
      "Schedule email error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to schedule email",
    });
  }
});

export default router;