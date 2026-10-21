"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function AccountRecoveryForm({ mode }: { mode: "verify" | "reset" }) {
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = mode === "verify" ? "Verifikasi email kerja" : "Lupa password";

  useEffect(() => {
    const task = window.setTimeout(() => {
      const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
      const urlToken = params.get("token");
      if (fragmentToken || urlToken) {
        setToken(fragmentToken || urlToken || "");
        window.history.replaceState(null, "", window.location.pathname);
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [params]);

  async function submit(event: FormEvent) {
    if (mode === "verify") return;
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const action = token ? "reset" : "request-reset";
      const response = await fetch("/stationaryapps/api/account-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token, identifier, password }) });
      const result = await response.json();
      if (!response.ok) setError(result.error || "Permintaan gagal."); else setMessage(result.message || "Permintaan diproses.");
    } catch { setError("Tidak dapat memproses permintaan. Coba lagi nanti."); }
    finally { setBusy(false); }
  }

  if (mode === "verify") return <main className="min-h-[100dvh] bg-canvas flex items-center justify-center p-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
    <h1 className="text-2xl font-bold text-slate-900">Verifikasi email tidak diperlukan</h1>
    <p className="mt-3 text-sm text-slate-600">Akun dapat langsung digunakan setelah pendaftaran. Silakan masuk menggunakan NIK dan password.</p>
    <a href="/stationaryapps/login" className="mt-6 inline-block text-sm text-brand-700 hover:underline">Kembali ke halaman masuk</a>
  </section></main>;

  return <main className="min-h-[100dvh] bg-canvas flex items-center justify-center p-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
    <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
    <p className="mt-2 text-sm text-slate-600">{token ? "Tautan ini memiliki masa berlaku terbatas dan hanya dapat digunakan sekali." : "Masukkan NIK atau email kerja. Jika cocok dengan akun aktif, instruksi akan dikirim melalui email terdaftar."}</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      {!token && <label className="block text-sm font-medium text-slate-700">NIK atau email kerja<input autoComplete="username" required value={identifier} onChange={e => setIdentifier(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5" /></label>}
      {token && mode === "reset" && <label className="block text-sm font-medium text-slate-700">Password baru<span className="mt-1 block"><PasswordInput autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5" /></span><span className="mt-1 block text-xs text-slate-500">10–128 karakter</span></label>}
      {message && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-brand-700 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Memproses…" : token ? "Simpan password baru" : "Kirim instruksi"}</button>
    </form>
    <a href="/stationaryapps/login" className="mt-5 inline-block text-sm text-brand-700 hover:underline">Kembali ke halaman masuk</a>
  </section></main>;
}
