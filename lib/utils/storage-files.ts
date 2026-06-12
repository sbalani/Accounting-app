export type UploadFileData = {
  filePath?: string;
  filePathFull?: string;
};

export function resolveBucketAndPath(filePath: string): { bucket: string; path: string } {
  if (filePath.startsWith("receipts/")) {
    return { bucket: "receipts", path: filePath.slice("receipts/".length) };
  }
  if (filePath.startsWith("statements/")) {
    return { bucket: "statements", path: filePath.slice("statements/".length) };
  }
  return { bucket: "receipts", path: filePath };
}

export function previewPathForStoragePath(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot <= 0) return null;
  return `${path.slice(0, dot)}.preview.jpg`;
}

export function storagePathsFromUpload(fileData: UploadFileData): string[] {
  const raw = fileData.filePathFull || fileData.filePath;
  if (!raw) return [];

  const { path } = resolveBucketAndPath(raw);
  const paths = [path];
  const preview = previewPathForStoragePath(path);
  if (preview) {
    paths.push(preview);
  }
  return paths;
}
