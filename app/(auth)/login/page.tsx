"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e?: React.FormEvent, customNik?: string, customPassword?: string) {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);

    const targetNik = customNik ?? nik;
    const targetPassword = customPassword ?? password;

    const res = await signIn("credentials", {
      nik: targetNik,
      password: targetPassword,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("NIK atau password tidak valid.");
      return;
    }

    router.push(searchParams.get("callbackUrl") ?? "/");
    router.refresh();
  }

  const demoAccounts = [
    { label: "Staf (QA)", nik: "22071", pass: "password123", badge: "bg-emerald-100 text-emerald-800" },
    { label: "Atasan (QA)", nik: "11769", pass: "password123", badge: "bg-blue-100 text-blue-800" },
    { label: "Admin Stationery", nik: "90002", pass: "password123", badge: "bg-amber-100 text-amber-900" },
    { label: "Superadmin", nik: "90001", pass: "password123", badge: "bg-purple-100 text-purple-900" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-4 font-sans relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-extrabold text-2xl shadow-lg shadow-emerald-600/30 mb-3">
            JAI
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PT Jatim Autocomp Indonesia</h1>
          <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase mt-1">Sistem Manajemen Stationery (ATK)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="nik">
              NIK (Nomor Induk Karyawan)
            </label>
            <input
              id="nik"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              placeholder="Contoh: 22071"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="password">
              Password Internal
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 fill-rose-500" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white rounded-xl py-3 text-sm font-bold shadow-lg shadow-emerald-700/25 transition-all disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Memproses Login...
              </span>
            ) : (
              "Masuk ke Sistem"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center mb-3">
            Quick Demo Login (Uji Coba 1-Klik)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.nik}
                type="button"
                onClick={() => {
                  setNik(acc.nik);
                  setPassword(acc.pass);
                  handleSubmit(undefined, acc.nik, acc.pass);
                }}
                className={`p-2.5 rounded-xl border border-slate-200/80 hover:border-emerald-500 text-left transition-all bg-slate-50/50 hover:bg-emerald-50/30 group cursor-pointer`}
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                  {acc.label}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  NIK: <span className="font-mono">{acc.nik}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

