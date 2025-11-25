import { Hono } from "hono";
import {
  uploadFileToComfy,
  comfyViewUrlFromPath,
} from "./lipsync/server-adapter";
import { generateVideoPrompt } from "./lipsync/prompt";
import { getAvailableMachines } from "./machine/machine";
import { initRedis } from "./lib/redis";
import {
  addTaskToQueue,
  updateGeneratedVideoPath,
  updateTaskStatus,
  getTaskByTrackingId,
} from "./queue/task";

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

    // If no available machines, return error
    if (availableMachines.length === 0) {
      return c.json({ error: "No available machines" }, 503);
    }

    // Upload image and audio to ComfyUI on the first available machine
    const [uploadedImageName, uploadedAudioName] = await Promise.all([
      uploadFileToComfy(image, availableMachines[0]!),
      uploadFileToComfy(audio, availableMachines[0]!),
    ]);

    // Generate tracking ID
    const trackingId = crypto.randomUUID();
    console.log(`\t- Tracking ID: ${trackingId}`);

    // Generate video prompt
    const promptTemplate = await generateVideoPrompt(
      uploadedAudioName,
      uploadedImageName,
      prompt,
      trackingId,
      `${process.env.WEBHOOK_URL}`
    );

    // Hit ComfyUI prompt endpoint
    console.log(`\nSending workflow to ComfyUI on ${availableMachines[0]}...`);
    const res = await fetch(`${availableMachines[0]}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptTemplate,
        client_id: trackingId,
      }),
    });

    if (!res.ok) {
      throw new Error(`ComfyUI API error: ${res.statusText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Console log without sensitive data
    console.log("\n=== ComfyUI Response ===");
    console.log(
      JSON.stringify(
        {
          ...data,
          tracking_id: trackingId,
          status: "queued",
        },
        null,
        2
      )
    );

    // Add task to queue
    await addTaskToQueue({
      prompt_id: data.prompt_id as string,
      tracking_id: trackingId,
      machine: availableMachines[0]!,
      status: "pending",
      image_path: uploadedImageName,
      audio_path: uploadedAudioName,
      generated_video_path: "",
      prompt: prompt,
    });

    // Return response
    return c.json({
      success: true,
      tracking_id: trackingId,
      comfyui_response: data,
    });
  } catch (error: unknown) {
    console.error("Error processing request:", error);
    return c.json(
      {
        error: "Failed to process request",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// POST endpoint for webhook receiving from ComfyUI
app.post("/webhook", async (c) => {
  const body = await c.req.text();
  console.log("\n=== Webhook received ===");
  console.log(body);

  // Update task status to completed
  await updateTaskStatus(JSON.parse(body).tracking_id, "completed");
  await updateGeneratedVideoPath(
    JSON.parse(body).tracking_id,
    JSON.parse(body).video_path as string
  );

  return c.json({ message: "Webhook received" });
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

export default {
  port: 3000,
  fetch: app.fetch,
};
