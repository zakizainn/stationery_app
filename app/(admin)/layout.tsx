import { AppShell } from "@/components/ui/AppShell";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Master Item" },
  { href: "/restock", label: "Restock" },
  { href: "/laporan", label: "Laporan" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav}>{children}</AppShell>;
}
