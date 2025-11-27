import { generateVideoPrompt } from "./prompt";
import { addTaskToQueue } from "../queue/task";
import { getAudioDurationSeconds } from "../utils/audio";

// Function to generate lipsync video
export async function generateLipsyncVideo(
  machine: string,
  image: File,
  audio: File,
  prompt: string,
  existingTrackingId?: string
): Promise<Record<string, unknown>> {
  const audioDurationSeconds = await getAudioDurationSeconds(audio);

  // Upload image and audio to ComfyUI on the first available machine
  const [uploadedImageName, uploadedAudioName] = await Promise.all([
    uploadFileToComfy(image, machine),
    uploadFileToComfy(audio, machine),
  ]);

  // Generate tracking ID
  const trackingId = existingTrackingId ?? crypto.randomUUID();
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
  console.log(`\nSending workflow to ComfyUI on ${machine}...`);
  const res = await fetch(`${machine}/prompt`, {
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
  const nowIso = new Date().toISOString();

  await addTaskToQueue({
    prompt_id: data.prompt_id as string,
    tracking_id: trackingId,
    machine: machine,
    status: "pending",
    image_path: uploadedImageName,
    audio_path: uploadedAudioName,
    generated_video_path: "",
    prompt: prompt,
    audio_length_bytes: audio.size ?? null,
    audio_duration_seconds: audioDurationSeconds,
    created_at: nowIso,
    completed_at: null,
    time_to_complete_ms: null,
  });

  return {
    success: true,
    tracking_id: trackingId,
    comfyui_response: data,
  } as Record<string, unknown>;
}

// Function to upload files to ComfyUI server
export async function uploadFileToComfy(
  file: File,
  machine: string
): Promise<string> {
  const uploadUrl = `${machine}/upload/image`;
  console.log(`Uploading file to ${uploadUrl}...`);

  const formData = new FormData();
  formData.append("image", file, file.name);
  formData.append("overwrite", "true");
  formData.append("type", "input");

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  console.log(
    `\t- Upload response status: ${response.status} ${response.statusText}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`\t- Upload error body: ${errorBody}`);
    throw new Error(
      `Failed to upload file: ${response.status} ${
        response.statusText || "Unknown error"
      } - ${errorBody}`
    );
  }

  const result = (await response.json()) as {
    name: string;
    subfolder: string;
    type: string;
  };
  console.log(`\t- file uploaded successfully: ${result.name}`);

  return result.name;
}

// Function to download generated video from ComfyUI output
export function comfyViewUrlFromPath(
  localPath: string,
  machine: string
): string {
  const marker = "/output/";
  const idx = localPath.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Unexpected video_path: ${localPath}`);
  }

  const rel = localPath.slice(idx + marker.length);
  const lastSlash = rel.lastIndexOf("/");

  const subfolder = lastSlash === -1 ? "" : rel.slice(0, lastSlash);
  const filename = lastSlash === -1 ? rel : rel.slice(lastSlash + 1);

  const params = new URLSearchParams({
    filename,
    type: "output",
    subfolder,
  });

  return `${machine}/view?${params.toString()}`;
}
