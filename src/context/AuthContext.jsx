import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
const NATIVE_CALLBACK_STORAGE_KEY = "storichi.native-oauth-callback";

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
    let processingCallback = null;

    function notifyNative(type, detail = {}) {
      if (!window.ReactNativeWebView) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...detail }));
    }

    async function acceptNativeCallback(eventOrCallback) {
      const callbackUrl = typeof eventOrCallback === "string" ? eventOrCallback : eventOrCallback?.detail;
      if (typeof callbackUrl !== "string" || !callbackUrl.startsWith("storichi://auth/callback")) return;
      if (processingCallback === callbackUrl) return;
      processingCallback = callbackUrl;
      try {
        const url = new URL(callbackUrl);
        const query = url.searchParams;
        const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
        const code = query.get("code");
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        const result = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : accessToken && refreshToken
            ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            : { data: { session: null }, error: new Error("Callback OAuth tidak memuat kredensial sesi") };
        if (result.error || !result.data.session) throw result.error || new Error("Sesi OAuth tidak terbentuk");
        window.__storichiNativeAuthCallback = null;
        notifyNative("storichi-native-auth-complete");
      } catch (error) {
        notifyNative("storichi-native-auth-failed");
        console.warn("Native OAuth callback tidak dapat ditukar menjadi sesi", error?.message || "unknown");
      } finally {
        processingCallback = null;
      }
    }

    async function acceptNativeGoogleIdToken(event) {
      const idToken = event?.detail?.idToken;
      if (typeof idToken !== "string" || !idToken) return;
      try {
        const result = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
        const establishedSession = result.data.session || (await supabase.auth.getSession()).data.session;
        if (result.error || !establishedSession) throw result.error || new Error("Sesi Google native tidak terbentuk");
        setSession(establishedSession);
        await syncProfile(establishedSession.user);
        window.sessionStorage.setItem("storichi.native-google-session", "ready");
        notifyNative("storichi-native-auth-complete");
      } catch (error) {
        notifyNative("storichi-native-auth-failed", { reason: error?.message || "Sesi Google tidak dapat dibuat" });
        console.warn("Google Sign-In native tidak dapat membentuk sesi", error?.message || "unknown");
      }
    }

    const recoverPersistedCallback = () => {
      const callback = window.__storichiNativeAuthCallback
        || window.localStorage.getItem(NATIVE_CALLBACK_STORAGE_KEY)
        || window.sessionStorage.getItem(NATIVE_CALLBACK_STORAGE_KEY);
      void acceptNativeCallback(callback);
    };

    window.addEventListener("storichi:native-auth-callback", acceptNativeCallback);
    document.addEventListener("storichi:native-auth-callback", acceptNativeCallback);
    window.addEventListener("storichi:native-google-id-token", acceptNativeGoogleIdToken);
    document.addEventListener("storichi:native-google-id-token", acceptNativeGoogleIdToken);
    recoverPersistedCallback();
    return () => {
      window.removeEventListener("storichi:native-auth-callback", acceptNativeCallback);
      document.removeEventListener("storichi:native-auth-callback", acceptNativeCallback);
      window.removeEventListener("storichi:native-google-id-token", acceptNativeGoogleIdToken);
      document.removeEventListener("storichi:native-google-id-token", acceptNativeGoogleIdToken);
    };
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
    if (isNativeWrapper) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "storichi-native-google-sign-in" }));
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
      },
    });
    if (!error && data?.url) window.location.assign(data.url);
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
