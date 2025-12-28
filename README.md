# Personal Finance App

A personal finance tracking application built with Next.js and Supabase.

## Features

- **Transaction Management**: Manually enter transactions or import from bank statements
- **Multiple Input Methods**: Manual entry, voice input, receipt scanning, CSV/PDF import
- **Payment Methods**: Track cash, bank accounts, and credit cards
- **Duplicate Detection**: Automatically detects duplicate transactions
- **Workspace Sharing**: Share workspaces with family members or partners
- **Balance Tracking**: Automatic balance calculation and reconciliation
- **Categories**: Organize transactions with default and custom categories

## Getting Started

### Quick Start (Local Development)

For local development, we use Supabase CLI to run Supabase locally. See [LOCAL_SETUP.md](./LOCAL_SETUP.md) for detailed instructions.

**Quick setup:**

1. **Prerequisites:**
   - Node.js 18+ and npm
   - Docker Desktop (for Supabase local services)
   - Supabase CLI: `npm install -g supabase`

2. **Start local Supabase:**
   ```bash
   supabase start
   ```
   Save the connection details from the output!

3. **Create storage buckets:**
   ```bash
   supabase storage create receipts --public=false
   supabase storage create statements --public=false
   ```

4. **Set up environment:**
   ```bash
   npm install
   cp .env.local.example .env.local
   # Edit .env.local with values from `supabase start` output
   ```

5. **Run the app:**
   ```bash
   npm run dev
   ```

6. **Open the app:** http://localhost:3000

### Production Setup

For production deployment:

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Run migrations:**
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   ```

3. **Create Storage buckets** in Supabase Dashboard:
   - `receipts` (private)
   - `statements` (private)

4. **Set environment variables** in your hosting platform:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   ```

See [LOCAL_SETUP.md](./LOCAL_SETUP.md) for detailed local development instructions.

### Database Setup

The application uses Supabase migrations. To apply them:

1. **Using Supabase CLI** (recommended):
   ```bash
   supabase init
   supabase link --project-ref your-project-ref
   supabase db push
   ```

2. **Manually via Supabase Dashboard**:
   - Go to SQL Editor in Supabase Dashboard
   - Run each migration file in `supabase/migrations/` in order:
     - `20240101000000_initial_schema.sql`
     - `20240101000001_rls_policies.sql`
     - `20240101000002_database_functions.sql`

### Storage Buckets

Create the following storage buckets in Supabase:

1. **receipts** (private bucket)
   - For storing receipt images
   - Row Level Security: Users can only access files in their workspace folders

2. **statements** (private bucket)
   - For storing bank statement files (CSV/PDF)
   - Row Level Security: Users can only access files in their workspace folders

## Tech Stack

- **Frontend**: Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **External APIs**: OpenAI (Whisper API for voice, GPT-4 Vision for OCR)

## Project Structure

```
app/
  ├── (auth)/              # Authentication pages
  ├── (dashboard)/         # Protected dashboard routes
  │   ├── accounts/        # Payment methods management
  │   ├── transactions/    # Transaction management
  │   └── workspace/       # Workspace settings
  ├── api/                 # API routes
  └── auth/                # Auth callbacks
components/                # React components
lib/
  ├── supabase/           # Supabase client configuration
  ├── utils/              # Utility functions
  └── types/              # TypeScript types
supabase/
  └── migrations/         # Database migrations
```

## Key Features Implementation

### Workspace System
- Each user gets a default workspace on signup
- Users can create additional workspaces
- Workspaces can be shared via email invitations
- All data is scoped to workspaces with Row Level Security

### Transaction Management
- Manual entry with categories
- Voice input using OpenAI Whisper
- Receipt scanning using OpenAI Vision API
- Bank statement import (CSV/PDF)

### Duplicate Detection
- Matches transactions based on amount, date, and payment method
- Shows potential duplicates before import
- Skips duplicates during bulk import

### Balance Tracking
- Automatic balance updates via database triggers
- Supports positive (cash/bank) and negative (credit card) balances
- Balance reconciliation function available

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Deployment

The app is configured for deployment on Vercel:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

Make sure to set all environment variables in your deployment platform.
