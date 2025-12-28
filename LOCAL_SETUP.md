# Local Development Setup Guide

This guide will help you set up and test the Personal Finance App locally using Supabase CLI.

## Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
   - Supabase CLI uses Docker to run local services
   - Make sure Docker is running before starting Supabase
3. **Supabase CLI** - Install via npm:
   ```bash
   npm install -g supabase
   ```

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start Supabase Local Development

Supabase CLI provides a local development environment that mirrors your production setup.

```bash
# Start Supabase local services (PostgreSQL, Auth, Storage, etc.)
supabase start
```

This command will:
- Start Docker containers for all Supabase services
- Run all migrations in `supabase/migrations/`
- Generate local API keys
- Output connection details

**Important**: After running `supabase start`, you'll see output with local credentials. Save these values!

Example output:
```
API URL: http://localhost:54321
GraphQL URL: http://localhost:54321/graphql/v1
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Inbucket URL: http://localhost:54324
anon key: eyJhbGc...
service_role key: eyJhbGc...
```

## Step 3: Create Storage Buckets

After Supabase is running, you need to create the storage buckets for receipts and statements.

1. **Open Supabase Studio** (from the output above, usually http://localhost:54323)
2. Go to **Storage** in the left sidebar
3. Click **New bucket**
4. Create two buckets:
   - **Bucket name**: `receipts` (Private bucket)
   - **Bucket name**: `statements` (Private bucket)

**Note**: The storage buckets must be created via Supabase Studio UI. The CLI doesn't support creating buckets directly in this version.

## Step 4: Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local  # If you have an example file
# Or create it manually
```

Add the following variables (use the values from `supabase start` output):

```env
# Supabase Local URLs (from supabase start output)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_supabase_start
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_supabase_start

# OpenAI API Key (for OCR and voice features)
OPENAI_API_KEY=your_openai_api_key_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note**: For local development, you can use the anon key for both `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, or use the service_role key if needed.

## Step 5: Run Database Migrations

If you haven't already, the migrations should run automatically when you run `supabase start`. However, if you need to reset or rerun migrations:

```bash
# Reset the local database and rerun all migrations
supabase db reset

# Or manually apply a specific migration
supabase migration up
```

## Step 6: Start the Next.js Development Server

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

## Step 7: Create Your First Account

1. Navigate to http://localhost:3000
2. Click on **Sign up** (or go to http://localhost:3000/signup)
3. Create an account with your email and password
4. You should be automatically logged in and redirected to the dashboard
5. A default workspace will be created automatically (via database trigger)

## Testing Features

### 1. **Authentication**
- Sign up with a new account
- Log out and log back in
- Check Supabase Studio → Authentication → Users to see created users

### 2. **Workspace Management**
- Go to `/workspace` to see your default workspace
- Create a new workspace
- Test workspace invitations (use the local email testing server at http://localhost:54324)

### 3. **Payment Methods**
- Go to `/accounts`
- Create payment methods (Cash, Bank Account, Credit Card)
- Set initial balances

### 4. **Transactions**
- Go to `/transactions`
- Create manual transactions
- Test duplicate detection by creating similar transactions
- Test receipt upload (requires OpenAI API key)
- Test voice input (requires OpenAI API key)

### 5. **Storage**
- Upload receipts and statements
- Check Supabase Studio → Storage to see uploaded files

## Useful Commands

```bash
# Start Supabase services
supabase start

# Stop Supabase services
supabase stop

# View Supabase logs
supabase logs

# Reset database (reruns all migrations)
supabase db reset

# Generate TypeScript types from your database
supabase gen types typescript --local > lib/types/database.ts

# Open Supabase Studio in browser
supabase studio

# View email testing server (Inbucket)
# Opens automatically at http://localhost:54324 when Supabase is running
```

## Troubleshooting

### Docker Issues
- Make sure Docker Desktop is running
- Check Docker has enough resources allocated (Settings → Resources)
- Try restarting Docker Desktop

### Port Conflicts
If ports 54321-54329 are already in use:
- Stop other services using those ports, or
- Modify `supabase/config.toml` to use different ports

### Database Connection Errors
- Make sure `supabase start` completed successfully
- Verify your `.env.local` has the correct URLs and keys from `supabase start` output
- Try `supabase db reset` to reset the database

### Migration Errors
- Check the migration files in `supabase/migrations/`
- Look at Supabase logs: `supabase logs`
- Try resetting: `supabase db reset`

### Storage Bucket Errors
- Make sure you've created the `receipts` and `statements` buckets
- Check bucket permissions in Supabase Studio → Storage

## Accessing Local Services

When Supabase is running locally, you have access to:

- **Next.js App**: http://localhost:3000
- **Supabase Studio**: http://localhost:54323 (Database management UI)
- **Inbucket (Email Testing)**: http://localhost:54324 (View test emails)
- **API**: http://localhost:54321 (Supabase API endpoint)

## Next Steps

Once everything is working locally:

1. Test all features thoroughly
2. Generate TypeScript types: `supabase gen types typescript --local > lib/types/database.ts`
3. When ready for production, link to your remote Supabase project:
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push  # Push migrations to production
   ```

## Additional Notes

- **Email Confirmations**: In local development, email confirmations are disabled by default (see `supabase/config.toml`). Users can sign up and sign in immediately.
- **Storage Policies**: You may need to set up storage policies for file access. Check Supabase Studio → Storage → Policies.
- **OpenAI Features**: Receipt OCR and voice input require a valid OpenAI API key. Without it, those features will show errors.
