import { AppShell } from "@/components/ui/AppShell";

const nav = [
  { href: "/beranda", label: "Beranda" },
  { href: "/katalog", label: "Katalog" },
  { href: "/keranjang", label: "Keranjang" },
  { href: "/riwayat", label: "Riwayat" },
];

export default function StafLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav}>{children}</AppShell>;
}
