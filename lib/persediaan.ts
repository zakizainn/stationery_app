// Pembacaan persediaan berbasis lapisan FIFO (hanya BACA, tidak mengubah apa pun).
// Perubahan stok tetap hanya lewat lib/stok.ts.
import { db } from "@/lib/db";

/** Periode saat sistem lapisan FIFO mulai aktif. Sebelum periode ini, persediaan historis tidak direkonstruksi. */
export const PERIODE_MULAI_FIFO = "2026-10";

export interface LapisanAktif {
  id: number;
  qtyAwal: number;
  sisaQty: number;
  harga: number;
  tanggal: Date;
  sumber: string;
  /** sisaQty x harga */
  nilai: number;
}

export interface NilaiPersediaanItem {
  itemId: number;
  qty: number;
  /** Nilai persediaan FIFO = jumlah (sisaQty x harga) semua lapisan yang masih ada. */
  nilai: number;
}

/**
 * Nilai persediaan FIFO per barang: jumlah (sisa x harga) dari lapisan yang masih ada.
 * Tanpa argumen = semua barang yang punya lapisan tersisa.
 */
export async function nilaiPersediaan(itemIds?: number[]): Promise<Map<number, NilaiPersediaanItem>> {
  const baris =
    itemIds && itemIds.length > 0
      ? await db.$queryRaw<{ item_id: number; qty: bigint; nilai: bigint }[]>`
          SELECT item_id, SUM(sisa_qty)::bigint AS qty, SUM(sisa_qty::bigint * harga) AS nilai
          FROM stok_lapisan WHERE sisa_qty > 0 AND item_id = ANY(${itemIds}::int[])
          GROUP BY item_id`
      : await db.$queryRaw<{ item_id: number; qty: bigint; nilai: bigint }[]>`
          SELECT item_id, SUM(sisa_qty)::bigint AS qty, SUM(sisa_qty::bigint * harga) AS nilai
          FROM stok_lapisan WHERE sisa_qty > 0 GROUP BY item_id`;
  return new Map(
    baris.map((r) => [r.item_id, { itemId: r.item_id, qty: Number(r.qty), nilai: Number(r.nilai) }])
  );
}

/** Lapisan yang masih punya sisa untuk satu barang, urut dari yang TERLAMA (akan dipakai pertama). */
export async function lapisanAktifItem(itemId: number): Promise<LapisanAktif[]> {
  const rows = await db.stokLapisan.findMany({
    where: { itemId, sisaQty: { gt: 0 } },
    orderBy: [{ tanggal: "asc" }, { id: "asc" }],
  });
  return rows.map((l) => ({
    id: l.id,
    qtyAwal: l.qtyAwal,
    sisaQty: l.sisaQty,
    harga: l.harga,
    tanggal: l.tanggal,
    sumber: l.sumber,
    nilai: l.sisaQty * l.harga,
  }));
}

export interface KetidaksesuaianLapisan {
  itemId: number;
  nama: string;
  stok: number;
  jumlahLapisan: number;
}

/**
 * Pemeriksaan aturan tetap: SUM(sisa lapisan) == Item.stok untuk setiap barang.
 * Hasil kosong = semuanya konsisten.
 */
export async function periksaKonsistensiLapisan(): Promise<KetidaksesuaianLapisan[]> {
  const rows = await db.$queryRaw<{ id: number; nama: string; stok: number; lapisan: bigint }[]>`
    SELECT i.id, i.nama, i.stok, COALESCE(SUM(l.sisa_qty), 0)::bigint AS lapisan
    FROM item i LEFT JOIN stok_lapisan l ON l.item_id = i.id
    GROUP BY i.id, i.nama, i.stok
    HAVING i.stok <> COALESCE(SUM(l.sisa_qty), 0)
    ORDER BY i.nama`;
  return rows.map((r) => ({ itemId: r.id, nama: r.nama, stok: r.stok, jumlahLapisan: Number(r.lapisan) }));
}

export interface LapisanPada {
  itemId: number;
  harga: number;
  /** Sisa lapisan ini PADA tanggal yang ditanyakan (bukan sisa hari ini). */
  sisa: number;
}

/**
 * Lapisan FIFO beserta sisanya PADA tanggal tertentu (sebelum `batas`), direkonstruksi
 * dari catatan pemakaian: sisa = qtyAwal - pemakaian oleh movement yang bertanggal
 * sebelum `batas`. Dipakai untuk "nilai persediaan akhir periode", sehingga Laporan
 * bulan lalu tidak berubah ketika diunduh belakangan.
 *
 * Catatan: lapisan yang tanggalnya >= batas dianggap belum ada pada saat itu.
 */
export async function lapisanPada(batas: Date): Promise<LapisanPada[]> {
  const iso = batas.toISOString();
  const rows = await db.$queryRaw<{ item_id: number; harga: number; sisa: bigint }[]>`
    SELECT l.item_id, l.harga, (l.qty_awal - COALESCE(p.dipakai, 0))::bigint AS sisa
    FROM stok_lapisan l
    LEFT JOIN (
      SELECT lp.lapisan_id, SUM(lp.qty) AS dipakai
      FROM lapisan_pemakaian lp
      JOIN stock_movement m ON m.id = lp.movement_id
      WHERE m.tanggal < ${iso}::timestamp
      GROUP BY lp.lapisan_id
    ) p ON p.lapisan_id = l.id
    WHERE l.tanggal < ${iso}::timestamp
      AND l.qty_awal - COALESCE(p.dipakai, 0) > 0
    ORDER BY l.item_id, l.tanggal, l.id`;
  return rows.map((r) => ({ itemId: r.item_id, harga: r.harga, sisa: Number(r.sisa) }));
}

export interface PersediaanPada {
  itemId: number;
  qty: number;
  nilai: number;
  /** Rincian per harga (terlama dulu), mis. [{harga:3000, qty:5}, {harga:3500, qty:20}]. */
  lapisan: { harga: number; qty: number }[];
}

/** Persediaan per barang PADA tanggal tertentu (lihat lapisanPada). */
export async function persediaanPada(batas: Date): Promise<Map<number, PersediaanPada>> {
  const hasil = new Map<number, PersediaanPada>();
  for (const l of await lapisanPada(batas)) {
    const p = hasil.get(l.itemId) ?? { itemId: l.itemId, qty: 0, nilai: 0, lapisan: [] };
    p.qty += l.sisa;
    p.nilai += l.sisa * l.harga;
    p.lapisan.push({ harga: l.harga, qty: l.sisa });
    hasil.set(l.itemId, p);
  }
  return hasil;
}
