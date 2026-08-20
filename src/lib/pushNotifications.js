import { supabase } from "./supabase";

function base64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerChatServiceWorker() {
  if (!isPushSupported()) return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export async function enableChatPush(userId) {
  if (!userId) return { ok: false, message: "Silakan masuk terlebih dahulu." };
  if (!isPushSupported()) return { ok: false, message: "Browser ini belum mendukung notifikasi push." };
  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (!publicKey) return { ok: false, message: "VITE_WEB_PUSH_PUBLIC_KEY belum dikonfigurasi." };

  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return { ok: false, message: "Izin notifikasi belum diberikan oleh browser." };

  try {
    const registration = await registerChatServiceWorker();
    if (!registration) return { ok: false, message: "Service worker tidak dapat diaktifkan." };
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(publicKey) });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, message: "Subscription browser tidak lengkap. Hapus izin notifikasi lalu aktifkan kembali." };
    const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: json.endpoint,
    subscription: json,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" });
    if (error) return { ok: false, message: "Subscription gagal disimpan. Jalankan schema_v8.sql terlebih dahulu." };
    return { ok: true, message: "Notifikasi chat berhasil diaktifkan." };
  } catch (error) {
    return { ok: false, message: error?.message || "Notifikasi push gagal diaktifkan." };
  }
}
