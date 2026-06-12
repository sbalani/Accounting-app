import Link from "next/link";

const settingsLinks = [
  {
    href: "/workspace",
    title: "Workspace",
    description: "Manage workspaces, currency, invites, and reset transaction data.",
  },
  {
    href: "/settings/categorization",
    title: "Categorization Rules",
    description: "Auto-categorize transactions by merchant, description, or AI context.",
  },
  {
    href: "/analytics/tags",
    title: "Tags",
    description: "Create and manage tags, view tag-based spending analytics.",
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-sm text-gray-600 mb-8">
          Configure your workspace, rules, and organization preferences.
        </p>

        <div className="space-y-4">
          {settingsLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block bg-white shadow rounded-lg p-6 hover:border-blue-300 border border-transparent transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
