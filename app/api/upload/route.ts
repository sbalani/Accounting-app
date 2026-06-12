import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";
import { heicBufferToJpeg, isHeicFormat } from "@/lib/utils/heic-to-jpeg";
import {
  resolveBucketAndPath,
  storagePathsFromUpload,
} from "@/lib/utils/storage-files";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const type = formData.get("type") as string; // 'receipt', 'statement', or 'audio'

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!type || !["receipt", "statement", "audio"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid file type. Must be 'receipt', 'statement', or 'audio'" },
      { status: 400 }
    );
  }

  const ts = Date.now();
  const fileExt = file.name.split(".").pop() || "bin";
  const fileName = `${user.id}/${workspaceId}/${type}/${ts}.${fileExt}`;
  const bucketName =
    type === "receipt"
      ? "receipts"
      : type === "statement"
        ? "statements"
        : "receipts";

  const arrayBuffer = await file.arrayBuffer();

  const { data, error } = await supabase.storage.from(bucketName).upload(fileName, arrayBuffer, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let previewPath: string | null = null;
  if (
    type === "receipt" &&
    bucketName === "receipts" &&
    isHeicFormat(file.type, file.name)
  ) {
    const previewFileName = `${user.id}/${workspaceId}/${type}/${ts}.preview.jpg`;
    try {
      const jpegBuffer = await heicBufferToJpeg(Buffer.from(arrayBuffer));
      const { error: previewError } = await supabase.storage
        .from(bucketName)
        .upload(previewFileName, jpegBuffer, {
          contentType: "image/jpeg",
          cacheControl: "86400",
          upsert: false,
        });
      if (!previewError) {
        previewPath = previewFileName;
      }
    } catch {
      // Original upload succeeded; preview is optional for UI only.
    }
  }

  const { data: signedUrlData } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(fileName, 3600);

  let previewSignedUrl: string | null = null;
  if (previewPath) {
    const { data: previewSigned } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(previewPath, 3600);
    previewSignedUrl = previewSigned?.signedUrl ?? null;
  }

  const filePath = `${bucketName}/${data.path}`;

  return NextResponse.json({
    filePath: data.path,
    filePathFull: filePath,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    signedUrl: signedUrlData?.signedUrl || null,
    previewSignedUrl,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filePath } = await request.json();

  if (!filePath || typeof filePath !== "string") {
    return NextResponse.json({ error: "filePath is required" }, { status: 400 });
  }

  const { bucket } = resolveBucketAndPath(filePath);
  const pathsToDelete = storagePathsFromUpload({ filePath });

  for (const storagePath of pathsToDelete) {
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase.storage.from(bucket).remove([storagePath]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
