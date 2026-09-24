"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";

const ROLE_LABEL: Record<string, string> = {
  staf: "Staf Departemen",
  atasan_departemen: "Atasan Departemen",
  superadmin: "Superadmin",
  admin_stationery: "Admin Stationery",
};

const ROLE_BADGE: Record<string, string> = {
  staf: "bg-brand-50 text-brand-700 border-brand-200",
  atasan_departemen: "bg-slate-100 text-slate-700 border-slate-300",
  superadmin: "bg-slate-900 text-white border-slate-900",
  admin_stationery: "bg-amber-50 text-amber-800 border-amber-200",
};

const SIDEBAR_COLLAPSE_KEY = "sidebar_collapsed";

// Ikon sederhana per halaman, supaya sidebar tidak cuma berupa teks --
// disesuaikan dengan href yang dikirim lib/nav.ts. Kalau href tidak ada
// di daftar, fallback ke ikon dokumen generik.
const NAV_ICON: Record<string, React.ReactNode> = {
  "/beranda": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5" />
  ),
  "/katalog": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 14h7v7H4v-7zm9 0h7v7h-7v-7z" />
  ),
  "/keranjang": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
  ),
  "/riwayat": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  "/approval": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  "/dashboard": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 13h4v8H3v-8zm7-9h4v17h-4V4zm7 5h4v12h-4V9z" />
  ),
  "/items": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
  ),
  "/restock": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M4 4v5h.582m15.836 5A9 9 0 006.582 9M20 20v-5h-.581m0 0A9 9 0 015.42 15" />
  ),
  "/laporan": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 3.75H6.75A2.25 2.25 0 004.5 6v13.5A2.25 2.25 0 006.75 21.75h10.5A2.25 2.25 0 0019.5 19.5V6a2.25 2.25 0 00-2.25-2.25H15M9 3.75V6h6V3.75M9 3.75a1.5 1.5 0 013 0M9 12.75h6M9 16.5h6" />
  ),
  "/users": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 19.5v-1.5a4.5 4.5 0 00-9 0v1.5M4.5 19.5v-1.5a3 3 0 013-3h.5M19.5 19.5v-1.5a3 3 0 00-3-3h-.5M10.5 10.5a3 3 0 106 0 3 3 0 00-6 0z" />
  ),
  "/departemen": (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 21h18M6 21V7l6-4 6 4v14M9 10h1m3 0h1M9 14h1m3 0h1M10 21v-4h4v4" />
  ),
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {NAV_ICON[href] || (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12h6m-6 4h6M9 8h6M5 3.75h14a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5V5.25A1.5 1.5 0 015 3.75z" />
      )}
    </svg>
  );
}

export function AppShell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav: { href: string; label: string }[];
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Default-nya selalu "terbuka" (false) saat render pertama supaya HTML dari
  // server dan client sama persis (hindari hydration mismatch). Preferensi
  // yang tersimpan baru dibaca di useEffect, yaitu setelah hydration selesai
  // -- jadi cuma ada kedipan singkat ke posisi tersimpan, bukan error.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // localStorage tidak tersedia (mode privat dsb) -- biarkan default terbuka
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // abaikan kalau localStorage tidak bisa diakses
      }
      return next;
    });
  };

  function SidebarContent({ collapsedView }: { collapsedView: boolean }) {
    return (
      <>
        <div className={`border-b border-slate-200 ${collapsedView ? "px-2 py-5 flex justify-center" : "px-4 py-4"}`}>
          {collapsedView ? (
            <div className="relative w-9 h-9 shrink-0 overflow-hidden rounded bg-white border border-slate-200">
              <Image src="/logo-yazaki.jpg" alt="Yazaki" fill className="object-contain p-1" />
            </div>
          ) : (
            <>
              <div className="relative w-full h-11">
                <Image src="/logo-yazaki.jpg" alt="Yazaki" fill className="object-contain object-left" />
              </div>
              <div className="text-[11px] font-bold text-slate-600 tracking-tight mt-2">
                Sistem Pengajuan ATK
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsedView ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-semibold border-l-[3px] transition-colors ${
                  collapsedView ? "justify-center px-0" : ""
                } ${
                  isActive
                    ? "bg-brand-50 text-brand-700 border-brand-600"
                    : "text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <NavIcon href={item.href} />
                {!collapsedView && item.label}
              </Link>
            );
          })}
        </nav>

        {session && (
          <div className={`border-t border-slate-200 ${collapsedView ? "px-2 py-4" : "px-4 py-4"}`}>
            {!collapsedView ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{session.user.name}</div>
                    <div className="text-[10px] text-slate-500 font-medium truncate">
                      NIK {session.user.nik} · {session.user.departemenNama}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                    ROLE_BADGE[session.user.role] || "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {ROLE_LABEL[session.user.role] || session.user.role}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="mt-3 w-full text-xs font-semibold text-slate-600 hover:text-brand-700 bg-white hover:bg-brand-50 border border-slate-200 hover:border-brand-200 px-3 py-2 rounded-md transition-colors"
                >
                  Keluar
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  title={`${session.user.name} · ${ROLE_LABEL[session.user.role] || session.user.role}`}
                  className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0"
                >
                  {session.user.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  title="Keluar"
                  className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 border border-slate-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m9 0l-3-3m3 3l-3 3" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  const desktopWidthClass = collapsed ? "md:w-[68px]" : "md:w-60";
  const contentPadClass = collapsed ? "md:pl-[68px]" : "md:pl-60";

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Sidebar -- desktop. State awal (collapsed=false) sama di server & client,
          jadi tidak ada hydration mismatch; kalau ada preferensi tersimpan di
          localStorage, lebarnya berubah halus lewat transition setelah mount. */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200 z-30 transition-[width] duration-200 ${desktopWidthClass}`}
      >
        <SidebarContent collapsedView={collapsed} />

        {/* Tombol toggle mengambang di tepi border, tidak lagi berbagi baris
            dengan judul -- supaya nama sistem & logo tidak kepotong. */}
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex absolute -right-3 top-6 z-40 items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-brand-700 hover:border-brand-300 shadow-sm transition-colors"
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d={collapsed ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
            />
          </svg>
        </button>
      </aside>

      {/* Sidebar -- mobile (slide-in), selalu versi terbuka penuh */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full animate-fade-in">
            <SidebarContent collapsedView={false} />
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Top bar -- mobile only */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-slate-700"
          aria-label="Buka menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
        <div className="relative w-8 h-8 overflow-hidden rounded bg-white border border-slate-200">
          <Image src="/logo-yazaki.jpg" alt="Yazaki" fill className="object-contain p-0.5" />
        </div>
        {session && <NotificationBell />}
      </header>

      <div className={`flex flex-col min-h-screen transition-[padding] duration-200 ${contentPadClass}`}>
        {/* Top bar -- desktop: cuma notifikasi, identitas sudah di sidebar */}
        <div className="hidden md:flex items-center justify-end gap-3 px-6 py-2.5 bg-white border-b border-slate-200 sticky top-0 z-20">
          {session && <NotificationBell />}
        </div>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 text-center text-[11px] text-slate-500">
          PT Jatim Autocomp Indonesia — Sistem Pengajuan Alat Tulis Kantor (ATK)
        </footer>
      </div>
    </div>
  );
}
