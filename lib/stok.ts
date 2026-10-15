// =====================================================================
// PINTU TUNGGAL PERUBAHAN STOK
//
// Semua perubahan Item.stok HARUS lewat fungsi di file ini, tidak boleh lagi
// memanggil tx.item.update({ stok: ... }) langsung. Tiap perubahan menulis
// satu baris StockMovement di transaksi yang sama, sehingga:
//
//   stok sekarang = stok awal + SUM(movement bertanda)
//
// selalu bisa dibuktikan dari catatan. Sebelumnya edit stok manual & stok awal
// barang baru mengubah angka tanpa jejak, sehingga laporan dan stok bisa
// berbeda tanpa ada yang tahu kenapa.
//
// Semua fungsi menerima `tx` (transaction client) supaya pemanggil bisa
// menggabungkannya dengan operasi lain dalam satu transaksi.
// =====================================================================
import { Prisma, TipeStockMovement } from "@prisma/client";
import { db } from "@/lib/db";
import { awalBulanWIB, periodeValid } from "@/lib/waktu";

export type TxClient = Prisma.TransactionClient;

export type SumberStok =
  | "pengajuan" // barang keluar karena pengajuan selesai
  | "restock" // restock satu barang
  | "restock_massal" // restock banyak barang sekaligus
  | "impor" // impor Excel master item
  | "edit_manual" // admin mengubah angka stok di Master Item
  | "stok_awal" // stok awal saat barang baru dibuat
  | "baseline" // impor stok awal periode (penyelarasan ke hitungan fisik)
  | "sto"; // hasil stock opname (fase berikutnya)

export type KodeStokError =
  | "ITEM_TIDAK_ADA"
  | "INPUT_TIDAK_VALID"
  | "STOK_TIDAK_CUKUP"
  | "STOK_BERUBAH"
  | "ALASAN_WAJIB";

export class StokError extends Error {
  constructor(
    public readonly code: KodeStokError,
    message: string
  ) {
    super(message);
    this.name = "StokError";
  }
}

/** Kode status HTTP yang pantas untuk sebuah StokError. */
export function statusHttpStokError(e: StokError): number {
  switch (e.code) {
    case "ITEM_TIDAK_ADA":
      return 404;
    case "STOK_BERUBAH":
    case "STOK_TIDAK_CUKUP":
      return 409;
    default:
      return 400;
  }
}

// Transaksi interaktif Prisma default-nya hanya 5 detik. Operasi stok bisa
// menyentuh banyak baris, jadi diberi batas lebih longgar. Operasi massal di
// bawah ini jumlah query-nya tetap (tidak bergantung jumlah barang), jadi batas
// ini hanya jaring pengaman.
export const OPSI_TRANSAKSI_STOK = { maxWait: 10_000, timeout: 20_000 } as const;

export function transaksiStok<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn, OPSI_TRANSAKSI_STOK);
}

// Arah pengaruh tiap tipe terhadap stok.
export const ARAH_TIPE: Record<TipeStockMovement, 1 | -1> = {
  masuk: 1,
  penyesuaian_plus: 1,
  keluar: -1,
  penyesuaian_minus: -1,
};

const QTY_MAKS = 100_000_000;
const CATATAN_MAKS = 500;
const BARIS_MAKS = 1000;

function pastikanQty(qty: unknown, nama = "Jumlah"): asserts qty is number {
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0 || qty > QTY_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", `${nama} harus berupa bilangan bulat lebih dari 0.`);
  }
}

function pastikanHarga(harga: unknown): void {
  if (harga == null) return;
  if (typeof harga !== "number" || !Number.isInteger(harga) || harga < 0) {
    throw new StokError("INPUT_TIDAK_VALID", "Harga harus berupa bilangan bulat 0 atau lebih.");
  }
}

function bersihkanCatatan(catatan: string | null | undefined): string | null {
  const c = catatan?.trim();
  if (!c) return null;
  if (c.length > CATATAN_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", `Catatan terlalu panjang (maksimal ${CATATAN_MAKS} karakter).`);
  }
  return c;
}

