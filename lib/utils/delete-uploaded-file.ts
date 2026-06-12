import type { UploadFileData } from "@/lib/utils/storage-files";

export async function deleteUploadedFile(fileData: UploadFileData): Promise<void> {
  const filePath = fileData.filePathFull || fileData.filePath;
  if (!filePath) return;

  try {
    await fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
  } catch {
    // Best-effort cleanup; orphaned files are non-critical.
  }
}

export async function deleteUploadedFiles(
  fileDataList: UploadFileData[]
): Promise<void> {
  await Promise.all(fileDataList.map((fileData) => deleteUploadedFile(fileData)));
}
