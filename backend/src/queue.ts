import { Queue } from "bullmq";

export const emailQueue = new Queue(
  "email-queue",
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
    },

    defaultJobOptions: {
      attempts: 10,

      backoff: {
        type: "fixed",
        delay: 5000,
      },

      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);