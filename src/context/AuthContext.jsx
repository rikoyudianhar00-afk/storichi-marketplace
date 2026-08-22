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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: isNativeWrapper ? "storichi://auth/callback" : window.location.origin },
    });
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
