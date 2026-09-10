import { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
}

// Satu sumber kebenaran untuk menu navigasi tiap role.
// Sebelumnya tiap layout (staf/approval/admin/superadmin) punya daftar nav
// sendiri-sendiri (ada yang statis, ada yang role-aware) sehingga menu bisa
// "hilang" saat pindah antar route group. Sekarang semua layout memakai
// helper ini agar selalu konsisten.
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  staf: [
    { href: "/beranda", label: "Beranda" },
    { href: "/katalog", label: "Katalog" },
    { href: "/keranjang", label: "Keranjang" },
    { href: "/riwayat", label: "Riwayat" },
  ],
  // Atasan Departemen hanya meninjau & menyetujui, tidak mengajukan order
  // sendiri (harus diwakili staf) — sehingga menu "Keranjang" sengaja tidak
  // ditampilkan untuk role ini.
  atasan_departemen: [
    { href: "/approval", label: "Approval" },
    { href: "/beranda", label: "Beranda" },
    { href: "/katalog", label: "Katalog" },
    { href: "/riwayat", label: "Riwayat" },
  ],
  superadmin: [
    { href: "/approval", label: "Approval" },
    { href: "/laporan", label: "Laporan" },
    { href: "/users", label: "Kelola User" },
    { href: "/departemen", label: "Kelola Departemen" },
  ],
  admin_stationery: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/items", label: "Master Item" },
    { href: "/restock", label: "Restock" },
    { href: "/laporan", label: "Laporan" },
  ],
};

export function getNavForRole(role?: Role | null): NavItem[] {
  if (!role) return [];
  return NAV_BY_ROLE[role] ?? [];
}
