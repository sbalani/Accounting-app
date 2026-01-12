import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionsList from "@/components/TransactionsList";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
              <p className="mt-2 text-sm text-gray-600">
                View and manage your transactions
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 mb-6">
            <a
              href="/transactions/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              Add Transaction (Manual)
            </a>
            <a
              href="/transactions/new/voice"
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Voice Input
            </a>
            <a
              href="/transactions/new/receipt"
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Upload Receipt
            </a>
            <a
              href="/transactions/new/import"
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Import Statement
            </a>
          </div>
        </div>

        <TransactionsList />
      </div>
    </div>
  );
}
