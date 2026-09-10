"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/ui/AppShell";
import { getNavForRole } from "@/lib/nav";

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const nav = getNavForRole(session?.user.role);

  return <AppShell nav={nav}>{children}</AppShell>;
}