// ---------------------------------------------------------------------
// 1. Ubah stok satu barang (masuk / keluar / penyesuaian)
// ---------------------------------------------------------------------
export interface UbahStokInput {
  itemId: number;
  tipe: TipeStockMovement;
  qty: number;
  sumber: SumberStok;
  tanggal?: Date;
  /** Snapshot harga pada movement. Default: harga barang saat ini. */
  harga?: number | null;
  refRequestId?: number | null;
  catatan?: string | null;
  dibuatOlehId?: number | null;
}

export interface HasilUbahStok {
  movementId: number;
  namaItem: string;
  satuan: string;
  stokSebelum: number;
  stokSesudah: number;
}

/**
 * Tambah/kurangi stok satu barang dan catat movement-nya.
 *
 * Pengurangan memakai update bersyarat (`stok >= qty`) di tingkat database,
 * jadi stok TIDAK BISA menjadi negatif walau dua proses berjalan bersamaan
 * (membaca-lalu-menulis di aplikasi tidak aman untuk itu).
 */
export async function ubahStok(tx: TxClient, input: UbahStokInput): Promise<HasilUbahStok> {
  const { itemId, tipe, qty, sumber } = input;
  pastikanQty(qty);
  pastikanHarga(input.harga);
  const catatan = bersihkanCatatan(input.catatan);
  const arah = ARAH_TIPE[tipe];

  const pilih = { nama: true, satuan: true, harga: true, stok: true } as const;
  let item: { nama: string; satuan: string; harga: number; stok: number };

  if (arah === 1) {
    try {
      item = await tx.item.update({
        where: { id: itemId },
        data: { stok: { increment: qty } },
        select: pilih,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw new StokError("ITEM_TIDAK_ADA", `Barang (id ${itemId}) tidak ditemukan.`);
      }
      throw e;
    }
  } else {
    const hasil = await tx.item.updateMany({
      where: { id: itemId, stok: { gte: qty } },
      data: { stok: { decrement: qty } },
    });
    if (hasil.count === 0) {
      const ada = await tx.item.findUnique({ where: { id: itemId }, select: { nama: true, stok: true } });
      if (!ada) throw new StokError("ITEM_TIDAK_ADA", `Barang (id ${itemId}) tidak ditemukan.`);
      throw new StokError(
        "STOK_TIDAK_CUKUP",
        `Stok "${ada.nama}" tidak mencukupi (tersedia ${ada.stok}, diminta ${qty}).`
      );
    }
    item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: pilih });
  }

  const movement = await tx.stockMovement.create({
    data: {
      itemId,
      tipe,
      qty,
      sumber,
      hargaSaatTransaksi: input.harga ?? item.harga,
      refRequestId: input.refRequestId ?? null,
      tanggal: input.tanggal,
      catatan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    },
    select: { id: true },
  });

  return {
    movementId: movement.id,
    namaItem: item.nama,
    satuan: item.satuan,
    stokSebelum: item.stok - arah * qty,
    stokSesudah: item.stok,
  };
}

// ---------------------------------------------------------------------
// 2. Restock massal: banyak barang, jumlah query TETAP
// ---------------------------------------------------------------------
export interface BarisMasuk {
  itemId: number;
  qty: number;
  /** Harga beli per satuan untuk baris ini (opsional). Tidak mengubah Item.harga. */
  harga?: number | null;
}

export interface HasilMasukBanyak {
  jumlahBaris: number;
  jumlahBarang: number;
  totalQty: number;
}

/**
 * Tambah stok banyak barang sekaligus. Hanya 4 query berapa pun jumlah barisnya
 * (cek barang, 1x UPDATE ... FROM VALUES, 1x createMany), bukan satu query per
 * baris. Ini penting karena transaksi interaktif Prisma gampang melewati batas
 * waktu kalau queries-nya dikerjakan satu per satu.
 */
