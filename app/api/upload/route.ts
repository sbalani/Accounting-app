import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/utils/get-current-workspace";

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

  // Generate unique file path
  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/${workspaceId}/${type}/${Date.now()}.${fileExt}`;
  const bucketName = type === "receipt" ? "receipts" : type === "statement" ? "statements" : "receipts"; // Use receipts bucket for audio temporarily

  // Upload file to Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get signed URL for private buckets (valid for 1 hour)
  const {
    data: { signedUrl },
  } = await supabase.storage.from(bucketName).createSignedUrl(fileName, 3600);

  // Also return the file path for server-side access
  const filePath = `${bucketName}/${data.path}`;

  return NextResponse.json({
    filePath: data.path,
    filePathFull: filePath,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    signedUrl: signedUrl || null,
  });
}
