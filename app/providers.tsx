"use client";

import { SessionProvider } from "next-auth/react";
import { IconContext } from "@phosphor-icons/react";

// Semua ikon memakai satu keluarga (Phosphor) dan satu weight, diatur di sini
// supaya tidak ada yang mencampur gaya garis tebal/tipis antar halaman.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <IconContext.Provider value={{ weight: "regular" }}>{children}</IconContext.Provider>
    </SessionProvider>
  );
}