export async function ubahStokMasukBanyak(
  tx: TxClient,
  input: {
    baris: BarisMasuk[];
    sumber: SumberStok;
    tanggal?: Date;
    catatan?: string | null;
    dibuatOlehId?: number | null;
  }
): Promise<HasilMasukBanyak> {
  const { baris, sumber } = input;
  if (baris.length === 0) {
    throw new StokError("INPUT_TIDAK_VALID", "Tidak ada baris yang diproses.");
  }
  if (baris.length > BARIS_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", `Maksimal ${BARIS_MAKS} baris per sekali simpan.`);
  }
  const catatan = bersihkanCatatan(input.catatan);

  // Satu barang boleh muncul di beberapa baris (harga bisa beda); stoknya dijumlahkan.
  const perItem = new Map<number, number>();
  for (const b of baris) {
    if (!Number.isInteger(b.itemId)) throw new StokError("INPUT_TIDAK_VALID", "ID barang tidak valid.");
    pastikanQty(b.qty);
    pastikanHarga(b.harga);
    perItem.set(b.itemId, (perItem.get(b.itemId) ?? 0) + b.qty);
  }

  const ids = [...perItem.keys()];
  const ditemukan = await tx.item.findMany({
    where: { id: { in: ids } },
    select: { id: true, harga: true },
  });
  if (ditemukan.length !== ids.length) {
    const ada = new Set(ditemukan.map((i) => i.id));
    const hilang = ids.filter((id) => !ada.has(id));
    throw new StokError("ITEM_TIDAK_ADA", `Barang dengan id ${hilang.slice(0, 10).join(", ")} tidak ditemukan.`);
  }
  const hargaItem = new Map(ditemukan.map((i) => [i.id, i.harga]));

  const nilai = Prisma.join(ids.map((id) => Prisma.sql`(${id}::int, ${perItem.get(id)!}::int)`));
  const terubah = await tx.$executeRaw(
    Prisma.sql`UPDATE "item" AS i
      SET "stok" = i."stok" + v.qty, "updated_at" = (NOW() AT TIME ZONE 'UTC')
      FROM (VALUES ${nilai}) AS v(id, qty)
      WHERE i."id" = v.id`
  );
  if (terubah !== ids.length) {
    throw new StokError("STOK_BERUBAH", "Jumlah barang yang diperbarui tidak sesuai. Coba lagi.");
  }

  await tx.stockMovement.createMany({
    data: baris.map((b) => ({
      itemId: b.itemId,
      tipe: TipeStockMovement.masuk,
      qty: b.qty,
      sumber,
      hargaSaatTransaksi: b.harga ?? hargaItem.get(b.itemId) ?? 0,
      tanggal: input.tanggal,
      catatan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    })),
  });

  return {
    jumlahBaris: baris.length,
    jumlahBarang: ids.length,
    totalQty: baris.reduce((s, b) => s + b.qty, 0),
  };
}

// ---------------------------------------------------------------------
// 3. Set stok ke angka tertentu (edit manual / stok awal barang baru)
// ---------------------------------------------------------------------
export interface SetStokInput {
  itemId: number;
  stokBaru: number;
  /** Wajib diisi kalau stok memang berubah. */
  alasan: string | null | undefined;
  sumber: SumberStok;
  dibuatOlehId?: number | null;
  tanggal?: Date;
}

export interface HasilSetStok {
  berubah: boolean;
  stokSebelum: number;
  stokSesudah: number;
  movementId?: number;
}

/**
 * Ubah stok ke angka absolut dan catat selisihnya sebagai penyesuaian.
 * Kalau angkanya sama dengan stok sekarang, tidak terjadi apa-apa (tanpa movement).
 */
export async function setStokKe(tx: TxClient, input: SetStokInput): Promise<HasilSetStok> {
  const { itemId, stokBaru, sumber } = input;
  if (!Number.isInteger(stokBaru) || stokBaru < 0 || stokBaru > QTY_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", "Stok harus berupa bilangan bulat 0 atau lebih.");
  }
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { stok: true, harga: true },
  });
  if (!item) throw new StokError("ITEM_TIDAK_ADA", `Barang (id ${itemId}) tidak ditemukan.`);
  if (item.stok === stokBaru) {
    return { berubah: false, stokSebelum: item.stok, stokSesudah: item.stok };
  }

  const alasan = bersihkanCatatan(input.alasan);
  if (!alasan) {
    throw new StokError("ALASAN_WAJIB", "Alasan perubahan stok wajib diisi (misalnya hasil hitung fisik atau koreksi salah input).");
  }

  // Optimistik: hanya berhasil kalau stok belum berubah sejak dibaca di atas.
  const hasil = await tx.item.updateMany({
    where: { id: itemId, stok: item.stok },
    data: { stok: stokBaru },
  });
  if (hasil.count === 0) {
    throw new StokError("STOK_BERUBAH", "Stok barang berubah saat Anda menyimpan. Muat ulang halaman lalu coba lagi.");
  }

  const selisih = stokBaru - item.stok;
  const movement = await tx.stockMovement.create({
    data: {
      itemId,
      tipe: selisih > 0 ? TipeStockMovement.penyesuaian_plus : TipeStockMovement.penyesuaian_minus,
      qty: Math.abs(selisih),
      sumber,
      hargaSaatTransaksi: item.harga,
      tanggal: input.tanggal,
      catatan: alasan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    },
    select: { id: true },
  });

  return { berubah: true, stokSebelum: item.stok, stokSesudah: stokBaru, movementId: movement.id };
}

