// This file will be generated from Supabase types
// Run: npx supabase gen types typescript --project-id <project-id> > lib/types/database.ts
// Or use the Supabase CLI: supabase gen types typescript --local > lib/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // Types will be generated here
    }
  }
}
