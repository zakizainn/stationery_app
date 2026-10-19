// Perhitungan nilai (Rupiah) sebuah movement untuk Laporan & Excel.
// Dipakai BERSAMA oleh /api/laporan dan /api/laporan/export supaya angkanya tidak
// bisa berbeda antara tampilan aplikasi dan file Excel.
//
// FIFO: nilai barang keluar = jumlah (qty x harga) dari lapisan yang dipakai, dan
// sudah dibekukan saat transaksi (movement.nilai + rincian LapisanPemakaian).
// Movement lama (sebelum FIFO, nilai = null) tetap dihitung cara lama.

export interface BagianHarga {
  harga: number;
  qty: number;
}

export interface NilaiMovement {
  /** Nilai total movement dalam Rupiah. */
  nominal: number;
  /** Harga rata-rata tertimbang (dibulatkan), untuk tampilan satu angka. */
  hargaRata: number;
  /** Pembagian jumlah per harga. Satu elemen untuk masuk / movement lama. */
  bagian: BagianHarga[];
}

export interface MovementUntukNilai {
  qty: number;
  nilai: number | null;
  hargaSaatTransaksi: number;
  item: { harga: number };
  lapisanPemakaian?: { qty: number; harga: number }[];
}

export function nilaiMovement(mv: MovementUntukNilai): NilaiMovement {
  // Barang keluar FIFO: pakai rincian lapisan yang tercatat.
  if (mv.lapisanPemakaian && mv.lapisanPemakaian.length > 0) {
    const bagian = gabungPerHarga(mv.lapisanPemakaian);
    const nominal = mv.nilai ?? bagian.reduce((s, b) => s + b.qty * b.harga, 0);
    return { nominal, hargaRata: mv.qty > 0 ? Math.round(nominal / mv.qty) : 0, bagian };
  }
  // Masuk / penyesuaian tambah (nilai tercatat) -> satu harga, nol dihormati.
  if (mv.nilai !== null) {
    return {
      nominal: mv.nilai,
      hargaRata: mv.hargaSaatTransaksi,
      bagian: [{ harga: mv.hargaSaatTransaksi, qty: mv.qty }],
    };
  }
  // Movement lama sebelum FIFO: harga snapshot, atau harga master kalau kosong.
  const harga = mv.hargaSaatTransaksi || mv.item.harga;
  return { nominal: mv.qty * harga, hargaRata: harga, bagian: [{ harga, qty: mv.qty }] };
}

/** Hanya nilainya saja (untuk tren yang tidak butuh rincian). */
export function nominalMovement(mv: MovementUntukNilai): number {
  return nilaiMovement(mv).nominal;
}

function gabungPerHarga(rows: { qty: number; harga: number }[]): BagianHarga[] {
  const peta = new Map<number, number>();
  for (const r of rows) peta.set(r.harga, (peta.get(r.harga) ?? 0) + r.qty);
  return [...peta.entries()].map(([harga, qty]) => ({ harga, qty })).sort((a, b) => a.harga - b.harga);
}
