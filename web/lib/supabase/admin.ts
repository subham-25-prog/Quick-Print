import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Dedicated server-side admin client using the service role key
export function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey || supabaseUrl.includes('placeholder') || supabaseUrl.includes('mock-shop')) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
