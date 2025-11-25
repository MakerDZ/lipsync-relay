import { getRedis } from "../lib/redis";

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

// Add a task to the queue
export async function addTaskToQueue(task: Task) {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }
    await redis.lpush("queue", JSON.stringify(task));
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
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    // Get all tasks from the queue
    const queueLength = await redis.llen("queue");
    const tasks: Task[] = [];

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("queue", i);
      if (taskStr) {
        tasks.push(JSON.parse(taskStr));
      }
    }

    // Find and update the task
    const taskIndex = tasks.findIndex((t) => t.tracking_id === tracking_id);
    if (taskIndex === -1) {
      console.warn(`Task with tracking_id ${tracking_id} not found`);
      return false;
    }

    const task = tasks[taskIndex];
    if (!task) {
      console.warn(`Task with tracking_id ${tracking_id} not found`);
      return false;
    }

    // Update the task status
    task.status = status;

    // Rebuild the queue
    await redis.del("queue");
    for (const task of tasks.reverse()) {
      await redis.lpush("queue", JSON.stringify(task));
    }

    return true;
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
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    // Get all tasks from the queue
    const queueLength = await redis.llen("queue");
    const tasks: Task[] = [];

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("queue", i);
      if (taskStr) {
        tasks.push(JSON.parse(taskStr));
      }
    }

    // Find and update the task
    const taskIndex = tasks.findIndex((t) => t.tracking_id === tracking_id);
    if (taskIndex === -1) {
      console.warn(`Task with tracking_id ${tracking_id} not found`);
      return false;
    }

    const task = tasks[taskIndex];
    if (!task) {
      console.warn(`Task with tracking_id ${tracking_id} not found`);
      return false;
    }

    // Update the generated_video_path
    task.generated_video_path = generated_video_path;

    // Rebuild the queue
    await redis.del("queue");
    for (const task of tasks.reverse()) {
      await redis.lpush("queue", JSON.stringify(task));
    }

    return true;
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
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    const queueLength = await redis.llen("queue");

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("queue", i);
      if (taskStr) {
        const task = JSON.parse(taskStr) as Task;
        if (task.tracking_id === tracking_id) {
          return task;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting task by tracking_id:", error);
    throw error;
  }
}

// Get all tasks from the queue
export async function getAllTasks(): Promise<Task[]> {
  try {
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis connection not established");
    }

    const queueLength = await redis.llen("queue");
    const tasks: Task[] = [];

    for (let i = 0; i < queueLength; i++) {
      const taskStr = await redis.lindex("queue", i);
      if (taskStr) {
        tasks.push(JSON.parse(taskStr));
      }
    }

    return tasks;
  } catch (error) {
    console.error("Error getting all tasks:", error);
    throw error;
  }
}
