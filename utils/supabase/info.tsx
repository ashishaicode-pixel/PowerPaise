/* Supabase connection info — loaded from environment variables.
   Set VITE_SUPABASE_PROJECT_ID and VITE_SUPABASE_ANON_KEY in your .env file
   (see .env.example). Never hardcode secrets here. */

export const projectId    = import.meta.env.VITE_SUPABASE_PROJECT_ID  as string;
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY   as string;