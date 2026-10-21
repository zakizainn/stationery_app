"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/PasswordInput";

interface Departemen {
  id: number;
  nama: string;
  kode: string;
}

export default function RegisterForm() {
  const [departemen, setDepartemen] = useState<Departemen[]>([]);
  const [nik, setNik] = useState("");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState("staf");
  const [departemenId, setDepartemenId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/stationaryapps/api/account-auth", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Gagal memuat departemen.");
        if (active) {
          setDepartemen(result.data);
          if (result.data.length) setDepartemenId(String(result.data[0].id));
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Gagal memuat departemen.");
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/stationaryapps/api/account-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", nik, nama, email, password, departemenId, requestedRole }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) setError(result.error || "Pendaftaran gagal.");
      else setMessage(result.message || "Pendaftaran berhasil. Silakan periksa email kerja Anda.");
    } catch {
      setError("Tidak dapat memproses pendaftaran. Coba lagi nanti.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-canvas flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <h1 className="text-2xl font-bold text-slate-900">Daftar akun</h1>
        <p className="mt-2 text-sm text-slate-600">Daftar menggunakan data karyawan dan email kerja. Setelah berhasil, Anda dapat langsung masuk dengan NIK dan password.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">NIK
            <input required maxLength={50} autoComplete="username" value={nik} onChange={(event) => setNik(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Nama lengkap
            <input required maxLength={120} autoComplete="name" value={nama} onChange={(event) => setNama(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Email kerja
            <input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Departemen
            <select required value={departemenId} onChange={(event) => setDepartemenId(event.target.value)} disabled={!departemen.length} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 disabled:opacity-60">
              {departemen.map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.kode})</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Role yang diajukan
            <select required value={requestedRole} onChange={(event) => setRequestedRole(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5">
              <option value="staf">Staf</option>
              <option value="atasan_departemen">Atasan Staf (Atasan Departemen)</option>
              <option value="admin_stationery">Admin Stationery</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">Role selain staf baru aktif setelah disetujui Superadmin.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <span className="mt-1 block"><PasswordInput required minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5" /></span>
            <span className="mt-1 block text-xs text-slate-500">Minimal 10 karakter.</span>
          </label>
          {message && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <button type="submit" disabled={loading || !departemen.length} className="w-full rounded-md bg-brand-700 py-3 font-semibold text-white disabled:opacity-60">
            {loading ? "Memproses pendaftaran…" : "Daftar"}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">Sudah punya akun? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Masuk</Link></p>
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Permintaan role dan departemen akan diperiksa Superadmin. Role khusus tidak aktif sebelum disetujui.</p>
      </section>
    </main>
  );
}
