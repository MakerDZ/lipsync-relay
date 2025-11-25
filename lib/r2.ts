import { S3Client } from "bun";

export const r2 = new S3Client({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_NAME,
  endpoint: process.env.ENDPOINT,
});

export async function uploadFileToR2(file: File) {
  await r2.write(file.name, file);
  return `https://files.viralfast.lol/${file.name}`;
}

export async function deleteFileFromR2(url: string) {
  await r2.delete(url);
}


