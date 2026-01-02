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
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="mt-2 text-sm text-gray-600">
            View and manage your transactions
          </p>
        </div>
        
        {/* Primary action buttons - Mobile friendly */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <a
            href="/transactions/new"
            className="flex items-center justify-center px-4 py-3 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-base font-medium shadow-sm transition-colors active:bg-blue-800"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Manual Entry
          </a>
          <a
            href="/transactions/new/voice"
            className="flex items-center justify-center px-4 py-3 sm:py-3 border-2 border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Voice Input
          </a>
          <a
            href="/transactions/new/receipt"
            className="flex items-center justify-center px-4 py-3 sm:py-3 border-2 border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload Receipt
          </a>
        </div>

        {/* Import Statement - Delegated to dropdown/menu for mobile */}
        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
          <details className="relative sm:hidden">
            <summary className="px-4 py-2 text-sm font-medium text-gray-600 cursor-pointer list-none">
              <span className="flex items-center">
                More Options
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
              <a
                href="/transactions/new/import"
                className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Import Statement
              </a>
            </div>
          </details>
          <a
            href="/transactions/new/import"
            className="hidden sm:inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import Statement
          </a>
        </div>
      </div>

      <TransactionsList />
    </div>
  );
}
