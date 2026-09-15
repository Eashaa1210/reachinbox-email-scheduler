import "dotenv/config";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(
  recipient: string,
  subject: string,
  body: string
) {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipient,
    subject: subject,
    text: body,
  });

  console.log("Email sent successfully!");
  console.log("Message ID:", info.messageId);
  console.log(
    "Preview URL:",
    nodemailer.getTestMessageUrl(info)
  );

  return info;
}