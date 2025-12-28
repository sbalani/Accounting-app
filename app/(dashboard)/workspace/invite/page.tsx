"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function InvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInviteLink(null);

    if (!workspaceId) {
      setError("Workspace ID is required");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send invitation");
      }

      const data = await response.json();
      setSuccess("Invitation created successfully!");
      setInviteLink(data.inviteLink);
      setEmail("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/workspace" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Workspace Settings
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Invite Team Members</h1>
          <p className="mt-2 text-sm text-gray-600">
            Send an invitation to collaborate on this workspace
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
              {success}
              {inviteLink && (
                <div className="mt-2">
                  <p className="text-sm font-medium">Invitation Link:</p>
                  <div className="mt-1 flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink);
                        alert("Link copied to clipboard!");
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="user@example.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Invitation"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
