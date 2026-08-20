import { AppShell } from "@/components/ui/AppShell";

const nav = [
  { href: "/approval", label: "Approval" },
  { href: "/laporan", label: "Laporan" },
  { href: "/users", label: "Kelola User" },
  { href: "/departemen", label: "Kelola Departemen" },
];

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav}>{children}</AppShell>;
}
