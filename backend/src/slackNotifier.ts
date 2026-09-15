import { prisma } from "./prisma";

export async function notifySlack(
  userId: number,
  message: string
) {
  try {
    const connection =
      await prisma.slackConnection.findUnique({
        where: {
          userId,
        },
      });

    // No Slack connection = no notification
    if (!connection) {
      console.log(
        `Slack is not connected for user ${userId}. Skipping notification.`
      );

      return false;
    }

    if (!connection.webhookUrl) {
      console.log(
        `No Slack webhook configured for user ${userId}. Skipping notification.`
      );

      return false;
    }

    const response = await fetch(
      connection.webhookUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          text: message,
        }),
      }
    );

    const result = await response.text();

    if (!response.ok) {
      console.error(
        "Slack notification failed:",
        response.status,
        result
      );

      return false;
    }

    console.log(
      `Slack notification sent successfully for user ${userId}.`
    );

    return true;
  } catch (error) {
    console.error(
      "Slack notification error:",
      error
    );

    return false;
  }
}