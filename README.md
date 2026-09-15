# ReachInbox Email Scheduler

A full-stack email scheduling and delivery platform built with **Next.js, Node.js, PostgreSQL, Redis, BullMQ, Elasticsearch, and OAuth integrations**.

The system allows users to create email campaigns, upload recipients through CSV files, schedule emails, process them through persistent background workers, enforce sending limits, search email history, and monitor delivery activity.

---

## Features

- Google OAuth authentication
- Email campaign creation
- CSV recipient upload
- Bulk email scheduling
- Persistent background job processing with BullMQ
- Redis-backed job queue
- PostgreSQL database with Prisma ORM
- Configurable email sending delays
- Global, tenant, and sender-level rate limiting
- Automatic retry handling for failed emails
- Recovery of stuck email-processing jobs
- Email delivery status tracking
- Elasticsearch-powered email search
- Slack notifications for rate-limit events
- Bull Board queue monitoring
- Responsive Next.js dashboard
- Docker-based PostgreSQL, Redis, and Elasticsearch setup
- Production build support

---

## Architecture

```text
                    ┌─────────────────────┐
                    │      Next.js UI     │
                    │   Dashboard / CSV   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Express API      │
                    │     TypeScript      │
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────┘      └─────────────┐
              ▼                                 ▼
      ┌───────────────┐                 ┌───────────────┐
      │  PostgreSQL   │                 │     Redis     │
      │    Prisma     │                 │ Rate Limiting │
      └───────────────┘                 │   + BullMQ    │
                                        └───────┬───────┘
                                                │
                                                ▼
                                      ┌──────────────────┐
                                      │   Email Worker   │
                                      │      BullMQ      │
                                      └────────┬─────────┘
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │    SMTP Server   │
                                      │    Nodemailer    │
                                      └──────────────────┘

             ┌──────────────────┐
             │   Elasticsearch  │
             │   Email Search   │
             └──────────────────┘

             ┌──────────────────┐
             │    Slack OAuth   │
             │   Notifications  │
             └──────────────────┘
````

---

<details>
<summary><strong>How It Works</strong></summary>

### 1. User Authentication

Users sign in through Google OAuth.

The backend creates or retrieves the corresponding application user and associates campaigns, senders, and emails with that user.

### 2. Campaign Creation

A campaign contains:

* Campaign name
* Email subject
* Email body
* Sender
* Start time
* Sending delay
* Hourly sending limit

### 3. Recipient Upload

Recipients can be uploaded through a CSV file.

The frontend parses the CSV and sends the recipient list to the backend for bulk scheduling.

### 4. Email Scheduling

The bulk scheduler creates email records in PostgreSQL and creates corresponding delayed BullMQ jobs.

Each email receives its own scheduled time and queue job.

### 5. Background Processing

BullMQ workers process scheduled email jobs asynchronously.

Workers:

1. Retrieve the email from PostgreSQL
2. Claim the email for processing
3. Check sending limits
4. Send the email through SMTP
5. Update delivery status
6. Index the email in Elasticsearch
7. Notify Slack when applicable

### 6. Rate Limiting

The system applies multiple sending controls:

* Global hourly limit
* Tenant/user hourly limit
* Sender hourly limit
* Minimum delay between emails

Redis and Lua scripting are used to perform rate-limit checks atomically.

When a limit is reached, the email is returned to the scheduled state and its BullMQ job is delayed until it can be processed again.

### 7. Failure and Recovery

Failed email attempts are handled through BullMQ retries.

Emails that become stuck in `PROCESSING` can be detected and recovered through the recovery process.

This helps maintain delivery reliability even when workers restart unexpectedly.

### 8. Email Search

Successfully processed email records are indexed into Elasticsearch.

The application can then search email history using the search interface.

</details>

---

<details>
<summary><strong>Tech Stack</strong></summary>

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* PapaParse

### Backend

* Node.js
* Express
* TypeScript
* Prisma
* Nodemailer

### Data & Infrastructure

* PostgreSQL
* Redis
* BullMQ
* Elasticsearch
* Docker

### Integrations

* Google OAuth
* Slack OAuth
* Ethereal SMTP for development email delivery
* Bull Board

</details>

---

<details>
<summary><strong>Project Structure</strong></summary>

```text
reachinbox-email-scheduler/
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   └── src/
│       ├── bulkScheduler.ts
│       ├── bullBoard.ts
│       ├── campaignRoutes.ts
│       ├── elasticsearch.ts
│       ├── emailRoutes.ts
│       ├── emailSearch.ts
│       ├── emailSearchRoutes.ts
│       ├── googleAuth.ts
│       ├── prisma.ts
│       ├── queue.ts
│       ├── rateLimiter.ts
│       ├── recoverStuckEmails.ts
│       ├── reindexEmails.ts
│       ├── senderRoutes.ts
│       ├── server.ts
│       ├── slackNotifier.ts
│       ├── slackRoutes.ts
│       └── worker.ts
│
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   └── public/
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

