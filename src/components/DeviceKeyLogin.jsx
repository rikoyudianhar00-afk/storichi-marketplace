import { useState } from "react";
import { useAuth } from "../context/AuthContext";

function normalizeCode(value) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12);
}

export default function DeviceKeyLogin() {
  const { signInWithDeviceKey } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (code.length !== 12) {
      setMessage("Masukkan 12 karakter kunci autentikasi dari website.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await signInWithDeviceKey(code);
    } catch (error) {
      setMessage(error?.message || "Kunci belum dapat digunakan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container empty-state device-key-login">
      <h2>Hubungkan aplikasi Storichi</h2>
      <p>Masuk ke Storichi di website, aktifkan autentikator, lalu buat kunci perangkat di menu Akun.</p>
      <form className="device-key-form" onSubmit={submit}>
        <label htmlFor="device-key">Kunci autentikasi</label>
        <input
          id="device-key"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          placeholder="ABCD EFGH JKLM"
          aria-describedby="device-key-help"
          disabled={loading}
        />
        <small id="device-key-help">Kunci hanya berlaku lima menit dan satu kali pakai.</small>
        {message && <p className="form-error" role="alert">{message}</p>}
        <button className="btn btn-primary btn-full" disabled={loading}>{loading ? "Menghubungkan…" : "Masuk dengan kunci"}</button>
      </form>
    </main>
  );
}
