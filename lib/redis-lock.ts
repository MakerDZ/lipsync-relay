import { getRedis } from "../lib/redis";
import { randomUUID } from "crypto";

const LOCK_PREFIX = "lock:";

export async function acquireLock(
  key: string,
  ttlMs: number = 5000
): Promise<string | null> {
  const redis = getRedis();
  const token = randomUUID();
  if (!redis) {
    throw new Error("Redis connection not established");
  }
  const result = await redis.set(
    LOCK_PREFIX + key,
    token,
    "NX",
    "PX",
    ttlMs.toString()
  );

  // result = "OK" if we got the lock, null if not
  return result === "OK" ? token : null;
}

export async function releaseLock(key: string, token: string) {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Redis connection not established");
  }
  const lockKey = LOCK_PREFIX + key;

  // Check if the lock belongs to this token before deleting
  const currentToken = await redis.get(lockKey);
  if (currentToken === token) {
    await redis.del(lockKey);
  }
}

export async function acquireLockWithRetry(
  key: string,
  ttlMs = 5000,
  retryDelay = 100,
  maxRetries = 20
) {
  for (let i = 0; i < maxRetries; i++) {
    const token = await acquireLock(key, ttlMs);
    if (token) return token;

    await new Promise((r) => setTimeout(r, retryDelay + Math.random() * 50));
  }
  return null;
}
