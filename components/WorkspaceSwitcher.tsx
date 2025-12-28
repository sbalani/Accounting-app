"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Workspace {
  id: string;
  name: string;
  role: string;
}

export default function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const response = await fetch("/api/workspaces");
        if (response.ok) {
          const data = await response.json();
          setWorkspaces(data.workspaces || []);
          if (data.currentWorkspace) {
            setCurrentWorkspaceId(data.currentWorkspace.id);
          } else if (data.workspaces?.length > 0) {
            setCurrentWorkspaceId(data.workspaces[0].id);
          }
        }
      } catch (error) {
        console.error("Error fetching workspaces:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchWorkspaces();
  }, []);

  const handleWorkspaceChange = (workspaceId: string) => {
    // Store selected workspace in localStorage or cookie
    localStorage.setItem("currentWorkspaceId", workspaceId);
    setCurrentWorkspaceId(workspaceId);
    router.refresh();
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <div className="flex items-center space-x-2">
      <select
        value={currentWorkspaceId || ""}
        onChange={(e) => handleWorkspaceChange(e.target.value)}
        className="block px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <a
        href="/workspace"
        className="text-sm text-blue-600 hover:text-blue-500"
      >
        Manage
      </a>
    </div>
  );
}
