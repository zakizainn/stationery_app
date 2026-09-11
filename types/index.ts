// Tipe bersama — sinkron dengan enum di prisma/schema.prisma

export type Role =
  | "staf"
  | "atasan_departemen"
  | "superadmin"
  | "admin_stationery";

export type KategoriItem = "barang_umum" | "kertas" | "checksheet" | "catridge_toner_tinta";

export type TipeRequest = "rutin" | "order_baru";

export type StatusRequest =
  | "pending"
  | "approved"
  | "rejected"
  | "diproses"
  | "selesai";

// Halaman beranda tiap role setelah login — dipakai oleh middleware/redirect.
export const BERANDA_PER_ROLE: Record<Role, string> = {
  staf: "/beranda",
  atasan_departemen: "/approval",
  superadmin: "/approval",
  admin_stationery: "/dashboard",
};

export interface CartItem {
  itemId: number;
  nama: string;
  qty: number;
  satuan: string;
  // khusus kategori "kertas"
  penggunaan?: string;
  // khusus alur tukar
  itemLamaId?: number;
}
