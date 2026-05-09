import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DuplicateFinderClient from "@/components/DuplicateFinderClient";

export default async function TransactionDuplicatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-5xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <Link
          href="/transactions"
          className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block"
        >
          ← Back to transactions
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Find duplicate transactions</h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Review groups of entries that look like the same transaction (including opposite signs).
          Remove extras or open a row to change amount, date, account, or other fields.
        </p>
        <div className="mt-8">
          <DuplicateFinderClient />
        </div>
      </div>
    </div>
  );
}
