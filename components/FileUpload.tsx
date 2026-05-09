"use client";

import { useState, useRef } from "react";

interface FileUploadProps {
  type: "receipt" | "statement";
  onUploadComplete: (fileData: any) => void;
  onUploadError?: (error: string) => void;
  accept?: string;
  multiple?: boolean;
}

export default function FileUpload({
  type,
  onUploadComplete,
  onUploadError,
  accept,
  multiple = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const uploadOne = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Upload failed");
    }

    return await response.json();
  };

  const handleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      for (let i = 0; i < files.length; i += 1) {
        setUploadProgress({ current: i + 1, total: files.length });
        const data = await uploadOne(files[i]);
        onUploadComplete(data);
      }
    } catch (error: any) {
      onUploadError?.(error.message || "Failed to upload file(s)");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const all = Array.from(e.dataTransfer.files);
      handleFiles(multiple ? all : [all[0]]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const all = Array.from(e.target.files);
      handleFiles(multiple ? all : [all[0]]);
      // allow selecting the same file(s) again later
      e.target.value = "";
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragActive
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        accept={accept}
        disabled={uploading}
        multiple={multiple}
      />
      {uploading ? (
        <div>
          <p className="text-sm text-gray-600">
            Uploading{uploadProgress ? ` (${uploadProgress.current}/${uploadProgress.total})` : ""}...
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-2">
            Drag and drop {multiple ? "file(s)" : "a file"} here, or click to select
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            {multiple ? "Select Files" : "Select File"}
          </button>
        </div>
      )}
    </div>
  );
}
