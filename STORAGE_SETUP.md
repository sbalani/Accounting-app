# Storage Buckets Setup Guide

## Creating Storage Buckets

The Supabase CLI doesn't support creating storage buckets directly. You need to create them via Supabase Studio:

### Steps:

1. **Open Supabase Studio**
   - Go to: http://127.0.0.1:54323 (or your local Supabase Studio URL)

2. **Navigate to Storage**
   - Click **Storage** in the left sidebar
   - Click **New bucket** button

3. **Create Required Buckets:**

   **Bucket 1: `receipts`**
   - Name: `receipts`
   - Public bucket: **Unchecked** (Private bucket)
   - Click **Create bucket**

   **Bucket 2: `statements`**
   - Name: `statements`
   - Public bucket: **Unchecked** (Private bucket)
   - Click **Create bucket**

### Storage Bucket Policies

After creating the buckets, you'll need to set up storage policies to allow users to upload files. The buckets are private by default, so you need to add policies.

**Note**: For local development, Supabase Storage policies might be permissive by default. In production, you'll want to add specific RLS policies for storage.

### Testing Storage

Once buckets are created, you can test by:
1. Uploading a receipt image
2. Uploading a statement file
3. Recording voice input (which uploads audio files)

All files will be stored in the format: `{user_id}/{workspace_id}/{type}/{timestamp}.{extension}`
