import type Redis from "ioredis";
import { withRedis } from "../lib/redis";

export interface Task {
  prompt_id: string;
  tracking_id: string;
  machine: string;
  status: "pending" | "running" | "completed" | "failed";
  image_path: string;
  audio_path: string;
  generated_video_path: string;
  prompt: string;
}

async function readTaskQueue(redis: Redis): Promise<Task[]> {
  const rawTasks = await redis.lrange("queue", 0, -1);
  const tasks: Task[] = [];

  for (const entry of rawTasks) {
    try {
      tasks.push(JSON.parse(entry));
    } catch (error) {
      console.warn("Skipping invalid task entry:", error);
    }
  }

  return tasks;
}

// Add a task to the queue
export async function addTaskToQueue(task: Task) {
  try {
    await withRedis("addTaskToQueue", async (redis) => {
      await redis.lpush("queue", JSON.stringify(task));
    });
  } catch (error) {
    console.error("Error adding task to queue:", error);
    throw error;
  }
}

// Update the status of a task
export async function updateTaskStatus(
  tracking_id: string,
  status: "pending" | "running" | "completed" | "failed"
): Promise<boolean> {
  try {
    return await withRedis("updateTaskStatus", async (redis) => {
      const tasks = await readTaskQueue(redis);
      const taskIndex = tasks.findIndex((t) => t.tracking_id === tracking_id);
      if (taskIndex === -1) {
        console.warn(`Task with tracking_id ${tracking_id} not found`);
        return false;
      }

      tasks[taskIndex]!.status = status;

      await redis.del("queue");
      for (const task of tasks.reverse()) {
        await redis.lpush("queue", JSON.stringify(task));
      }

      return true;
    });
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

// Update the generated_video_path of a task
export async function updateGeneratedVideoPath(
  tracking_id: string,
  generated_video_path: string
): Promise<boolean> {
  try {
    return await withRedis("updateGeneratedVideoPath", async (redis) => {
      const tasks = await readTaskQueue(redis);
      const taskIndex = tasks.findIndex((t) => t.tracking_id === tracking_id);
      if (taskIndex === -1) {
        console.warn(`Task with tracking_id ${tracking_id} not found`);
        return false;
      }

      tasks[taskIndex]!.generated_video_path = generated_video_path;

      await redis.del("queue");
      for (const task of tasks.reverse()) {
        await redis.lpush("queue", JSON.stringify(task));
      }

      return true;
    });
  } catch (error) {
    console.error("Error updating generated_video_path:", error);
    throw error;
  }
}

// Get a task by tracking ID
export async function getTaskByTrackingId(
  tracking_id: string
): Promise<Task | null> {
  try {
    return await withRedis("getTaskByTrackingId", async (redis) => {
      const tasks = await readTaskQueue(redis);
      return tasks.find((task) => task.tracking_id === tracking_id) ?? null;
    });
  } catch (error) {
    console.error("Error getting task by tracking_id:", error);
    throw error;
  }
}

// Get all tasks from the queue
export async function getAllTasks(): Promise<Task[]> {
  try {
    return await withRedis("getAllTasks", async (redis) => {
      return await readTaskQueue(redis);
    });
  } catch (error) {
    console.error("Error getting all tasks:", error);
    throw error;
  }
}
