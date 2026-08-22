import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function acceptNativeCallback(event) {
      const callbackUrl = event.detail;
      if (typeof callbackUrl !== "string" || !callbackUrl.startsWith("storichi://auth/callback")) return;
      try {
        const url = new URL(callbackUrl);
        const query = url.searchParams;
        const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
        const code = query.get("code");
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        if (code) await supabase.auth.exchangeCodeForSession(code);
        else if (accessToken && refreshToken) await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      } catch {
        // Callback tidak valid dibiarkan tanpa mengubah sesi aplikasi.
      }
    }
    window.addEventListener("storichi:native-auth-callback", acceptNativeCallback);
    return () => window.removeEventListener("storichi:native-auth-callback", acceptNativeCallback);
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    syncProfile(session.user);
  }, [session?.user?.id]);

  async function syncProfile(user) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) {
      setProfile(existing);
      return;
    }

    const { data: created } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Pengguna",
        avatar_url: user.user_metadata?.avatar_url || null,
        email: user.email,
      })
      .select()
      .single();

    setProfile(created);
  }

  async function refreshProfile() {
    if (!session?.user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (data) setProfile(data);
  }

  async function signInWithGoogle() {
    const isNativeWrapper = typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: isNativeWrapper ? "storichi://auth/callback" : window.location.origin,
        skipBrowserRedirect: isNativeWrapper,
      },
    });
    if (!error && isNativeWrapper && data?.url) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "storichi-google-auth-url", url: data.url }));
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
