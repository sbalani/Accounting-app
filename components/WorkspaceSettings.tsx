"use client";

import { useState } from "react";

interface Workspace {
  id: string;
  name: string;
  role: string;
  created_at: string;
}

interface WorkspaceSettingsProps {
  workspaces: Workspace[];
}

export default function WorkspaceSettings({ workspaces }: WorkspaceSettingsProps) {
  const [workspaceList, setWorkspaceList] = useState(workspaces);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    workspaces[0] || null
  );
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newWorkspaceName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      const data = await response.json();
      setWorkspaceList([...workspaceList, data.workspace]);
      setNewWorkspaceName("");
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWorkspace = async (workspaceId: string, name: string) => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update workspace");
      }

      setWorkspaceList(
        workspaceList.map((w) => (w.id === workspaceId ? { ...w, name } : w))
      );
      if (selectedWorkspace?.id === workspaceId) {
        setSelectedWorkspace({ ...selectedWorkspace, name });
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Your Workspaces</h2>
        <div className="space-y-4">
          {workspaceList.map((workspace) => (
            <div
              key={workspace.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <h3 className="font-medium">{workspace.name}</h3>
                <p className="text-sm text-gray-500">
                  Role: {workspace.role} • Created: {new Date(workspace.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {workspace.role === "owner" && (
                  <a
                    href={`/workspace/invite?workspaceId=${workspace.id}`}
                    className="text-blue-600 hover:text-blue-500 text-sm"
                  >
                    Invite
                  </a>
                )}
                {workspace.role === "owner" && (
                  <button
                    onClick={() => handleUpdateWorkspace(workspace.id, workspace.name)}
                    className="text-blue-600 hover:text-blue-500 text-sm"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Create New Workspace</h2>
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700">
              Workspace Name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter workspace name"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
