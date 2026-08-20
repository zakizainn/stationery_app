import { AppShell } from "@/components/ui/AppShell";

const nav = [{ href: "/approval", label: "Approval" }];

export default function ApprovalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav}>{children}</AppShell>;
}
