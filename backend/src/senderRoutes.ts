import { Router } from "express";
import { prisma } from "./prisma";

const router = Router();

/*
 * GET /api/senders?userId=1
 *
 * Returns all senders belonging to a user.
 */
router.get("/", async (req, res) => {
  try {
    const userId = Number(req.query.userId);

    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    const senders = await prisma.sender.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        hourlyLimit: true,
        minDelayMs: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      count: senders.length,
      senders,
    });
  } catch (error) {
    console.error(
      "Get senders error:",
      error
    );

    return res.status(500).json({
      error: "Failed to fetch senders",
    });
  }
});


/*
 * POST /api/senders
 *
 * Creates a new sender.
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      hourlyLimit,
      minDelayMs,
      userId,
    } = req.body;

    if (
      !name ||
      !email ||
      !smtpHost ||
      !smtpPort ||
      !smtpUser ||
      !smtpPassword ||
      !userId
    ) {
      return res.status(400).json({
        error:
          "name, email, smtpHost, smtpPort, smtpUser, smtpPassword and userId are required",
      });
    }

    const existingSender =
      await prisma.sender.findUnique({
        where: {
          email,
        },
      });

    if (existingSender) {
      return res.status(409).json({
        error:
          "A sender with this email already exists",
      });
    }

    const sender =
      await prisma.sender.create({
        data: {
          name,
          email,
          smtpHost,
          smtpPort: Number(smtpPort),
          smtpUser,
          smtpPassword,
          hourlyLimit:
            hourlyLimit !== undefined
              ? Number(hourlyLimit)
              : 200,
          minDelayMs:
            minDelayMs !== undefined
              ? Number(minDelayMs)
              : 5000,
          userId: Number(userId),
        },
      });

    /*
     * Do not return the SMTP password
     * in the API response.
     */
    const safeSender = {
      id: sender.id,
      name: sender.name,
      email: sender.email,
      smtpHost: sender.smtpHost,
      smtpPort: sender.smtpPort,
      smtpUser: sender.smtpUser,
      hourlyLimit: sender.hourlyLimit,
      minDelayMs: sender.minDelayMs,
      userId: sender.userId,
      createdAt: sender.createdAt,
    };

    return res.status(201).json({
      message:
        "Sender created successfully",
      sender: safeSender,
    });
  } catch (error) {
    console.error(
      "Create sender error:",
      error
    );

    return res.status(500).json({
      error: "Failed to create sender",
    });
  }
});


export default router;