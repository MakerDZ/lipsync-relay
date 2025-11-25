import { readFile } from "node:fs/promises";

const TEMPLATE_PATH = "./lipsync.json";

// - changing prompt template to match the video and audio
export async function generateVideoPrompt(
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
