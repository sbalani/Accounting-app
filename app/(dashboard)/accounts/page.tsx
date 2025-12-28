import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentMethodsList from "@/components/PaymentMethodsList";

export default async function AccountsPage() {
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
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment Methods</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage your cash, bank accounts, and credit cards
            </p>
          </div>
          <a
            href="/accounts/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Add Payment Method
          </a>
        </div>

        <PaymentMethodsList />
      </div>
    </div>
  );
}
