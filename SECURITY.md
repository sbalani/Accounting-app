# API Key Security

## Current Implementation

The OpenAI API key is stored as an environment variable **without** the `NEXT_PUBLIC_` prefix:

```env
OPENAI_API_KEY=sk-...
```

This is **secure** because:

1. **Server-Side Only**: Environment variables without the `NEXT_PUBLIC_` prefix are only accessible in:
   - Next.js API Routes (`/app/api/*`)
   - Server Components
   - Server Actions
   - They are **never** exposed to the browser/client-side code

2. **Current Usage**: The API key is only accessed in server-side API routes:
   - `app/api/openai/transcribe/route.ts`
   - `app/api/openai/ocr/route.ts`
   - `app/api/transactions/import/route.ts`

3. **Deployment**: When deployed to Vercel:
   - You set environment variables in the Vercel dashboard
   - These are injected at build/runtime on the server
   - They are **never** bundled into the client JavaScript bundle
   - They are **never** accessible from the browser

## Security Best Practices

### ✅ Current Approach (Recommended for this use case)

**Next.js API Routes with Server-Side Env Vars**

**Pros:**
- Simple deployment (all code in one repo)
- Easy to debug and test locally
- No additional infrastructure
- Environment variables are secure when not prefixed with `NEXT_PUBLIC_`
- Works seamlessly with Vercel's environment variable management

**Cons:**
- API key is stored in Vercel environment variables (but this is standard practice)
- If your Vercel account is compromised, the API key could be accessed

**When to use:**
- ✅ For most applications (including this one)
- ✅ When you want simple deployment and maintenance
- ✅ When all your backend logic is in Next.js

### Alternative: Supabase Edge Functions

**Pros:**
- Centralizes all backend secrets in Supabase
- Can use Supabase Secrets for API keys (encrypted storage)
- Separates concerns (frontend vs backend)
- Edge Functions run closer to users (lower latency)

**Cons:**
- Additional deployment step (need to deploy Edge Functions separately)
- More complex local development setup
- Need to maintain two codebases (Next.js + Edge Functions)
- Edge Functions have cold start latency
- More moving parts = more potential failure points

**When to use:**
- When you want to centralize all backend logic in Supabase
- When you're already heavily invested in Supabase infrastructure
- When you need edge deployment for global performance

### Alternative: Separate Backend API

**Pros:**
- Complete separation of frontend and backend
- Can use more robust secret management (AWS Secrets Manager, etc.)
- Backend can be scaled independently

**Cons:**
- Significant additional complexity
- Need to deploy and maintain separate infrastructure
- More expensive (additional hosting costs)
- Overkill for this use case

**When to use:**
- Large-scale applications with dedicated backend teams
- When you need specific backend infrastructure (microservices, etc.)
- Enterprise applications with strict security requirements

## How to Verify Security

To verify the API key is not exposed:

1. **Build your Next.js app:**
   ```bash
   npm run build
   ```

2. **Check the generated JavaScript bundles:**
   ```bash
   grep -r "OPENAI_API_KEY" .next/static/
   ```
   You should find **no matches** (the key is not in the client bundle).

3. **Check in browser DevTools:**
   - Open your app in the browser
   - Open DevTools → Sources
   - Search for "OPENAI_API_KEY"
   - You should find **no matches**

4. **Check Network tab:**
   - The API key should only be used in server-side API calls
   - You should never see the key in client-side network requests

## Environment Variable Prefixes

### `NEXT_PUBLIC_*` (Client-Side)
- ⚠️ **Exposed to browser** - Bundle in JavaScript
- ✅ Safe for: Public keys, public URLs, non-sensitive config
- ❌ **Never use for**: API keys, secrets, private keys

Examples:
- `NEXT_PUBLIC_SUPABASE_URL` ✅ (public URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅ (safe to expose - protected by RLS)
- `NEXT_PUBLIC_APP_URL` ✅ (public URL)

### No Prefix (Server-Side Only)
- ✅ **Never exposed to browser** - Only accessible server-side
- ✅ Safe for: API keys, secrets, database credentials

Examples:
- `OPENAI_API_KEY` ✅ (server-side only)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (server-side only)
- `DATABASE_URL` ✅ (server-side only)

## Recommendation

**For this application, the current approach is the best choice:**

1. ✅ Secure (API key never exposed to client)
2. ✅ Simple (single codebase, easy deployment)
3. ✅ Standard practice (most Next.js apps use this pattern)
4. ✅ Well-documented and supported by Vercel

**You should only consider moving to Supabase Edge Functions if:**
- You want to centralize all backend logic in Supabase
- You're already using Edge Functions for other features
- You need the edge deployment benefits

**The security concerns are the same regardless:**
- Whether in Vercel env vars or Supabase secrets, the key is stored in the cloud
- Both platforms have security measures (encryption at rest, access controls)
- The key is never exposed to the client in either approach