// ---------------------------------------------------------------------
// 4. Stok awal periode (baseline)
// ---------------------------------------------------------------------
export interface BarisStokAwal {
  itemId: number;
  qty: number;
}

export interface PerubahanBaseline {
  itemId: number;
  nama: string;
  stokSebelum: number;
  stokAwal: number;
  mutasiBerjalan: number;
  stokSesudah: number;
}

export interface HasilBaseline {
  periode: string;
  jumlahBarang: number;
  jumlahDisesuaikan: number;
  perubahan: PerubahanBaseline[];
}

/**
 * Hitung (tanpa menulis apa pun) apa yang akan terjadi kalau stok awal sebuah
 * periode diset. Dipakai untuk pratinjau sebelum admin menekan "Terapkan".
 *
 * stokSesudah = stokAwal + mutasi bulan berjalan (masuk - keluar +/- penyesuaian
 * selain baseline sejak tanggal 1 periode, WIB). Kalau belum ada transaksi di
 * bulan itu, stokSesudah = stokAwal.
 */
export async function hitungBaseline(
  tx: TxClient,
  periode: string,
  baris: BarisStokAwal[]
): Promise<PerubahanBaseline[]> {
  if (!periodeValid(periode)) {
    throw new StokError("INPUT_TIDAK_VALID", `Periode "${periode}" tidak valid. Gunakan format YYYY-MM.`);
  }
  if (baris.length === 0) throw new StokError("INPUT_TIDAK_VALID", "Tidak ada baris yang diproses.");
  if (baris.length > BARIS_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", `Maksimal ${BARIS_MAKS} baris per sekali simpan.`);
  }

  const dilihat = new Set<number>();
  for (const b of baris) {
    if (!Number.isInteger(b.itemId)) throw new StokError("INPUT_TIDAK_VALID", "ID barang tidak valid.");
    if (!Number.isInteger(b.qty) || b.qty < 0 || b.qty > QTY_MAKS) {
      throw new StokError("INPUT_TIDAK_VALID", "Stok awal harus berupa bilangan bulat 0 atau lebih.");
    }
    if (dilihat.has(b.itemId)) {
      throw new StokError("INPUT_TIDAK_VALID", `Barang (id ${b.itemId}) muncul lebih dari sekali.`);
    }
    dilihat.add(b.itemId);
  }

  const ids = [...dilihat];
  const items = await tx.item.findMany({
    where: { id: { in: ids } },
    select: { id: true, nama: true, stok: true },
  });
  if (items.length !== ids.length) {
    const ada = new Set(items.map((i) => i.id));
    const hilang = ids.filter((id) => !ada.has(id));
    throw new StokError("ITEM_TIDAK_ADA", `Barang dengan id ${hilang.slice(0, 10).join(", ")} tidak ditemukan.`);
  }

  const mutasi = await tx.stockMovement.groupBy({
    by: ["itemId", "tipe"],
    where: { itemId: { in: ids }, tanggal: { gte: awalBulanWIB(periode) }, sumber: { not: "baseline" } },
    _sum: { qty: true },
  });
  const netPerItem = new Map<number, number>();
  for (const m of mutasi) {
    netPerItem.set(m.itemId, (netPerItem.get(m.itemId) ?? 0) + ARAH_TIPE[m.tipe] * (m._sum.qty ?? 0));
  }

  const qtyPerItem = new Map(baris.map((b) => [b.itemId, b.qty]));
  return items.map((it) => {
    const stokAwal = qtyPerItem.get(it.id)!;
    const mutasiBerjalan = netPerItem.get(it.id) ?? 0;
    return {
      itemId: it.id,
      nama: it.nama,
      stokSebelum: it.stok,
      stokAwal,
      mutasiBerjalan,
      stokSesudah: stokAwal + mutasiBerjalan,
    };
  });
}

