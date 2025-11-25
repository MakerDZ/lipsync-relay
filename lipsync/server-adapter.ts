// Function to upload files to ComfyUI server
export async function uploadFileToComfy(
  file: File,
  machine: string
): Promise<string> {
  const uploadUrl = `${process.env.COMFYUI_API_URL}/upload/image`;

  console.log(`Uploading file to ${uploadUrl}...`);

  const formData = new FormData();
  formData.append("image", file);
  formData.append("overwrite", "true");

  const response = await fetch(`${machine}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
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
