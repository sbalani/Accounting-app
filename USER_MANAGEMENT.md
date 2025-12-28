# User Management Guide

## How Users Are Managed

### 1. Supabase Auth (Built-in User Management)

**Users are automatically stored in `auth.users` table** when they sign up. This is managed by Supabase Auth and includes:
- Email
- Password (hashed)
- User ID (UUID)
- Created at timestamp
- Email confirmation status
- And other auth-related fields

**To view users:**
1. Open Supabase Studio: http://127.0.0.1:54323
2. Go to **Authentication** in the left sidebar
3. Click on **Users** to see all registered users

### 2. User Profiles Table (Additional User Information)

We've created a `profiles` table for storing additional user information that isn't part of the auth system:
- Full name
- Avatar URL
- Email (synced from auth.users)
- Created/updated timestamps

**When a user signs up:**
1. Supabase Auth creates the user in `auth.users` automatically
2. A database trigger automatically creates a profile in `public.profiles`
3. A database trigger automatically creates a default workspace
4. The user is added as owner of their workspace

### 3. Viewing Users

**In Supabase Studio:**
- **Authentication → Users**: View all users in the auth system
- **Table Editor → profiles**: View user profiles with additional information
- **Table Editor → workspace_members**: See which users belong to which workspaces

**Via SQL:**
```sql
-- View all users
SELECT id, email, created_at FROM auth.users;

-- View user profiles
SELECT * FROM public.profiles;

-- View users with their workspaces
SELECT 
  u.email,
  p.full_name,
  w.name as workspace_name,
  wm.role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.workspace_members wm ON wm.user_id = u.id
LEFT JOIN public.workspaces w ON w.id = wm.workspace_id;
```

### 4. User Information Flow

```
User Signs Up
    ↓
auth.users created (by Supabase Auth)
    ↓
Trigger: handle_new_user_profile() → Creates profile in public.profiles
    ↓
Trigger: handle_new_user() → Creates workspace + adds user as owner
```

### 5. Current Setup

- **Email Confirmations**: Disabled in local development (see `supabase/config.toml`)
  - Users can sign up and use the app immediately
  - No email confirmation required locally
  
- **Profiles**: Automatically created when user signs up
  - Full name defaults to email username (part before @)
  - Email is synced from auth.users
  - Can be updated by the user

- **Workspaces**: Each user gets a default "My Workspace" on signup

### 6. Adding More User Fields

To add more fields to user profiles, you can:
1. Add columns to the `profiles` table via a migration
2. Update the `handle_new_user_profile()` function if needed
3. Update the profile update form/API to allow users to edit new fields

Example migration:
```sql
ALTER TABLE public.profiles 
ADD COLUMN phone_number text,
ADD COLUMN timezone text DEFAULT 'UTC';
```

### 7. Accessing User Information in Code

```typescript
// Get current user
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// Get user profile
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single();

// Update profile
const { error } = await supabase
  .from('profiles')
  .update({ full_name: 'New Name' })
  .eq('id', user.id);
```