</details>

---

<details>
<summary><strong>Local Setup</strong></summary>

### Prerequisites

Install:

* Node.js
* npm
* Docker Desktop
* Git

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
```

### 2. Start infrastructure

From the project root:

```bash
docker compose up -d postgres redis elasticsearch
```

This starts:

* PostgreSQL
* Redis
* Elasticsearch

### 3. Configure the backend

```bash
cd backend
npm install
```

Create a local `.env` file from:

```text
backend/.env.example
```

Then add your own local credentials and OAuth configuration.

### 4. Initialize the database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Start the backend

```bash
npx tsx src/server.ts
```

The API runs on:

```text
http://localhost:5000
```

### 6. Start the email worker

Open another terminal:

```bash
cd backend
npx tsx src/worker.ts
```

### 7. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:3000
```

</details>

---

<details>
<summary><strong>Environment Variables</strong></summary>

A safe environment variable template is provided at:

```text
backend/.env.example
```

Never commit your actual `.env` file or any:

* Credentials
* Passwords
* API keys
* OAuth secrets
* SMTP passwords
* Slack tokens
* Webhook secrets

The `.env.example` file contains placeholders only.

</details>

---

<details>
<summary><strong>📊 Queue Monitoring</strong></summary>

Bull Board is available through the backend queue monitoring interface.

It can be used during local development to inspect:

* Waiting jobs
* Delayed jobs
* Active jobs
* Completed jobs
* Failed jobs

</details>

---

## Testing & Reliability

The system has been tested for:

* Backend TypeScript compilation
* Frontend production builds
* Email scheduling
* Background worker processing
* BullMQ delayed jobs
* Worker restart persistence
* Rate-limit enforcement
* Slack rate-limit notifications
* Failed email retry handling
* Stuck email recovery
* Elasticsearch indexing and search

---

## Reliability Design

The application uses several mechanisms to improve reliability:

* Persistent BullMQ jobs backed by Redis
* Database-backed email state
* Atomic Redis Lua rate-limit checks
* Multiple rate-limit layers
* BullMQ retry and backoff
* Processing-state tracking
* Recovery of stuck emails
* Elasticsearch indexing for searchable email history

---

## Current Scope

The project demonstrates a complete email scheduling workflow from campaign creation to background processing and delivery tracking.

The architecture focuses on:

* Asynchronous processing
* Persistent scheduling
* Distributed rate limiting
* Failure handling
* Search infrastructure
* OAuth integrations
* Database-backed application state

> **Note:** This project is currently configured primarily for local development and portfolio demonstration rather than production email delivery.

---

<details>
<summary><strong>Future Improvements</strong></summary>

Potential future improvements include:

* Production deployment
* Secure encrypted storage for SMTP credentials
* Signed session/JWT-based authentication
* Authentication and authorization for administrative queue monitoring
* Environment-based API configuration
* Production SMTP provider integration
* Improved campaign analytics
* Email templates
* Scheduled campaign management
* Delivery analytics
* Additional observability and monitoring

</details>

---

## Author

**Eashaa Maanvi**

Computer Science & Business Systems student interested in software engineering, AI/ML, data systems, and scalable applications.

---

## Project Highlights

This project demonstrates practical experience with:

**Full-Stack Development · Distributed Systems · Background Jobs · Redis · PostgreSQL · Elasticsearch · OAuth · Rate Limiting · Docker · TypeScript · Next.js**
