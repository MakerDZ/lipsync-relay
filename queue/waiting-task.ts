import { getRedis } from "../lib/redis";
import { randomUUID } from "crypto";

export interface WaitingTask {
  id: string;
  image_url: string;
  audio_url: string;
  prompt: string;
}

export interface WaitingTaskInput {
  image_url: string;
  audio_url: string;
  prompt: string;
}

// Add a waiting task to the queue
export async function addWaitingTaskToQueue(
  waitingTaskInput: WaitingTaskInput
): Promise<WaitingTask> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    // Generate a unique ID for the task
    const waitingTask: WaitingTask = {
      id: randomUUID(),
      ...waitingTaskInput,
    };

    await redis.lpush("waiting_queue", JSON.stringify(waitingTask));
    return waitingTask;
  } catch (error) {
    console.error("Error adding waiting task to queue:", error);
    throw error;
  }
}

// Get one of the waiting tasks from the queue
export async function getOneWaitingTaskFromQueue(): Promise<WaitingTask | null> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }
    const waitingTask = await redis.lpop("waiting_queue");
    if (!waitingTask) {
      return null;
    }
    return JSON.parse(waitingTask) as WaitingTask;
  } catch (error) {
    console.error("Error getting one waiting task from queue:", error);
    throw error;
  }
}

// Delete a specific waiting task from the queue by ID
export async function deleteWaitingTask(taskId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    // Get all waiting tasks from the queue
    const queueLength = await redis.llen("waiting_queue");
    const tasks: WaitingTask[] = [];

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("waiting_queue", i);
      if (taskStr) {
        tasks.push(JSON.parse(taskStr));
      }
    }

    // Find the task to delete by ID
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      console.warn(`Waiting task with id ${taskId} not found`);
      return false;
    }

    // Remove the task from the array
    tasks.splice(taskIndex, 1);

    // Rebuild the queue
    await redis.del("waiting_queue");
    for (const task of tasks.reverse()) {
      await redis.lpush("waiting_queue", JSON.stringify(task));
    }

    return true;
  } catch (error) {
    console.error("Error deleting waiting task:", error);
    throw error;
  }
}

// Get all waiting tasks from the queue
export async function getAllWaitingTasks(): Promise<WaitingTask[]> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    const queueLength = await redis.llen("waiting_queue");
    const tasks: WaitingTask[] = [];

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("waiting_queue", i);
      if (taskStr) {
        tasks.push(JSON.parse(taskStr));
      }
    }

    return tasks;
  } catch (error) {
    console.error("Error getting all waiting tasks:", error);
    throw error;
  }
}

// Clear all waiting tasks from the queue
export async function clearWaitingQueue(): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    await redis.del("waiting_queue");
  } catch (error) {
    console.error("Error clearing waiting queue:", error);
    throw error;
  }
}
