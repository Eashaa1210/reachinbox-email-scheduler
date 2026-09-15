import { prisma } from "./prisma";
import { emailQueue } from "./queue";

type BulkScheduleInput = {
  campaignId: number;
  recipients: string[];
};

export async function scheduleBulkEmails({
  campaignId,
  recipients,
}: BulkScheduleInput) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      sender: true,
    },
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  if (recipients.length === 0) {
    throw new Error("No recipients provided");
  }

  const delayMs =
    campaign.delayMs ??
    campaign.sender.minDelayMs;

  const hourlyLimit =
    campaign.hourlyLimit ??
    campaign.sender.hourlyLimit;

  if (hourlyLimit <= 0) {
    throw new Error(
      "Hourly limit must be greater than 0"
    );
  }

  if (delayMs < 0) {
    throw new Error(
      "Delay must not be negative"
    );
  }

  const emails = [];

  /*
   * Schedule each email sequentially.
   *
   * Two rules are enforced:
   *
   * 1. Emails are always separated by at least delayMs.
   * 2. After every hourlyLimit emails, the next
   *    email is moved to the next one-hour window.
   *
   * This keeps the recipient order deterministic.
   */

  let previousScheduledAt =
    campaign.startTime.getTime();

  for (
    let i = 0;
    i < recipients.length;
    i++
  ) {
    let scheduledAt =
      previousScheduledAt;

    if (i > 0) {
      scheduledAt =
        previousScheduledAt +
        delayMs;
    }

    /*
     * When we reach the hourly limit,
     * force the next email into the next
     * one-hour window.
     */
    if (
      i > 0 &&
      i % hourlyLimit === 0
    ) {
      const hourlyWindowStart =
        campaign.startTime.getTime() +
        Math.floor(
          i / hourlyLimit
        ) *
          60 *
          60 *
          1000;

      scheduledAt = Math.max(
        scheduledAt,
        hourlyWindowStart
      );
    }

    previousScheduledAt =
      scheduledAt;

    const scheduledDate =
      new Date(scheduledAt);

    const email =
      await prisma.email.create({
        data: {
          recipient:
            recipients[i]!,
          subject:
            campaign.subject,
          body:
            campaign.body,
          scheduledAt:
            scheduledDate,
          status: "SCHEDULED",
          userId:
            campaign.userId,
          senderId:
            campaign.senderId,
          campaignId:
            campaign.id,
        },
      });

    const delay = Math.max(
      0,
      scheduledDate.getTime() -
        Date.now()
    );

    const job =
      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
        },
        {
          delay,
          jobId:
            `email-${email.id}`,
        }
      );

    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        jobId: String(job.id),
      },
    });

    emails.push(email);
  }

  return {
    campaignId:
      campaign.id,

    totalScheduled:
      emails.length,

    firstScheduledAt:
      emails[0]?.scheduledAt,

    lastScheduledAt:
      emails[
        emails.length - 1
      ]?.scheduledAt,
  };
}