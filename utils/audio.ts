import { parseBuffer } from "music-metadata";

export async function getAudioDurationSeconds(
  audio: File
): Promise<number | null> {
  try {
    const arrayBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const metadata = await parseBuffer(buffer, {
      mimeType: audio.type || undefined,
      size: typeof audio.size === "number" ? audio.size : undefined,
    });
    const duration = metadata.format.duration;
    if (
      typeof duration === "number" &&
      Number.isFinite(duration) &&
      duration > 0
    ) {
      return duration;
    }
  } catch (error) {
    console.warn("Failed to parse audio duration:", error);
  }
  return null;
}
