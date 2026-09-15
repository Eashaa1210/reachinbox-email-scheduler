import Redis from "ioredis";

export const redis = new Redis({
  host: "localhost",
  port: 6379,
});

type RateLimitReason =
  | "MIN_DELAY"
  | "GLOBAL_LIMIT"
  | "TENANT_LIMIT"
  | "SENDER_LIMIT"
  | null;

type SendSlotResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterMs: number;
  reason: RateLimitReason;
};

export async function acquireSendSlot(
  senderId: number,
  userId: number,
  globalHourlyLimit: number,
  tenantHourlyLimit: number,
  senderHourlyLimit: number,
  minDelayMs: number
): Promise<SendSlotResult> {
  const now = Date.now();

  const currentDate = new Date(now);

  const hourKey =
    currentDate.toISOString().slice(0, 13);

  const globalKey =
    `rate_limit:global:${hourKey}`;

  const tenantKey =
    `rate_limit:tenant:${userId}:${hourKey}`;

  const senderKey =
    `rate_limit:sender:${senderId}:${hourKey}`;

  const delayKey =
    `sender_delay:${senderId}`;

  const script = `
    local globalKey = KEYS[1]
    local tenantKey = KEYS[2]
    local senderKey = KEYS[3]
    local delayKey = KEYS[4]

    local globalLimit = tonumber(ARGV[1])
    local tenantLimit = tonumber(ARGV[2])
    local senderLimit = tonumber(ARGV[3])
    local minDelay = tonumber(ARGV[4])
    local now = tonumber(ARGV[5])

    local globalCount =
      tonumber(redis.call("GET", globalKey) or "0")

    local tenantCount =
      tonumber(redis.call("GET", tenantKey) or "0")

    local senderCount =
      tonumber(redis.call("GET", senderKey) or "0")

    if globalCount >= globalLimit then
      return {0, senderCount, senderLimit, 0, "GLOBAL_LIMIT"}
    end

    if tenantCount >= tenantLimit then
      return {0, senderCount, senderLimit, 0, "TENANT_LIMIT"}
    end

    if senderCount >= senderLimit then
      return {0, senderCount, senderLimit, 0, "SENDER_LIMIT"}
    end

    local lastSent =
      redis.call("GET", delayKey)

    if lastSent then
      local elapsed =
        now - tonumber(lastSent)

      if elapsed < minDelay then
        local retryAfter =
          minDelay - elapsed

        return {
          0,
          senderCount,
          senderLimit,
          retryAfter,
          "MIN_DELAY"
        }
      end
    end

    local newGlobalCount =
      redis.call("INCR", globalKey)

    local newTenantCount =
      redis.call("INCR", tenantKey)

    local newSenderCount =
      redis.call("INCR", senderKey)

    redis.call("EXPIRE", globalKey, 3700)
    redis.call("EXPIRE", tenantKey, 3700)
    redis.call("EXPIRE", senderKey, 3700)

    redis.call("SET", delayKey, now)

    return {
      1,
      newSenderCount,
      senderLimit,
      0,
      "NONE"
    }
  `;

  const result = await redis.eval(
    script,
    4,
    globalKey,
    tenantKey,
    senderKey,
    delayKey,
    globalHourlyLimit,
    tenantHourlyLimit,
    senderHourlyLimit,
    minDelayMs,
    now
  );

  const values =
    result as Array<
      number | string
    >;

  const allowed =
    Number(values[0]) === 1;

  const count =
    Number(values[1] ?? 0);

  const limit =
    Number(
      values[2] ?? senderHourlyLimit
    );

  const retryValue =
    Number(values[3] ?? 0);

  const reasonValue =
    String(values[4] ?? "NONE");

  const reason: RateLimitReason =
    reasonValue === "MIN_DELAY" ||
    reasonValue === "GLOBAL_LIMIT" ||
    reasonValue === "TENANT_LIMIT" ||
    reasonValue === "SENDER_LIMIT"
      ? reasonValue
      : null;

  let retryAfterMs = 0;

  if (!allowed) {
    if (retryValue > 0) {
      retryAfterMs = retryValue;
    } else {
      const nextHour =
        new Date(currentDate);

      nextHour.setUTCMinutes(
        60,
        0,
        0
      );

      retryAfterMs =
        nextHour.getTime() -
        currentDate.getTime();
    }
  }

  return {
    allowed,
    count,
    limit,
    retryAfterMs,
    reason,
  };
}