import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { heicBufferToJpeg, isHeicFormat } from "@/lib/utils/heic-to-jpeg";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const segments = path.split("/").filter(Boolean);
  const workspaceIdFromPath = segments[1];
  if (!workspaceIdFromPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceIdFromPath)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.storage.from("receipts").download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Not found" },
      { status: 404 }
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const mime = data.type || "application/octet-stream";

  if (isHeicFormat(mime, path)) {
    try {
      const jpeg = await heicBufferToJpeg(buf);
      return new NextResponse(new Uint8Array(jpeg), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Conversion failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
