import {
  elasticsearch,
  EMAIL_INDEX,
} from "./elasticsearch";

type EmailSearchDocument = {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
  userId: number;
  senderId: number | null;
  campaignId: number | null;
  createdAt: Date;
};

export async function indexEmail(
  email: EmailSearchDocument
) {
  try {
    await elasticsearch.index({
      index: EMAIL_INDEX,
      id: String(email.id),
      document: {
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
      },
    });

    console.log(
      `Email ${email.id} indexed in Elasticsearch.`
    );
  } catch (error) {
    console.error(
      `Failed to index email ${email.id}:`,
      error
    );
  }
}