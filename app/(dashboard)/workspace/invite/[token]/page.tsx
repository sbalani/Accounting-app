"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const response = await fetch(`/api/workspaces/invite/${token}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Invalid invitation");
        }
        const data = await response.json();
        setInvitation(data.invitation);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchInvitation();
    }
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?redirect=/workspace/invite/${token}`);
        return;
      }

      const response = await fetch(`/api/workspaces/invite/${token}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to accept invitation");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Invalid Invitation</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <a
              href="/dashboard"
              className="text-blue-600 hover:text-blue-500"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Invitation Accepted!</h2>
            <p className="text-gray-600 mb-4">
              You&apos;ve been added to the workspace &quot;{invitation?.workspaces?.name}&quot;.
            </p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Workspace Invitation</h2>
          <p className="text-gray-600 mb-6">
            You&apos;ve been invited to join <strong>{invitation?.workspaces?.name}</strong>
          </p>

          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {accepting ? "Accepting..." : "Accept Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
