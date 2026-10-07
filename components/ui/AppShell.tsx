"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowsClockwise,
  Buildings,
  CaretLeft,
  CaretRight,
  ChartBar,
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  House,
  List,
  Package,
  SignOut,
  SquaresFour,
  ShoppingCart,
  Users,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
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

// Ikon per halaman dari satu keluarga (Phosphor), disesuaikan dengan href yang
// dikirim lib/nav.ts. Kalau href tidak ada di daftar, fallback ke ikon dokumen.
const NAV_ICON: Record<string, Icon> = {
  "/beranda": House,
  "/katalog": SquaresFour,
  "/keranjang": ShoppingCart,
  "/riwayat": ClockCounterClockwise,
  "/approval": CheckCircle,
  "/dashboard": ChartBar,
  "/items": Package,
  "/restock": ArrowsClockwise,
  "/laporan": FileText,
  "/users": Users,
  "/departemen": Buildings,
};

function NavIcon({ href }: { href: string }) {
  const Ikon = NAV_ICON[href] ?? FileText;
  return <Ikon size={18} className="shrink-0" aria-hidden="true" />;
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
            <div className="relative w-9 h-9 shrink-0 overflow-hidden rounded-md bg-white border border-slate-200">
              <Image src="/logo-yazaki.jpg" alt="Yazaki" fill sizes="36px" className="object-contain p-1" />
            </div>
          ) : (
            <>
              <div className="relative w-full h-11">
                <Image src="/logo-yazaki.jpg" alt="Yazaki" fill sizes="256px" className="object-contain object-left" />
              </div>
              <div className="text-xs font-bold text-slate-600 tracking-tight mt-2">
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
                aria-current={isActive ? "page" : undefined}
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
                    <div className="text-xs text-slate-500 font-medium truncate">
                      NIK {session.user.nik} · {session.user.departemenNama}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md border ${
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
                  <SignOut size={16} aria-hidden="true" />
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
  const activeNavItem = nav.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const currentPageLabel = activeNavItem?.label || "Stationery";
  const currentRoleLabel = session?.user?.role
    ? ROLE_LABEL[session.user.role] || session.user.role
    : "Sistem Pengajuan ATK";

  return (
    <div className="min-h-[100dvh] bg-canvas font-sans">
      {/* Sidebar -- desktop. State awal (collapsed=false) sama di server & client,
          jadi tidak ada hydration mismatch; kalau ada preferensi tersimpan di
          localStorage, lebarnya berubah halus lewat transition setelah mount. */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200 z-30 transition-[width] duration-200 print:hidden ${desktopWidthClass}`}
      >
        <SidebarContent collapsedView={collapsed} />

        {/* Tombol toggle mengambang di tepi border, tidak lagi berbagi baris
            dengan judul -- supaya nama sistem & logo tidak kepotong. */}
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex absolute -right-3 top-6 z-40 items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-brand-700 hover:border-brand-300 shadow-xs transition-colors"
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          title={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          {collapsed ? <CaretRight size={14} aria-hidden="true" /> : <CaretLeft size={14} aria-hidden="true" />}
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
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3 print:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-slate-700"
          aria-label="Buka menu"
        >
          <List size={24} aria-hidden="true" />
        </button>
        <div className="relative w-8 h-8 overflow-hidden rounded-md bg-white border border-slate-200">
          <Image src="/logo-yazaki.jpg" alt="Yazaki" fill sizes="32px" className="object-contain p-0.5" />
        </div>
        {session && <NotificationBell />}
      </header>

      <div className={`flex flex-col min-h-[100dvh] transition-[padding] duration-200 ${contentPadClass} print:pl-0`}>
        {/* Top bar -- desktop: konteks halaman di kiri, notifikasi di kanan */}
        <div className="hidden md:flex items-center justify-between gap-4 px-6 lg:px-8 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold text-slate-500">{currentRoleLabel}</span>
            <CaretRight size={14} className="shrink-0 text-slate-300" aria-hidden="true" />
            <span className="truncate text-sm font-bold text-slate-800">{currentPageLabel}</span>
          </div>
          {session && <NotificationBell />}
        </div>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 text-center text-xs text-slate-500 print:hidden">
          PT Jatim Autocomp Indonesia - Sistem Pengajuan Alat Tulis Kantor (ATK)
        </footer>
      </div>
    </div>
  );
}