/**
 * Terapkan stok awal sebuah periode (baseline).
 *  - menyimpan snapshot di StokAwalBulan,
 *  - menyelaraskan Item.stok ke (stok awal + mutasi bulan berjalan),
 *  - mencatat selisihnya sebagai movement penyesuaian bersumber "baseline"
 *    (movement baseline TIDAK dihitung sebagai mutasi bulan itu).
 */
export async function setStokAwalPeriode(
  tx: TxClient,
  input: { periode: string; baris: BarisStokAwal[]; dibuatOlehId: number }
): Promise<HasilBaseline> {
  const { periode, baris, dibuatOlehId } = input;
  const rencana = await hitungBaseline(tx, periode, baris);

  const negatif = rencana.find((r) => r.stokSesudah < 0);
  if (negatif) {
    throw new StokError(
      "INPUT_TIDAK_VALID",
      `Stok awal "${negatif.nama}" (${negatif.stokAwal}) ditambah mutasi bulan ini (${negatif.mutasiBerjalan}) menjadi negatif. Periksa angkanya.`
    );
  }

  const berubah = rencana.filter((r) => r.stokSesudah !== r.stokSebelum);

  if (berubah.length > 0) {
    const nilai = Prisma.join(
      berubah.map((r) => Prisma.sql`(${r.itemId}::int, ${r.stokSebelum}::int, ${r.stokSesudah}::int)`)
    );
    const terubah = await tx.$executeRaw(
      Prisma.sql`UPDATE "item" AS i
        SET "stok" = v.baru, "updated_at" = (NOW() AT TIME ZONE 'UTC')
        FROM (VALUES ${nilai}) AS v(id, lama, baru)
        WHERE i."id" = v.id AND i."stok" = v.lama`
    );
    if (terubah !== berubah.length) {
      throw new StokError("STOK_BERUBAH", "Stok beberapa barang berubah saat proses berjalan. Muat ulang lalu coba lagi.");
    }

    const harga = await tx.item.findMany({
      where: { id: { in: berubah.map((r) => r.itemId) } },
      select: { id: true, harga: true },
    });
    const hargaMap = new Map(harga.map((h) => [h.id, h.harga]));
    await tx.stockMovement.createMany({
      data: berubah.map((r) => {
        const selisih = r.stokSesudah - r.stokSebelum;
        return {
          itemId: r.itemId,
          tipe: selisih > 0 ? TipeStockMovement.penyesuaian_plus : TipeStockMovement.penyesuaian_minus,
          qty: Math.abs(selisih),
          sumber: "baseline",
          hargaSaatTransaksi: hargaMap.get(r.itemId) ?? 0,
          catatan: `Stok awal periode ${periode}: sistem ${r.stokSebelum} diselaraskan ke ${r.stokAwal} (+ mutasi bulan berjalan ${r.mutasiBerjalan}).`,
          dibuatOlehId,
        };
      }),
    });
  }

  const nilaiSnapshot = Prisma.join(
    rencana.map((r) => Prisma.sql`(${periode}::text, ${r.itemId}::int, ${r.stokAwal}::int)`)
  );
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "stok_awal_bulan" ("periode", "item_id", "qty", "sumber", "created_at", "updated_at")
      SELECT v.periode, v.item_id, v.qty, 'baseline', (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC')
      FROM (VALUES ${nilaiSnapshot}) AS v(periode, item_id, qty)
      ON CONFLICT ("periode", "item_id")
      DO UPDATE SET "qty" = EXCLUDED."qty", "sumber" = 'baseline', "updated_at" = (NOW() AT TIME ZONE 'UTC')`
  );

  return {
    periode,
    jumlahBarang: rencana.length,
    jumlahDisesuaikan: berubah.length,
    perubahan: berubah,
  };
}
