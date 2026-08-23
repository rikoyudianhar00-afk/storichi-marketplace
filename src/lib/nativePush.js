import { supabase } from "./supabase";

/**
 * Mengirim permintaan push yang sudah tervalidasi oleh Edge Function.
 * Penerima, isi, dan URL ditentukan kembali di server agar klien tidak bisa
 * mengirim notifikasi sewenang-wenang kepada pengguna lain.
 */
export function dispatchNativePush(payload) {
  return supabase.functions
    .invoke("send-storichi-push", { body: payload })
    .then(({ error }) => {
      if (error) console.warn("Push Storichi belum terkirim.", error.message);
    })
    .catch(() => undefined);
}
