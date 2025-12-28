"use client";

import { useState, useEffect } from "react";
import { SUPPORTED_CURRENCIES } from "@/lib/utils/currency";

interface Workspace {
  id: string;
  name: string;
  role: string;
  created_at: string;
  primary_currency?: string;
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
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingPrimaryCurrency, setEditingPrimaryCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set editing currency when workspace changes
    if (editingWorkspaceId) {
      const ws = workspaceList.find((w) => w.id === editingWorkspaceId);
      if (ws) {
        setEditingPrimaryCurrency(ws.primary_currency || "USD");
      }
    }
  }, [editingWorkspaceId, workspaceList]);

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

      const data = await response.json();
      setWorkspaceList(
        workspaceList.map((w) => (w.id === workspaceId ? { ...w, name, primary_currency: data.workspace.primary_currency } : w))
      );
      if (selectedWorkspace?.id === workspaceId) {
        setSelectedWorkspace({ ...selectedWorkspace, name, primary_currency: data.workspace.primary_currency });
      }
      setEditingWorkspaceId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrimaryCurrency = async (workspaceId: string) => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ primary_currency: editingPrimaryCurrency }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update primary currency");
      }

      const data = await response.json();
      setWorkspaceList(
        workspaceList.map((w) => (w.id === workspaceId ? { ...w, primary_currency: data.workspace.primary_currency } : w))
      );
      if (selectedWorkspace?.id === workspaceId) {
        setSelectedWorkspace({ ...selectedWorkspace, primary_currency: data.workspace.primary_currency });
      }
      setEditingWorkspaceId(null);
      window.location.reload(); // Reload to update all currency displays
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
              <div className="flex-1">
                <h3 className="font-medium">{workspace.name}</h3>
                <p className="text-sm text-gray-500">
                  Role: {workspace.role} • Created: {new Date(workspace.created_at).toLocaleDateString()}
                </p>
                {workspace.role === "owner" && (
                  <p className="text-sm text-gray-600 mt-1">
                    Primary Currency: <span className="font-medium">{workspace.primary_currency || "USD"}</span>
                  </p>
                )}
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
                    onClick={() => setEditingWorkspaceId(workspace.id)}
                    className="text-blue-600 hover:text-blue-500 text-sm"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
            {editingWorkspaceId === workspace.id && workspace.role === "owner" && (
              <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Currency
                  </label>
                  <select
                    value={editingPrimaryCurrency}
                    onChange={(e) => setEditingPrimaryCurrency(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    All amounts will be displayed in this currency. Transactions in other currencies will be converted automatically.
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setEditingWorkspaceId(null);
                      setEditingPrimaryCurrency("USD");
                    }}
                    className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdatePrimaryCurrency(workspace.id)}
                    disabled={loading}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Saving..." : "Save Currency"}
                  </button>
                </div>
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
