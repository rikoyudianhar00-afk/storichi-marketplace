import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function normalizeOtp(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export default function DeviceSecurityPanel() {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [deviceKey, setDeviceKey] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFactors() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) setMessage(error.message || "Status autentikator belum dapat dimuat.");
    else setFactors([...(data?.totp || [])].filter((factor) => factor.status === "verified"));
    setLoading(false);
  }

  useEffect(() => { void loadFactors(); }, []);

  async function startEnrollment() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Storichi Authenticator" });
    if (error || !data?.totp?.qr_code) setMessage(error?.message || "Autentikator belum dapat dibuat.");
    else {
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setChallenge(null);
      setOtp("");
    }
    setBusy(false);
  }

  async function startApproval() {
    const factor = factors[0];
    if (!factor) {
      setMessage("Aktifkan aplikasi autentikator terlebih dahulu.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (error || !data?.id) setMessage(error?.message || "Kode autentikator belum dapat diminta.");
    else {
      setEnrollment(null);
      setChallenge({ factorId: factor.id, challengeId: data.id, purpose: "device" });
      setOtp("");
    }
    setBusy(false);
  }

  async function createDeviceKey() {
    const { data, error } = await supabase.functions.invoke("mobile-device-link", { body: { action: "create" } });
    if (error || !data?.code) throw new Error(data?.error || error?.message || "Kunci perangkat belum dapat dibuat.");
    setDeviceKey(data);
    setChallenge(null);
    setOtp("");
    setMessage("Kunci perangkat siap digunakan pada aplikasi.");
  }

  async function verifyOtp() {
    if (otp.length !== 6 || !challenge) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.mfa.verify({
      factorId: challenge.factorId,
      challengeId: challenge.challengeId,
      code: otp,
    });
    if (error) {
      setMessage(error.message || "Kode autentikator salah atau sudah berganti.");
      setBusy(false);
      return;
    }
    try {
      if (enrollment) {
        setEnrollment(null);
        setChallenge(null);
        setOtp("");
        setMessage("Autentikator berhasil diaktifkan. Sekarang buat kunci perangkat.");
        await loadFactors();
      } else {
        await createDeviceKey();
      }
    } catch (error) {
      setMessage(error?.message || "Kunci perangkat belum dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function enrollAndChallenge() {
    await startEnrollment();
  }

  useEffect(() => {
    if (!enrollment?.factorId) return;
    void supabase.auth.mfa.challenge({ factorId: enrollment.factorId }).then(({ data, error }) => {
      if (error || !data?.id) setMessage(error?.message || "Konfirmasi autentikator belum dapat disiapkan.");
      else setChallenge({ factorId: enrollment.factorId, challengeId: data.id, purpose: "enroll" });
    });
  }, [enrollment?.factorId]);

  return (
    <section className="account-security-card" aria-labelledby="account-security-title">
      <div className="account-section-heading">
        <div><h3 id="account-security-title">Autentikator & perangkat</h3><p>Gunakan Google Authenticator, Authy, Microsoft Authenticator, atau aplikasi TOTP lain untuk mengamankan login aplikasi.</p></div>
        <span className="account-qris-status">{loading ? "Memuat" : factors.length ? "Aktif" : "Belum aktif"}</span>
      </div>

      {!loading && !factors.length && !enrollment && <button type="button" className="btn btn-primary" onClick={enrollAndChallenge} disabled={busy}>Aktifkan autentikator</button>}

      {enrollment && (
        <div className="authenticator-enrollment">
          <p>Pindai QR ini menggunakan aplikasi autentikator, lalu masukkan kode enam digitnya.</p>
          <img src={enrollment.qrCode} alt="QR code untuk Storichi Authenticator" />
          <details><summary>Tidak bisa memindai QR?</summary><code>{enrollment.secret}</code></details>
        </div>
      )}

      {!loading && factors.length > 0 && !challenge && !deviceKey && <button type="button" className="btn btn-primary" onClick={startApproval} disabled={busy}>Buat kunci perangkat</button>}

      {challenge && (
        <div className="authenticator-code-form">
          <label htmlFor="authenticator-code">Kode autentikator</label>
          <input id="authenticator-code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(normalizeOtp(event.target.value))} placeholder="000000" disabled={busy} />
          <button type="button" className="btn btn-primary" onClick={verifyOtp} disabled={busy || otp.length !== 6}>{busy ? "Memeriksa…" : enrollment ? "Aktifkan" : "Setujui & buat kunci"}</button>
        </div>
      )}

      {deviceKey && <div className="device-key-issued" role="status"><strong>{deviceKey.code.replace(/(.{4})(.{4})(.{4})/, "$1 $2 $3")}</strong><span>Masukkan kunci ini di aplikasi dalam lima menit. Kunci hanya dapat digunakan sekali.</span></div>}
      {message && <p className="account-recovery-message" role="status">{message}</p>}
    </section>
  );
}
