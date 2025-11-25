import { readFile } from "node:fs/promises";
import { Hono } from "hono";

const PROMPT_ENDPOINT = `${process.env.COMFYUI_API_URL}/prompt`;
const TEMPLATE_PATH = "./lipysnc.json";

// - endpoint for getting videos, audio and prompt

// - uploading videos, audio to gpu server

// - changing prompt template to match the video and audio
async function generateVideoPrompt(
  newAudioFilename: string,
  newImageFilename: string,
  newPositivePrompt: string,
  trackingId: string,
  webhookUrl: string
) {
  console.log(`Loading workflow template from ${TEMPLATE_PATH}...`);

  let promptTemplate;
  try {
    const templateContent = await readFile(TEMPLATE_PATH, "utf8");
    promptTemplate = JSON.parse(templateContent);
  } catch (e: unknown) {
    console.error(
      `Error loading or parsing JSON template: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    throw new Error(
      "Could not load workflow template. Make sure 'lipysnc.json' is in the correct path."
    );
  }

  console.log("Mapping new inputs to the workflow...");

  // 1. Update LoadAudio (Node 125)
  if (promptTemplate["125"]) {
    promptTemplate["125"].inputs.audio = newAudioFilename;
    console.log(`\t- Node 125 (LoadAudio) updated to: ${newAudioFilename}`);
  }

  // 2. Update LoadImage (Node 284)
  if (promptTemplate["284"]) {
    promptTemplate["284"].inputs.image = newImageFilename;
    console.log(`\t- Node 284 (LoadImage) updated to: ${newImageFilename}`);
  }

  // 3. Update TextEncode (Node 241)
  if (promptTemplate["241"]) {
    promptTemplate["241"].inputs.positive_prompt = newPositivePrompt;
    console.log(`\t- Node 241 (TextEncode) updated to: "${newPositivePrompt}"`);
  }

  // 4. Update Post Request Node (Node 307)
  if (promptTemplate["307"]) {
    // A) inject webhook URL
    promptTemplate["307"].inputs.target_url = webhookUrl;

    // B) inject tracking ID
    promptTemplate["307"].inputs.str1 = trackingId;

    // C) update the request body
    promptTemplate["307"].inputs.request_body = `{
  "video_path": "__str0__",
  "status": "completed",
  "tracking_id": "__str1__"
}`;

    console.log(
      `\t- Node 307 (Webhook) updated with URL: ${webhookUrl} & tracking: ${trackingId}`
    );
  }

  return promptTemplate;
}

// - hitting prompts endpoint for start generating

const app = new Hono();

// Function to upload files to ComfyUI server
async function uploadFileToComfy(
  file: File,
  type: "image" | "audio"
): Promise<string> {
  const uploadUrl = `${process.env.COMFYUI_API_URL}/upload/image`;

  console.log(`Uploading ${type} to ${uploadUrl}...`);

  const formData = new FormData();
  formData.append("image", file);
  formData.append("overwrite", "true");

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${type}: ${response.statusText}`);
  }

  const result = (await response.json()) as {
    name: string;
    subfolder: string;
    type: string;
  };
  console.log(`\t- ${type} uploaded successfully: ${result.name}`);

  return result.name;
}

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

    // Upload image and audio to ComfyUI
    const [uploadedImageName, uploadedAudioName] = await Promise.all([
      uploadFileToComfy(image, "image"),
      uploadFileToComfy(audio, "audio"),
    ]);

    // Generate tracking ID
    const trackingId = crypto.randomUUID();
    console.log(`\t- Tracking ID: ${trackingId}`);

    // Generate video prompt
    const webhookUrl = "http://localhost:3000/webhook";
    const promptTemplate = await generateVideoPrompt(
      uploadedAudioName,
      uploadedImageName,
      prompt,
      trackingId,
      webhookUrl
    );

    // Hit ComfyUI prompt endpoint
    console.log("\nSending workflow to ComfyUI...");
    const res = await fetch(PROMPT_ENDPOINT, {
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

app.get("/", (c) => c.text("Hello Bun!"));

app.post("/webhook", async (c) => {
  const body = await c.req.text();
  console.log("\n=== Webhook received ===");
  console.log(body);

  return c.json({ message: "Webhook received" });
});

export default {
  port: 3000,
  fetch: app.fetch,
};
