import { withRedis } from "../lib/redis";
import { randomUUID } from "crypto";

const LOCK_PREFIX = "lock:";

export async function acquireLock(
  key: string,
  ttlMs: number = 5000
): Promise<string | null> {
  const token = randomUUID();
  const result = await withRedis("acquireLock", async (redis) => {
    return await redis.set(LOCK_PREFIX + key, token, "PX", ttlMs, "NX");
  });

  return result === "OK" ? token : null;
}

export async function releaseLock(key: string, token: string) {
  const lockKey = LOCK_PREFIX + key;

  await withRedis("releaseLock", async (redis) => {
    const currentToken = await redis.get(lockKey);
    if (currentToken === token) {
      await redis.del(lockKey);
    }
  });
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
