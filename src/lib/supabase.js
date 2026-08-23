import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars belum diset. Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Wrapper Android tidak dapat mengandalkan PKCE verifier milik WebView setelah
// Google selesai pada Custom Tab. Client ini meminta token implisit agar
// callback `storichi://` membawa access_token serta refresh_token yang dapat
// diterapkan kembali oleh client utama di dalam WebView.
export const nativeOAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "implicit",
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
