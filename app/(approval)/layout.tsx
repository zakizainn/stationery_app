"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/ui/AppShell";

const NAV_BY_ROLE: Record<string, { href: string; label: string }[]> = {
  atasan_departemen: [
    { href: "/approval", label: "Approval" },
    { href: "/beranda", label: "Beranda" },
    { href: "/katalog", label: "Katalog" },
    { href: "/keranjang", label: "Keranjang" },
    { href: "/riwayat", label: "Riwayat" },
  ],
  superadmin: [
    { href: "/approval", label: "Approval" },
    { href: "/laporan", label: "Laporan" },
    { href: "/users", label: "Kelola User" },
    { href: "/departemen", label: "Kelola Departemen" },
  ],
};

export default function ApprovalLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const nav = (session && NAV_BY_ROLE[session.user.role]) || [{ href: "/approval", label: "Approval" }];

  return <AppShell nav={nav}>{children}</AppShell>;
}
