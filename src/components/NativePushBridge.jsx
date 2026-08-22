import { useEffect } from "react";
import { supabase } from "../lib/supabase";

function isExpoPushToken(value) {
  return typeof value === "string" && /^ExponentPushToken\[[^\]]+\]$/.test(value);
}

export default function NativePushBridge({ user }) {
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return undefined;

    const notifyNativeSession = () => {
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: "storichi-user-context", userId: user.id }));
    };

    const registerNativeToken = async (event) => {
      const token = event?.detail?.token;
      const platform = event?.detail?.platform === "ios" ? "ios" : "android";
      if (!isExpoPushToken(token)) return;

      const { error } = await supabase.from("mobile_push_tokens").upsert({
        user_id: user.id,
        expo_push_token: token,
        platform,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,expo_push_token" });

      if (error) console.warn("Token push mobile tidak dapat disimpan.", error.message);
    };

    notifyNativeSession();
    document.addEventListener("storichi:native-push-token", registerNativeToken);
    return () => document.removeEventListener("storichi:native-push-token", registerNativeToken);
  }, [user?.id]);

  return null;
}
