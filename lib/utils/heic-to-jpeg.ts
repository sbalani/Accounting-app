import heicConvert from "heic-convert";

export function isHeicFormat(mimeType: string, fileName?: string): boolean {
  const lowerMime = (mimeType || "").toLowerCase();
  const lowerRef = (fileName || "").toLowerCase();
  return (
    lowerMime.includes("heic") ||
    lowerMime.includes("heif") ||
    lowerRef.endsWith(".heic") ||
    lowerRef.endsWith(".heif")
  );
}

export async function heicBufferToJpeg(
  buffer: Buffer,
  quality = 0.9
): Promise<Buffer> {
  const converted = await heicConvert({
    buffer,
    format: "JPEG",
    quality,
  });
  return Buffer.from(converted as ArrayBuffer);
}
