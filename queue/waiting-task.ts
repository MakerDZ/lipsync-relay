import type Redis from "ioredis";
import { withRedis } from "../lib/redis";

export interface WaitingTask {
  id: string;
  image_url: string;
  audio_url: string;
  prompt: string;
}

export interface WaitingTaskInput {
  id: string;
  image_url: string;
  audio_url: string;
  prompt: string;
}

async function readWaitingQueue(redis: Redis): Promise<WaitingTask[]> {
  const rawTasks = await redis.lrange("waiting_queue", 0, -1);
  const tasks: WaitingTask[] = [];

  for (const entry of rawTasks) {
    try {
      tasks.push(JSON.parse(entry));
    } catch (error) {
      console.warn("Skipping invalid waiting task entry:", error);
    }
  }

  return tasks;
}

// Add a waiting task to the queue
export async function addWaitingTaskToQueue(
  waitingTaskInput: WaitingTaskInput
): Promise<WaitingTask> {
  try {
    return await withRedis("addWaitingTaskToQueue", async (redis) => {
      const waitingTask: WaitingTask = {
        ...waitingTaskInput,
      };

      await redis.lpush("waiting_queue", JSON.stringify(waitingTask));
      return waitingTask;
    });
  } catch (error) {
    console.error("Error adding waiting task to queue:", error);
    throw error;
  }
}

// Get a waiting task by tracking ID
export async function getWaitingTaskByTrackingId(
  trackingId: string
): Promise<WaitingTask | null> {
  try {
    return await withRedis("getWaitingTaskByTrackingId", async (redis) => {
      const tasks = await readWaitingQueue(redis);
      return tasks.find((task) => task.id === trackingId) ?? null;
    });
  } catch (error) {
    console.error("Error getting waiting task by tracking ID:", error);
    throw error;
  }
}

// Get one of the waiting tasks from the queue
export async function getOneWaitingTaskFromQueue(): Promise<WaitingTask | null> {
  try {
    return await withRedis("getOneWaitingTaskFromQueue", async (redis) => {
      const waitingTask = await redis.lpop("waiting_queue");
      if (!waitingTask) {
        return null;
      }
      return JSON.parse(waitingTask) as WaitingTask;
    });
  } catch (error) {
    console.error("Error getting one waiting task from queue:", error);
    throw error;
  }
}

// Delete a specific waiting task from the queue by ID
export async function deleteWaitingTask(taskId: string): Promise<boolean> {
  try {
    return await withRedis("deleteWaitingTask", async (redis) => {
      const tasks = await readWaitingQueue(redis);

      const taskIndex = tasks.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        console.warn(`Waiting task with id ${taskId} not found`);
        return false;
      }

      tasks.splice(taskIndex, 1);

      await redis.del("waiting_queue");
      for (const task of tasks.reverse()) {
        await redis.lpush("waiting_queue", JSON.stringify(task));
      }

      return true;
    });
  } catch (error) {
    console.error("Error deleting waiting task:", error);
    throw error;
  }
}

// Get all waiting tasks from the queue
export async function getAllWaitingTasks(): Promise<WaitingTask[]> {
  try {
    return await withRedis("getAllWaitingTasks", async (redis) => {
      return await readWaitingQueue(redis);
    });
  } catch (error) {
    console.error("Error getting all waiting tasks:", error);
    throw error;
  }
}

// Clear all waiting tasks from the queue
export async function clearWaitingQueue(): Promise<void> {
  try {
    await withRedis("clearWaitingQueue", async (redis) => {
      await redis.del("waiting_queue");
    });
  } catch (error) {
    console.error("Error clearing waiting queue:", error);
    throw error;
  }
}
