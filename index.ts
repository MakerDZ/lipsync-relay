import { Hono } from "hono";
import {
  comfyViewUrlFromPath,
  generateLipsyncVideo,
} from "./lipsync/server-adapter";
import { getAvailableMachines } from "./machine/machine";
import { initRedis } from "./lib/redis";
import {
  updateGeneratedVideoPath,
  updateTaskStatus,
  getTaskByTrackingId,
} from "./queue/task";
import {
  addWaitingTaskToQueue,
  deleteWaitingTask,
  getOneWaitingTaskFromQueue,
} from "./queue/waiting-task";
import { acquireLock, releaseLock } from "./lib/redis-lock";
import { deleteFileFromR2, uploadFileToR2 } from "./lib/r2";
import { getWaitingTaskByTrackingId } from "./queue/waiting-task";

// Initialize Redis connection
await initRedis();
const app = new Hono();
app.get("/", (c) => c.text("Hello Bun!"));

// POST endpoint for generating video
app.post("/generate", async (c) => {
  try {
    console.log("\n=== Received new generation request ===");

    const formData = await c.req.formData();
    const image = formData.get("image") as File;
    const audio = formData.get("audio") as File;
    const prompt = formData.get("prompt") as string;

    if (!image || !audio || !prompt) {
      return c.json(
        { error: "Missing required fields: image, audio, or prompt" },
        400
      );
    }

    console.log("Request details:");
    console.log(`\t- Image: ${image.name} (${image.type})`);
    console.log(`\t- Audio: ${audio.name} (${audio.type})`);
    console.log(`\t- Prompt: "${prompt}"`);

    // Get available machines
    const availableMachines = await getAvailableMachines();
    console.log("\n=== Available machines ===");
    console.log(`\t- Available machines: ${availableMachines.join(", ")}`);

    // If no available machines, return error
    if (availableMachines.length === 0) {
      // r2 setup for storing those files as temporary
      const trackingId = crypto.randomUUID();

      const [imageUrl, audioUrl] = await Promise.all([
        uploadFileToR2(image),
        uploadFileToR2(audio),
      ]);
      await addWaitingTaskToQueue({
        id: trackingId,
        image_url: imageUrl,
        audio_url: audioUrl,
        prompt: prompt,
      });
      return c.json(
        {
          tracking_id: trackingId,
          status: "waiting_for_free_machine",
        },
        200
      );
    }

    const trackingId = crypto.randomUUID();

    void generateLipsyncVideo(
      availableMachines[0]!,
      image,
      audio,
      prompt,
      trackingId
    ).catch((error) => {
      console.error("Background generation failed:", error);
    });

    return c.json({
      success: true,
      tracking_id: trackingId,
      status: "processing",
      message: "Generation started",
    });
  } catch (error: unknown) {
    console.error("Error processing generate request:", error);
    return c.json(
      {
        error: "Failed to process generate request",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Process waiting queue every 5 seconds
async function processWaitingQueue(): Promise<void> {
  const lockToken = await acquireLock("waiting_queue", 5000);

  if (!lockToken) {
    console.log("Another scheduler is already processing the waiting queue.");
    return;
  }

  try {
    const [waitingTask, machines] = await Promise.all([
      getOneWaitingTaskFromQueue(),
      getAvailableMachines(),
    ]);

    if (waitingTask && machines.length > 0) {
      const [imageFile, audioFile] = await Promise.all([
        fetch(waitingTask.image_url).then((res) => res.blob()),
        fetch(waitingTask.audio_url).then((res) => res.blob()),
      ]);

      await generateLipsyncVideo(
        machines[0]!,
        imageFile as unknown as File,
        audioFile as unknown as File,
        waitingTask.prompt,
        waitingTask.id
      );

      await deleteWaitingTask(waitingTask.id);
      await Promise.all([
        deleteFileFromR2(waitingTask.image_url),
        deleteFileFromR2(waitingTask.audio_url),
      ]);
    }
  } catch (error) {
    console.error("Error processing waiting queue:", error);
  } finally {
    await releaseLock("waiting_queue", lockToken);
  }
}

// POST endpoint for webhook receiving from ComfyUI
app.post("/webhook", async (c) => {
  const body = await c.req.text();
  const parsed = JSON.parse(body);

  console.log("Webhook received:", parsed);

  const trackingId = parsed.tracking_id;

  // Update the finished job in DB/Redis
  await updateTaskStatus(trackingId, "completed");
  await updateGeneratedVideoPath(trackingId, parsed.video_path);

  return c.json({ status: "ok" });
});

app.get("/download/:trackingId", async (c) => {
  const trackingId = c.req.param("trackingId");

  const task = await getTaskByTrackingId(trackingId);
  const videoPath = task?.generated_video_path;
  if (!videoPath) {
    return c.json({ error: "Unknown tracking_id or not finished yet" }, 404);
  }
  const comfyUrl = comfyViewUrlFromPath(videoPath, task?.machine!);
  console.log(`Proxying download for ${trackingId} from ${comfyUrl}`);

  const res = await fetch(comfyUrl);
  if (!res.ok) {
    console.error("Comfy download failed:", res.status, res.statusText);
    return c.json({ error: "Failed to fetch video from ComfyUI" }, 502);
  }

  // stream back to client
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "video/mp4",
      "Content-Disposition": `attachment; filename="${trackingId}.mp4"`,
    },
  });
});

app.get("/tracking/:trackingId", async (c) => {
  const trackingId = c.req.param("trackingId");
  const waitingTask = await getWaitingTaskByTrackingId(trackingId);
  const task = await getTaskByTrackingId(trackingId);
  if (!waitingTask && !task) {
    return c.json({ error: "Unknown tracking_id" }, 404);
  }
  return c.json({
    tracking_id: trackingId,
    status: waitingTask ? "still_waiting_for_free_machine" : task?.status,
  });
});

setInterval(() => {
  void processWaitingQueue();
}, 5000);

export default {
  port: parseInt(process.env.PORT ?? "3000"),
  fetch: app.fetch,
};
