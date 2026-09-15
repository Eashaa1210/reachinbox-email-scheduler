import { Worker, DelayedError } from "bullmq";
import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { acquireSendSlot, redis } from "./rateLimiter";
import { indexEmail } from "./emailSearch";
import { notifySlack } from "./slackNotifier";

const worker = new Worker(
  "email-queue",
  async (job) => {
    console.log("Processing job:", job.id);
    console.log("Job data:", job.data);

    const emailId = Number(job.data.emailId);

    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { sender: true },
    });

    if (!email) {
      throw new Error(`Email with ID ${emailId} not found`);
    }

    if (!email.sender || !email.senderId) {
      throw new Error(`Email ${email.id} does not have a valid sender`);
    }

    console.log("Email found in database:", email.id);
    console.log("Using sender:", email.sender.email);

    const claimResult = await prisma.email.updateMany({
      where: {
        id: email.id,
        status: {
          in: ["SCHEDULED", "FAILED"],
        },
      },
      data: {
        status: "PROCESSING",
        processingAt: new Date(),
      },
    });

    if (claimResult.count === 0) {
      console.log(
        `Email ${email.id} was already claimed or processed. Skipping.`
      );

      return {
        success: true,
        emailId: email.id,
        skipped: true,
      };
    }

    console.log(`Email ${email.id} successfully claimed by this worker.`);

    const sendSlot = await acquireSendSlot(
      email.senderId,
      email.userId,
      Number(process.env.GLOBAL_HOURLY_LIMIT || 1000),
      Number(process.env.TENANT_HOURLY_LIMIT || 500),
      email.sender.hourlyLimit,
      email.sender.minDelayMs
    );

    console.log(`Email ${email.id} send slot:`, sendSlot);

    if (!sendSlot.allowed) {
      if (
        sendSlot.reason === "GLOBAL_LIMIT" ||
        sendSlot.reason === "TENANT_LIMIT" ||
        sendSlot.reason === "SENDER_LIMIT"
      ) {
        await notifySlack(
          email.userId,
          `⚠️ ReachInbox rate limit reached. Email ${email.id} is being rescheduled. Reason: ${sendSlot.reason}.`
        );
      }

      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "SCHEDULED",
          processingAt: null,
        },
      });

      const retryAt = Date.now() + sendSlot.retryAfterMs + 100;

      console.log(
        `Email ${email.id} moved to delayed state until ${new Date(
          retryAt
        ).toISOString()}`
      );

      if (!job.token) {
        throw new Error("BullMQ job token is missing");
      }

      await job.moveToDelayed(retryAt, job.token);

      throw new DelayedError();
    }

    try {
      const transporter = nodemailer.createTransport({
        host: email.sender.smtpHost,
        port: email.sender.smtpPort,
        secure: false,
        auth: {
          user: email.sender.smtpUser,
          pass: email.sender.smtpPassword,
        },
      });

      const info = await transporter.sendMail({
        from: email.sender.email,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
      });

      console.log("Email sent successfully!");
      console.log("Message ID:", info.messageId);
      console.log(
        "Preview URL:",
        nodemailer.getTestMessageUrl(info)
      );

      const sentAt = new Date();

      const updatedEmail = await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "SENT",
          sentAt,
          processingAt: null,
        },
      });

      console.log(`Email ${email.id} marked as SENT`);

      await indexEmail({
        id: updatedEmail.id,
        recipient: updatedEmail.recipient,
        subject: updatedEmail.subject,
        body: updatedEmail.body,
        status: updatedEmail.status,
        scheduledAt: updatedEmail.scheduledAt,
        sentAt: updatedEmail.sentAt,
        userId: updatedEmail.userId,
        senderId: updatedEmail.senderId,
        campaignId: updatedEmail.campaignId,
        createdAt: updatedEmail.createdAt,
      });

      return {
        success: true,
        emailId: email.id,
      };
    } catch (error) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "FAILED",
          processingAt: null,
        },
      });

      console.error(
        `Email ${email.id} failed to send. BullMQ may retry this job.`
      );

      throw error;
    }
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed:`, err.message);
});

console.log("Email worker is running...");

process.on("SIGINT", async () => {
  console.log("\nShutting down worker...");
  await worker.close();
  await redis.quit();
  process.exit(0);
});
