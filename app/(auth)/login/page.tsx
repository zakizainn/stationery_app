"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { STATUS_TONE } from "@/lib/status";

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

  const showDemoLogin = process.env.NODE_ENV !== "production";

  const demoAccounts = [
    { label: "Staf (QA)", nik: "22071", pass: "password123" },
    { label: "Atasan (QA)", nik: "11769", pass: "password123" },
    { label: "Admin Stationery", nik: "90002", pass: "password123" },
    { label: "Superadmin", nik: "90001", pass: "password123" },
  ];

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-2 bg-canvas font-sans">
      {/* Panel merek (desktop saja) */}
      <aside className="hidden lg:flex flex-col justify-center gap-6 bg-slate-900 border-l-4 border-brand-600 px-14 xl:px-20 text-white">
        <div className="w-64 xl:w-72 bg-white rounded-md p-4">
          <Image
            src="/logo-yazaki.jpg"
            alt="Yazaki PT Jatim Autocomp Indonesia"
            width={1167}
            height={305}
            sizes="(min-width: 1280px) 256px, 224px"
            className="w-full h-auto"
            priority
          />
        </div>
        <div>
          <h1 className="text-3xl xl:text-4xl font-bold tracking-tight leading-tight">PT Jatim Autocomp Indonesia</h1>
          <p className="mt-3 text-base text-slate-300 max-w-md">Sistem Pengajuan Alat Tulis Kantor (ATK)</p>
        </div>
      </aside>

      {/* Panel form */}
      <main className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 shadow-xs animate-fade-in">
          {/* Kepala merek untuk layar kecil (panel merek disembunyikan) */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-block w-44 bg-white border border-slate-200 rounded-md p-3 mb-3">
              <Image
                src="/logo-yazaki.jpg"
                alt="Yazaki PT Jatim Autocomp Indonesia"
                width={1167}
                height={305}
                sizes="144px"
                className="w-full h-auto"
              />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">PT Jatim Autocomp Indonesia</h1>
            <p className="text-sm text-slate-600 mt-1">Sistem Pengajuan Alat Tulis Kantor (ATK)</p>
          </div>

          <h2 className="hidden lg:block text-2xl font-bold text-slate-900 tracking-tight mb-6">Masuk</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="nik">
                NIK (Nomor Induk Karyawan)
              </label>
              <input
                id="nik"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                placeholder="Contoh: 22071"
                className="w-full bg-white border border-slate-400 rounded-md px-4 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="password">
                Password Internal
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-400 rounded-md px-4 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 transition-colors"
                required
              />
            </div>

            {error && (
              <div role="alert" className={`p-3 rounded-md border text-sm font-medium flex items-center gap-2 ${STATUS_TONE.bahaya}`}>
                <WarningCircle size={16} className="shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white rounded-md py-3 text-sm font-bold shadow-xs transition-all disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <CircleNotch size={16} className="animate-spin" aria-hidden="true" />
                  Memproses Login...
                </span>
              ) : (
                "Masuk ke Sistem"
              )}
            </button>
          </form>

          {showDemoLogin && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-600 text-center mb-3">
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
                    className="p-2.5 rounded-md border border-slate-200 hover:border-brand-600 text-left transition-colors bg-slate-50 hover:bg-white group cursor-pointer"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-brand-700">
                      {acc.label}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      NIK: <span className="font-mono">{acc.nik}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-slate-900 text-white">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

