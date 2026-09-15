import { prisma } from "./prisma";
import { indexEmail } from "./emailSearch";

async function reindexEmails() {
  console.log("Starting Elasticsearch re-index...");

  const emails = await prisma.email.findMany({
    where: {
      userId: 2,
      status: "SENT",
    },
  });

  console.log(`Found ${emails.length} sent emails.`);

  for (const email of emails) {
    await indexEmail({
      id: email.id,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      status: email.status,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      userId: email.userId,
      senderId: email.senderId,
      campaignId: email.campaignId,
      createdAt: email.createdAt,
    });

    console.log(`Re-indexed email ${email.id}`);
  }

  console.log("Elasticsearch re-index completed.");
}

reindexEmails()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Re-index failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });