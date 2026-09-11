"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";

const ROLE_LABEL: Record<string, string> = {
  staf: "Staf Departemen",
  atasan_departemen: "Atasan Departemen",
  superadmin: "Superadmin",
  admin_stationery: "Admin Stationery",
};

const ROLE_BADGE: Record<string, string> = {
  staf: "bg-emerald-50 text-emerald-700 border-emerald-200",
  atasan_departemen: "bg-blue-50 text-blue-700 border-blue-200",
  superadmin: "bg-purple-50 text-purple-700 border-purple-200",
  admin_stationery: "bg-amber-50 text-amber-800 border-amber-200",
};

export function AppShell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav: { href: string; label: string }[];
}) {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-emerald-700/20">
                JAI
              </div>
              <div>
                <span className="font-extrabold text-slate-900 tracking-tight text-base leading-none block">
                  Stationery
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700">
                  PT Jatim Autocomp Indonesia
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
              {nav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? "bg-white text-emerald-700 shadow-xs border border-slate-200/50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {session && <NotificationBell />}

            {session && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-full py-1 px-3">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {session.user.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    NIK: {session.user.nik} · {session.user.departemenNama}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    ROLE_BADGE[session.user.role] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  {ROLE_LABEL[session.user.role] || session.user.role}
                </span>
              </div>
            )}

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-3 py-1.5 rounded-lg transition-all"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <nav className="flex md:hidden overflow-x-auto px-4 py-2 bg-slate-100/60 border-t border-slate-200/60 gap-1 scrollbar-none">
          {nav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full animate-fade-in">
        {children}
      </main>
    </div>
  );
}

