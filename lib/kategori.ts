// Satu sumber kebenaran untuk label tampilan kategori barang. Dipakai di
// Katalog, Keranjang, dan Master Item (admin) supaya konsisten -- sebelumnya
// tiap halaman menampilkan label dengan `kategori.replace("_", " ")` yang
// cuma mengganti underscore PERTAMA, jadi rusak untuk nilai seperti
// "catridge_toner_tinta" (jadi "catridge toner_tinta").
export const KATEGORI_LABEL: Record<string, string> = {
  barang_umum: "ATK",
  kertas: "Kertas & Lainnya",
  checksheet: "Checksheet",
  catridge_toner_tinta: "Catridge/Toner/Tinta",
};

export function getKategoriLabel(kategori: string): string {
  return KATEGORI_LABEL[kategori] ?? kategori.replace(/_/g, " ");
}
