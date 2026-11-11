// Caller-controlled URLs are never allowed to target arbitrary hosts or paths.
export function isSignedStorageUrl(value: unknown, bucket: "receipts" | "statements"): value is string {
  if (typeof value !== "string") return false;
  try {
    const allowed = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const url = new URL(value);
    return allowed.protocol === "https:" && url.protocol === "https:" &&
      url.origin === allowed.origin && !url.username && !url.password &&
      url.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) &&
      url.searchParams.has("token") && url.searchParams.get("token") !== "";
  } catch {
    return false;
  }
}

export async function fetchSignedStorageFile(url: string, bucket: "receipts" | "statements", maxBytes: number): Promise<ArrayBuffer> {
  if (!isSignedStorageUrl(url, bucket)) throw new Error("Invalid signed storage URL");
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("Storage file unavailable");
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) { await response.body.cancel(); throw new Error("Storage file too large"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Storage file too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (size > maxBytes) await response.body.cancel();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}
