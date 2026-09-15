import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import emailRoutes from "./emailRoutes";
import senderRoutes from "./senderRoutes";
import campaignRoutes from "./campaignRoutes";
import emailSearchRoutes from "./emailSearchRoutes";
import { serverAdapter } from "./bullBoard";
import slackRoutes from "./slackRoutes";
import googleAuth from "./googleAuth";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message:
      "ReachInbox Email Scheduler API is running!",
  });
});

app.use(
  "/api/emails",
  emailRoutes
);

app.use(
  "/api/senders",
  senderRoutes
);

app.use(
  "/api/campaigns",
  campaignRoutes
);

app.use(
  "/api/search",
  emailSearchRoutes
);

app.use(
  "/api/slack",
  slackRoutes
);

app.use(
  "/api/auth", 
  googleAuth
);

/*
 * Bull Board dashboard
 *
 * Open:
 * http://localhost:5000/admin/queues
 */
app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

const PORT = 5000;

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});