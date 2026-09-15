"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Papa from "papaparse";

type User = {
  id: number;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type Email = {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
};

type Sender = {
  id: number;
  name: string;
  email: string;
};

export default function Home() {
  const [userId, setUserId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [emails, setEmails] = useState<Email[]>([]);
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [senderId, setSenderId] = useState("");
  const [delayMs, setDelayMs] = useState("5000");
  const [hourlyLimit, setHourlyLimit] = useState("200");

  const [csvCount, setCsvCount] = useState(0);
  const [csvRecipients, setCsvRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loggedInUserId = params.get("userId");

    if (loggedInUserId) {
      const id = Number(loggedInUserId);
      setUserId(id);
      localStorage.setItem("reachinbox_userId", String(id));
      window.history.replaceState({}, "", "/");
      return;
    }

    const savedUserId = localStorage.getItem("reachinbox_userId");

    if (savedUserId) {
      setUserId(Number(savedUserId));
    }
  }, []);

  async function fetchUser() {
    if (!userId) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/auth/user/${userId}`
      );

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
    }
  }

  async function fetchEmails() {
    if (!userId) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/emails?userId=${userId}`
      );

      const data = await response.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    }
  }

  async function fetchSenders() {
    if (!userId) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/senders?userId=${userId}`
      );

      const data = await response.json();
      setSenders(data.senders || []);

      if (data.senders?.length > 0) {
        setSenderId(String(data.senders[0].id));
      }
    } catch (error) {
      console.error("Failed to fetch senders:", error);
    }
  }

  useEffect(() => {
    if (userId) {
      fetchUser();
      fetchEmails();
      fetchSenders();
    }
  }, [userId]);

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getRecipients() {
    return recipient
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  async function handleSearch() {
    if (!userId) return;

    if (!search.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `http://localhost:5000/api/search?userId=${userId}&q=${encodeURIComponent(
          search
        )}`
      );

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search failed:", error);
      setMessage("Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const recipients = results.data
          .map((row: any) => row.email)
          .filter(
            (email: any) =>
              typeof email === "string" && email.trim().length > 0
          )
          .map((email: string) => email.trim());

        const uniqueRecipients = [...new Set(recipients)];

        setCsvRecipients(uniqueRecipients);
        setCsvCount(uniqueRecipients.length);
        setRecipient(uniqueRecipients.join(", "));

        if (uniqueRecipients.length === 0) {
          setMessage("The CSV does not contain valid email addresses.");
          setMessageType("error");
        } else {
          setMessage(`${uniqueRecipients.length} recipient(s) loaded from CSV.`);
          setMessageType("success");
        }
      },
    });
  }

  async function handleSchedule(event: FormEvent) {
    event.preventDefault();

    if (!userId) {
      setMessage("Please log in first.");
      setMessageType("error");
      return;
    }

    if (!senderId) {
      setMessage("Please select a sender.");
      setMessageType("error");
      return;
    }

    if (!startTime) {
      setMessage("Please select a start time.");
      setMessageType("error");
      return;
    }

    const scheduledDate = new Date(startTime);

    if (isNaN(scheduledDate.getTime())) {
      setMessage("Please enter a valid start time.");
      setMessageType("error");
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      setMessage("Start time must be in the future.");
      setMessageType("error");
      return;
    }

    const recipients =
      csvRecipients.length > 0 ? csvRecipients : getRecipients();

    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length === 0) {
      setMessage("Please enter at least one recipient.");
      setMessageType("error");
      return;
    }

    const invalidRecipients = uniqueRecipients.filter(
      (email) => !isValidEmail(email)
    );

    if (invalidRecipients.length > 0) {
      setMessage(
        `Please fix ${invalidRecipients.length} invalid recipient email(s).`
      );
      setMessageType("error");
      return;
    }

    if (!subject.trim()) {
      setMessage("Please enter an email subject.");
      setMessageType("error");
      return;
    }

    if (!body.trim()) {
      setMessage("Please enter an email message.");
      setMessageType("error");
      return;
    }

    const delay = Number(delayMs);
    const limit = Number(hourlyLimit);

    if (!Number.isFinite(delay) || delay < 0) {
      setMessage("Delay must be 0 or greater.");
      setMessageType("error");
      return;
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      setMessage("Emails per hour must be a whole number greater than 0.");
      setMessageType("error");
      return;
    }

    try {
      setLoading(true);
      setMessage("Scheduling your email campaign...");
      setMessageType("info");

      if (uniqueRecipients.length === 1) {
        const response = await fetch(
          "http://localhost:5000/api/emails/schedule",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipient: uniqueRecipients[0],
              subject: subject.trim(),
              body: body.trim(),
              scheduledAt: scheduledDate.toISOString(),
              userId,
              senderId: Number(senderId),
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to schedule email");
        }

        setMessage("Email scheduled successfully.");
      } else {
        const response = await fetch("http://localhost:5000/api/campaigns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `Campaign ${new Date().toLocaleString()}`,
            subject: subject.trim(),
            body: body.trim(),
            startTime: scheduledDate.toISOString(),
            hourlyLimit: limit,
            delayMs: delay,
            userId,
            senderId: Number(senderId),
            recipients: uniqueRecipients,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to schedule campaign");
        }

        setMessage(
          `${uniqueRecipients.length} email(s) scheduled successfully.`
        );
      }

      setMessageType("success");
      setRecipient("");
      setCsvRecipients([]);
      setCsvCount(0);
      setSubject("");
      setBody("");
      setStartTime("");

      await fetchEmails();
      setActiveTab("Scheduled");
    } catch (error) {
      console.error("Scheduling failed:", error);
      setMessage(
        error instanceof Error ? error.message : "Scheduling failed. Please try again."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("reachinbox_userId");
    setUserId(null);
    setUser(null);
    setEmails([]);
    setSenders([]);
    setSearchResults([]);
    setSearch("");
    setMessage("");
    setMessageType("info");
    setActiveTab("Dashboard");
  }

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-3xl font-bold">ReachInbox</h1>
          <p className="mt-3 text-gray-500">
            Sign in to manage your email campaigns.
          </p>

          <button
            onClick={() => {
              window.location.href =
                "http://localhost:5000/api/auth/google";
            }}
            className="mt-8 w-full rounded-lg border bg-white px-6 py-3 font-medium shadow-sm hover:bg-gray-50"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  const scheduledEmails = emails.filter(
    (email) => email.status === "SCHEDULED"
  );

  const sentEmails = emails.filter(
    (email) => email.status === "SENT"
  );

  const displayedSentEmails = search.trim()
    ? searchResults
    : sentEmails;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b bg-white p-4 sm:p-6 lg:w-64 lg:border-b-0 lg:border-r">
          <h1 className="mb-8 text-2xl font-bold">ReachInbox</h1>

          <nav className="grid grid-cols-2 gap-2 lg:block lg:space-y-2">
            {["Dashboard", "Scheduled", "Sent", "Compose"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full rounded-lg px-4 py-3 text-left ${
                  activeTab === tab
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-8 w-full rounded-lg border px-4 py-3 text-left hover:bg-gray-100"
          >
            Logout
          </button>
        </aside>

        <section className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold">{activeTab}</h2>
              <p className="mt-1 text-gray-500">
                Email scheduling and campaign management
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setLoading(true);
                  await fetchEmails();
                  await fetchSenders();
                  await fetchUser();
                  setLoading(false);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>

              {user && (
                <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name || "User"}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 font-semibold">
                      {(user.name || user.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}

                  <div>
                    <p className="font-medium">
                      {user.name || "User"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {user.email}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {message && (
            <div
              className={`mb-6 rounded-lg border p-4 text-sm font-medium ${
                messageType === "success"
                  ? "border-gray-300 bg-gray-50 text-gray-900"
                  : messageType === "error"
                    ? "border-gray-400 bg-white text-gray-900"
                    : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {message}
            </div>
          )}

          {activeTab === "Dashboard" && (
            <div className="space-y-6">
              {(() => {
                const failedEmails = emails.filter(
                  (email) => email.status === "FAILED"
                );

                const successRate =
                  emails.length > 0
                    ? Math.round((sentEmails.length / emails.length) * 100)
                    : 0;

                const recentEmails = [...emails]
                  .sort(
                    (a, b) =>
                      new Date(b.scheduledAt).getTime() -
                      new Date(a.scheduledAt).getTime()
                  )
                  .slice(0, 5);

                return (
                  <>
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Total Emails</p>
                        <p className="mt-2 text-3xl font-bold">
                          {emails.length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Scheduled</p>
                        <p className="mt-2 text-3xl font-bold">
                          {scheduledEmails.length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Sent</p>
                        <p className="mt-2 text-3xl font-bold">
                          {sentEmails.length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Failed</p>
                        <p className="mt-2 text-3xl font-bold">
                          {failedEmails.length}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-6 shadow-sm">
                        <p className="text-sm text-gray-500">Success Rate</p>
                        <p className="mt-2 text-3xl font-bold">
                          {successRate}%
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white shadow-sm">
                      <div className="border-b p-6">
                        <h3 className="text-xl font-semibold">
                          Recent Activity
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Your latest scheduled and sent emails
                        </p>
                      </div>

                      {recentEmails.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="border-b bg-gray-50">
                              <tr>
                                <th className="p-4 text-left text-sm font-medium">
                                  Recipient
                                </th>
                                <th className="p-4 text-left text-sm font-medium">
                                  Subject
                                </th>
                                <th className="p-4 text-left text-sm font-medium">
                                  Date
                                </th>
                                <th className="p-4 text-left text-sm font-medium">
                                  Status
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {recentEmails.map((email) => (
                                <tr key={email.id} className="border-b last:border-0">
                                  <td className="p-4 text-sm">
                                    {email.recipient}
                                  </td>
                                  <td className="p-4 text-sm">
                                    {email.subject}
                                  </td>
                                  <td className="p-4 text-sm text-gray-500">
                                    {new Date(
                                      email.sentAt || email.scheduledAt
                                    ).toLocaleString()}
                                  </td>
                                  <td className="p-4">
                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                                      {email.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="p-8 text-center text-gray-500">
                          No email activity yet.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === "Scheduled" && (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="p-4 text-left">Recipient</th>
                    <th className="p-4 text-left">Subject</th>
                    <th className="p-4 text-left">Scheduled</th>
                    <th className="p-4 text-left">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {scheduledEmails.map((email) => (
                    <tr key={email.id} className="border-b">
                      <td className="p-4">{email.recipient}</td>
                      <td className="p-4">{email.subject}</td>
                      <td className="p-4">
                        {new Date(email.scheduledAt).toLocaleString()}
                      </td>
                      <td className="p-4">{email.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {scheduledEmails.length === 0 && (
                <p className="p-8 text-center text-gray-500">
                  No scheduled emails.
                </p>
              )}
            </div>
          )}

          {activeTab === "Sent" && (
            <div>
              <div className="mb-6 flex gap-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  placeholder="Search recipient, subject or message..."
                  className="flex-1 rounded-lg border bg-white px-4 py-3 outline-none focus:ring-2"
                />

                <button
                  onClick={handleSearch}
                  className="rounded-lg bg-black px-6 py-3 text-white"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>

              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <table className="w-full">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="p-4 text-left">Recipient</th>
                      <th className="p-4 text-left">Subject</th>
                      <th className="p-4 text-left">Sent</th>
                      <th className="p-4 text-left">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayedSentEmails.map((email) => (
                      <tr key={email.id} className="border-b">
                        <td className="p-4">{email.recipient}</td>
                        <td className="p-4">{email.subject}</td>
                        <td className="p-4">
                          {email.sentAt
                            ? new Date(email.sentAt).toLocaleString()
                            : "-"}
                        </td>
                        <td className="p-4">{email.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {displayedSentEmails.length === 0 && (
                  <p className="p-8 text-center text-gray-500">
                    No matching emails found.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "Compose" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <form
                onSubmit={handleSchedule}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="border-b border-gray-200 p-6">
                  <h3 className="text-xl font-semibold">Create campaign</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Compose your email and choose when it should be delivered.
                  </p>
                </div>

                <div className="space-y-6 p-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Recipients
                    </label>
                    <textarea
                      value={recipient}
                      onChange={(event) => {
                        setRecipient(event.target.value);
                        setCsvRecipients([]);
                        setCsvCount(0);
                      }}
                      placeholder="email1@example.com, email2@example.com"
                      className="min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-gray-100"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>Separate multiple emails with commas.</span>
                      <span className="font-medium">
                        {csvRecipients.length > 0
                          ? `${csvRecipients.length} loaded from CSV`
                          : `${recipient.split(",").map((email) => email.trim()).filter(Boolean).length} recipient(s)`}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Upload recipient list</p>
                        <p className="mt-1 text-xs text-gray-500">CSV file with an email column</p>
                      </div>
                      <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-100">
                        Choose CSV
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCsvUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {csvCount > 0 && (
                      <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-600">
                        âœ“ {csvCount} recipient(s) loaded successfully
                      </div>
                    )}
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Sender
                      </label>
                      <select
                        value={senderId}
                        onChange={(event) => setSenderId(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-gray-100"
                        required
                      >
                        {senders.length === 0 && (
                          <option value="">No sender available</option>
                        )}
                        {senders.map((sender) => (
                          <option key={sender.id} value={sender.id}>
                            {sender.name} â€” {sender.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Start time
                      </label>
                      <input
                        type="datetime-local"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-gray-100"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Subject
                    </label>
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="Enter your email subject"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-gray-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Message
                    </label>
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Write your email message..."
                      className="min-h-40 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-gray-100"
                      required
                    />
                    <p className="mt-2 text-right text-xs text-gray-400">
                      {body.length} characters
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-4">
                      <p className="text-sm font-medium">Delivery controls</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Control spacing and hourly sending limits.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Delay between emails
                        </label>
                        <div className="flex">
                          <input
                            type="number"
                            min="0"
                            value={delayMs}
                            onChange={(event) => setDelayMs(event.target.value)}
                            className="w-full rounded-l-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black"
                          />
                          <span className="flex items-center rounded-r-xl border border-l-0 border-gray-300 bg-gray-50 px-3 text-xs text-gray-500">
                            ms
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Emails per hour
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={hourlyLimit}
                          onChange={(event) => setHourlyLimit(event.target.value)}
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || senders.length === 0}
                    className="w-full rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Scheduling..." : "Schedule campaign"}
                  </button>
                </div>
              </form>

              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">Campaign summary</h3>
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-sm text-gray-500">Recipients</span>
                      <span className="font-semibold">
                        {csvRecipients.length > 0
                          ? csvRecipients.length
                          : recipient.split(",").map((email) => email.trim()).filter(Boolean).length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-sm text-gray-500">Delay</span>
                      <span className="font-semibold">{delayMs || 0} ms</span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-3">
                      <span className="text-sm text-gray-500">Hourly limit</span>
                      <span className="font-semibold">{hourlyLimit || 0}/hr</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Sender</span>
                      <span className="max-w-[170px] truncate text-right text-sm font-medium">
                        {senders.find((sender) => String(sender.id) === senderId)?.email || "Not selected"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">Before you schedule</h3>
                  <ul className="mt-4 space-y-3 text-sm text-gray-600">
                    <li>â€¢ Verify all recipient addresses.</li>
                    <li>â€¢ Check the sender and start time.</li>
                    <li>â€¢ Use CSV for larger campaigns.</li>
                    <li>â€¢ Delivery limits are enforced by the backend.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </section>
      </div>
    </main>
  );
}


