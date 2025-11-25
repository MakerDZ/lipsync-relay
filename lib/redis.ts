import Redis, { type RedisOptions } from "ioredis";

let redisClient: Redis | null = null;
let lastRedisUrl: string | null = null;

const RECONNECTABLE_ERROR_CODES = new Set([
  "ERR_REDIS_CONNECTION_TIMEOUT",
  "ERR_REDIS_CONNECTION_CLOSED",
  "ECONNRESET",
  "ECONNREFUSED",
]);

type RedisError = Error & { code?: string };

function isConnectionError(error: unknown): error is RedisError {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as RedisError).code;
  if (code && RECONNECTABLE_ERROR_CODES.has(code)) {
    return true;
  }

  return (
    typeof error.message === "string" &&
    (error.message.includes("Connection has failed") ||
      error.message.includes("Connection timeout"))
  );
}

function buildRedisClient(redisUrl: string): Redis {
  const needsTls =
    redisUrl.includes("proxy.rlwy.net") || redisUrl.startsWith("rediss://");

  const options: RedisOptions = {
    connectTimeout: 10000,
    lazyConnect: false,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  };

  if (needsTls) {
    options.tls = { rejectUnauthorized: false };
  }

  const client = new Redis(redisUrl, options);
  client.on("error", (err) =>
    console.error("Redis client error:", err?.message ?? err)
  );
  client.on("reconnecting", () => console.warn("Redis client reconnecting..."));

  return client;
}

async function ensureRedisClient(url?: string): Promise<Redis> {
  if (!redisClient) {
    await initRedis(url);
  }

  if (!redisClient) {
    throw new Error("Redis connection not established");
  }

  return redisClient;
}

async function reconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (error) {
      console.warn("Error closing Redis client before reconnect:", error);
    } finally {
      redisClient = null;
    }
  }

  await initRedis(lastRedisUrl ?? undefined);
}

export async function initRedis(url?: string): Promise<void> {
  let redisUrl = url || process.env.REDIS_URL;

  if (!redisUrl) {
    console.log("Redis URL not provided, skipping Redis initialization");
    return;
  }

  lastRedisUrl = redisUrl;

  if (!redisUrl.includes("family=")) {
    const separator = redisUrl.includes("?") ? "&" : "?";
    redisUrl = `${redisUrl}${separator}family=0`;
  }

  try {
    if (redisClient) {
      await redisClient.quit();
    }

    redisClient = buildRedisClient(redisUrl);
    console.log("Redis client created successfully (ioredis)");

    await redisClient.ping();
    console.log("✓ Redis connection test successful");
  } catch (e: unknown) {
    console.error(
      `✗ Error connecting to Redis: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    console.log("Continuing without Redis...");
    if (redisClient) {
      redisClient.disconnect();
    }
    redisClient = null;
    throw e;
  }
}

export function getRedis(): Redis | null {
  return redisClient;
}

export async function withRedis<T>(
  operationName: string,
  fn: (redis: Redis) => Promise<T>,
  attempt = 0
): Promise<T> {
  const client = await ensureRedisClient();

  try {
    return await fn(client);
  } catch (error) {
    if (attempt === 0 && isConnectionError(error)) {
      console.warn(
        `Redis operation "${operationName}" failed (${
          (error as RedisError).code ?? "unknown"
        }) – attempting reconnect...`
      );
      await reconnectRedis();
      return withRedis(operationName, fn, attempt + 1);
    }
    throw error;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("Redis connection closed");
  }
}

export function isRedisConnected(): boolean {
  return redisClient !== null;
}
