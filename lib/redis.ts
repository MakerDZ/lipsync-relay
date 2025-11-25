import { RedisClient } from "bun";

let redisClient: RedisClient | null = null;

export async function initRedis(url?: string): Promise<void> {
  let redisUrl = url || process.env.REDIS_URL;

  if (!redisUrl) {
    console.log("Redis URL not provided, skipping Redis initialization");
    return;
  }

  if (!redisUrl.includes("family=")) {
    const separator = redisUrl.includes("?") ? "&" : "?";
    redisUrl = `${redisUrl}${separator}family=0`;
  }

  try {
    const needsTls =
      redisUrl.includes("proxy.rlwy.net") || redisUrl.startsWith("rediss://");

    const options: any = {
      connectionTimeout: 10000,
      autoReconnect: true,
      maxRetries: 3,
    };

    if (needsTls && !redisUrl.startsWith("rediss://")) {
      options.tls = true;
    }

    redisClient = new RedisClient(redisUrl, options);
    console.log("Redis client created successfully");

    await redisClient.ping();
    console.log("✓ Redis connection test successful");
  } catch (e: unknown) {
    console.error(
      `✗ Error connecting to Redis: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    console.log("Continuing without Redis...");
    redisClient = null;
    throw e;
  }
}

export function getRedis(): RedisClient | null {
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.close();
    redisClient = null;
    console.log("Redis connection closed");
  }
}

export function isRedisConnected(): boolean {
  return redisClient !== null;
}
