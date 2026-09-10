import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { BERANDA_PER_ROLE, Role } from "@/types";

// Path (tanpa route-group) yang boleh diakses tiap role.
// Lihat dokumen spesifikasi teknis, bagian 3 (Role & Hak Akses).
const ROUTE_ACCESS: Record<string, Role[]> = {
  "/beranda": ["staf", "atasan_departemen"],
  "/katalog": ["staf", "atasan_departemen"],
  // Hanya staf yang boleh mengajukan order. Atasan Departemen tidak bisa
  // memesan/order barang sendiri — harus diwakili oleh staf departemennya.
  "/keranjang": ["staf"],
  "/riwayat": ["staf", "atasan_departemen"],
  "/approval": ["atasan_departemen", "superadmin"],
  "/dashboard": ["admin_stationery"],
  "/items": ["admin_stationery"],
  "/restock": ["admin_stationery"],
  "/laporan": ["admin_stationery", "superadmin"],
  "/users": ["superadmin"],
  "/departemen": ["superadmin"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as Role;
  const matchedPrefix = Object.keys(ROUTE_ACCESS).find((p) => pathname.startsWith(p));

  if (matchedPrefix && !ROUTE_ACCESS[matchedPrefix].includes(role)) {
    return NextResponse.redirect(new URL(BERANDA_PER_ROLE[role], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/beranda/:path*",
    "/katalog/:path*",
    "/keranjang/:path*",
    "/riwayat/:path*",
    "/approval/:path*",
    "/dashboard/:path*",
    "/items/:path*",
    "/restock/:path*",
    "/laporan/:path*",
    "/users/:path*",
    "/departemen/:path*",
  ],
};
