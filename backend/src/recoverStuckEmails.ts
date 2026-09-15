import { prisma } from "./prisma";
import { emailQueue } from "./queue";

async function recoverStuckEmails() {
  console.log("Checking for stuck emails...");

  // Emails processing for more than 10 minutes
  const cutoff = new Date(
    Date.now() - 10 * 60 * 1000
  );

  const stuckEmails = await prisma.email.findMany({
    where: {
      status: "PROCESSING",
      processingAt: {
        lt: cutoff,
      },
    },
  });

  console.log(
    `Found ${stuckEmails.length} stuck email(s).`
  );

  for (const email of stuckEmails) {
    console.log(
      `Recovering email ${email.id}...`
    );

    /*
     * First put the email back into SCHEDULED.
     */
    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        status: "SCHEDULED",
        processingAt: null,
      },
    });

    /*
     * BullMQ uses a deterministic job ID.
     *
     * If the job already exists, BullMQ will not create
     * another job with the same ID.
     */
    const existingJob = await emailQueue.getJob(
      `email-${email.id}`
    );

    if (existingJob) {
      console.log(
        `BullMQ job already exists for email ${email.id}.`
      );

      continue;
    }

    /*
     * No existing job was found, so create one.
     */
    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
      },
      {
        jobId: `email-${email.id}`,
      }
    );

    console.log(
      `Email ${email.id} re-queued successfully.`
    );
  }
}

recoverStuckEmails()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(
      "Recovery failed:",
      error
    );

    await prisma.$disconnect();
    process.exit(1);
  });