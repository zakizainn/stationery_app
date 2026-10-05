import type { Metadata } from "next";
import "@fontsource-variable/inter";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stationery PT JAI",
  description: "Aplikasi manajemen stationery internal PT Jatim Autocomp Indonesia",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
