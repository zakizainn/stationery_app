// =====================================================================
// PINTU TUNGGAL PERUBAHAN STOK  +  LAPISAN HARGA FIFO
//
// Semua perubahan Item.stok HARUS lewat fungsi di file ini, tidak boleh lagi
// memanggil tx.item.update({ stok: ... }) langsung. Tiap perubahan menulis satu
// baris StockMovement di transaksi yang sama, sehingga:
//
//   stok sekarang = stok awal + SUM(movement bertanda)
//
// FIFO (first in, first out)
// --------------------------
// Setiap barang MASUK (restock, stok awal, penyesuaian tambah) membentuk satu
// LAPISAN (StokLapisan) berisi jumlah dan harga belinya. Barang KELUAR
// mengambil dari lapisan TERLAMA dulu (urut tanggal, lalu id). Satu pengambilan
// yang melewati dua lapisan dipecah per harga. Nilai Rupiah-nya DIBEKUKAN saat
// transaksi (movement.nilai), jadi tidak berubah walau harga master diganti.
//
//   aturan tetap:  SUM(sisaQty semua lapisan sebuah barang) == Item.stok
//
// Aturan koreksi stok (STO, edit manual, stok awal):
//   - stok KURANG  -> dikurangi dari lapisan TERLAMA
//   - stok LEBIH   -> membentuk lapisan baru dengan harga master saat itu
//
// Semua fungsi menerima `tx` (transaction client) supaya pemanggil bisa
// menggabungkannya dengan operasi lain dalam satu transaksi.
// Penguncian: setiap operasi pertama-tama meng-UPDATE baris Item (mengambil
// kunci baris), baru menyentuh lapisan. Dua proses pada barang yang sama
// otomatis berurutan, jadi lapisan tidak bisa dipakai ganda.
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
const NILAI_MAKS = 2_147_483_647; // batas kolom Int (Rp 2,1 miliar per movement)
const TANGGAL_PENYEIMBANG = new Date(0); // lapisan "penyeimbang" dianggap paling tua

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

function hitungNilai(qty: number, harga: number): number {
  const n = qty * harga;
  if (!Number.isSafeInteger(n) || n > NILAI_MAKS) {
    throw new StokError(
      "INPUT_TIDAK_VALID",
      "Nilai transaksi terlalu besar (melebihi Rp 2,1 miliar). Pecah menjadi beberapa transaksi."
    );
  }
  return n;
}

// =====================================================================
// LAPISAN FIFO (internal)
// =====================================================================
export interface RincianLapisan {
  lapisanId: number;
  qty: number;
  harga: number;
}

interface HasilKonsumsi {
  /** Nilai total Rupiah = jumlah (qty x harga) tiap lapisan yang dipakai. */
  nilai: number;
  /** Harga rata-rata tertimbang, dibulatkan (untuk tampilan / kolom lama). */
  hargaRata: number;
  rincian: RincianLapisan[];
}

/**
 * Mengambil `qty` dari lapisan TERLAMA untuk satu atau banyak barang sekaligus.
 * Jumlah query tetap: 1x baca lapisan + 1x UPDATE (berapa pun barangnya).
 *
 * PRASYARAT: baris Item sudah dikunci oleh pemanggil (lewat UPDATE stok).
 *
 * Kalau jumlah lapisan ternyata KURANG dari stok sebelum pengambilan (stok dan
 * lapisan tidak sinkron, mis. data lama sebelum FIFO atau perubahan di luar
 * aplikasi), SELURUH selisihnya dibentuk sebagai satu lapisan "penyeimbang"
 * berharga master dan dianggap paling tua. Dengan begitu pengambilan yang sah tidak
 * gagal hanya karena catatan lapisan tertinggal, dan aturan tetap
 * SUM(lapisan) == stok pulih kembali.
 */
async function konsumsiLapisan(
  tx: TxClient,
  permintaan: { itemId: number; qty: number; hargaDefault: number; stokSebelum: number }[]
): Promise<Map<number, HasilKonsumsi>> {
  const hasil = new Map<number, HasilKonsumsi>();
  if (permintaan.length === 0) return hasil;

  const ids = permintaan.map((p) => p.itemId);
  const semua = await tx.stokLapisan.findMany({
    where: { itemId: { in: ids }, sisaQty: { gt: 0 } },
    orderBy: [{ tanggal: "asc" }, { id: "asc" }],
    select: { id: true, itemId: true, sisaQty: true, harga: true },
  });
  const perItem = new Map<number, typeof semua>();
  for (const l of semua) perItem.set(l.itemId, [...(perItem.get(l.itemId) ?? []), l]);

  const pengurangan: { id: number; kurang: number }[] = [];

  for (const p of permintaan) {
    const lapisanItem = [...(perItem.get(p.itemId) ?? [])];
    const sisaTotal = lapisanItem.reduce((t, l) => t + l.sisaQty, 0);

    if (p.stokSebelum > sisaTotal) {
      const kurang = p.stokSebelum - sisaTotal;
      const penyeimbang = await tx.stokLapisan.create({
        data: {
          itemId: p.itemId,
          qtyAwal: kurang,
          sisaQty: kurang,
          harga: p.hargaDefault,
          tanggal: TANGGAL_PENYEIMBANG,
          sumber: "penyeimbang",
        },
        select: { id: true },
      });
      lapisanItem.unshift({ id: penyeimbang.id, itemId: p.itemId, sisaQty: kurang, harga: p.hargaDefault });
    }

    let perlu = p.qty;
    let nilai = 0;
    const rincian: RincianLapisan[] = [];
    for (const l of lapisanItem) {
      if (perlu === 0) break;
      const ambil = Math.min(l.sisaQty, perlu);
      rincian.push({ lapisanId: l.id, qty: ambil, harga: l.harga });
      pengurangan.push({ id: l.id, kurang: ambil });
      nilai += hitungNilai(ambil, l.harga);
      perlu -= ambil;
    }
    if (perlu > 0) {
      throw new StokError("STOK_BERUBAH", "Lapisan stok tidak mencukupi untuk pengambilan ini. Coba lagi.");
    }

    if (nilai > NILAI_MAKS) {
      throw new StokError("INPUT_TIDAK_VALID", "Nilai transaksi terlalu besar (melebihi Rp 2,1 miliar). Pecah menjadi beberapa transaksi.");
    }
    hasil.set(p.itemId, { nilai, hargaRata: p.qty > 0 ? Math.round(nilai / p.qty) : 0, rincian });
  }

  if (pengurangan.length > 0) {
    pengurangan.sort((a, b) => a.id - b.id);
    const nilaiSql = Prisma.join(pengurangan.map((x) => Prisma.sql`(${x.id}::int, ${x.kurang}::int)`));
    const terubah = await tx.$executeRaw(
      Prisma.sql`UPDATE "stok_lapisan" AS l
        SET "sisa_qty" = l."sisa_qty" - v.kurang
        FROM (VALUES ${nilaiSql}) AS v(id, kurang)
        WHERE l."id" = v.id AND l."sisa_qty" >= v.kurang`
    );
    if (terubah !== pengurangan.length) {
      throw new StokError("STOK_BERUBAH", "Lapisan stok berubah saat diproses. Coba lagi.");
    }
  }
  return hasil;
}

async function catatPemakaian(tx: TxClient, movementId: number, rincian: RincianLapisan[]) {
  if (rincian.length === 0) return;
  await tx.lapisanPemakaian.createMany({
    data: rincian.map((r) => ({ movementId, lapisanId: r.lapisanId, qty: r.qty, harga: r.harga })),
  });
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
  /**
   * Harga per satuan untuk lapisan BARU (masuk / penyesuaian_plus). Default: harga
   * master barang saat ini. DIABAIKAN untuk keluar/penyesuaian_minus, karena nilai
   * barang keluar ditentukan oleh lapisan yang dipakai (FIFO).
   */
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
  /** Nilai Rupiah movement ini (FIFO). */
  nilai: number;
}

/**
 * Tambah/kurangi stok satu barang, catat movement-nya, dan bentuk/pakai lapisan FIFO.
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
  const tanggal = input.tanggal ?? new Date();

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

    // Barang masuk membentuk satu lapisan baru berharga beli (atau harga master).
    const hargaLapisan = input.harga ?? item.harga;
    const nilai = hitungNilai(qty, hargaLapisan);
    const movement = await tx.stockMovement.create({
      data: {
        itemId,
        tipe,
        qty,
        sumber,
        hargaSaatTransaksi: hargaLapisan,
        nilai,
        refRequestId: input.refRequestId ?? null,
        tanggal,
        catatan,
        dibuatOlehId: input.dibuatOlehId ?? null,
      },
      select: { id: true },
    });
    await tx.stokLapisan.create({
      data: { itemId, qtyAwal: qty, sisaQty: qty, harga: hargaLapisan, tanggal, sumber },
    });
    return {
      movementId: movement.id,
      namaItem: item.nama,
      satuan: item.satuan,
      stokSebelum: item.stok - qty,
      stokSesudah: item.stok,
      nilai,
    };
  }

  // arah === -1 : barang keluar / penyesuaian kurang
  const hasilUpdate = await tx.item.updateMany({
    where: { id: itemId, stok: { gte: qty } },
    data: { stok: { decrement: qty } },
  });
  if (hasilUpdate.count === 0) {
    const ada = await tx.item.findUnique({ where: { id: itemId }, select: { nama: true, stok: true } });
    if (!ada) throw new StokError("ITEM_TIDAK_ADA", `Barang (id ${itemId}) tidak ditemukan.`);
    throw new StokError(
      "STOK_TIDAK_CUKUP",
      `Stok "${ada.nama}" tidak mencukupi (tersedia ${ada.stok}, diminta ${qty}).`
    );
  }
  item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: pilih });

  // FIFO: ambil dari lapisan terlama, nilai dibekukan sekarang.
  const k = (await konsumsiLapisan(tx, [{ itemId, qty, hargaDefault: item.harga, stokSebelum: item.stok + qty }])).get(itemId)!;
  const movement = await tx.stockMovement.create({
    data: {
      itemId,
      tipe,
      qty,
      sumber,
      hargaSaatTransaksi: k.hargaRata,
      nilai: k.nilai,
      refRequestId: input.refRequestId ?? null,
      tanggal,
      catatan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    },
    select: { id: true },
  });
  await catatPemakaian(tx, movement.id, k.rincian);

  return {
    movementId: movement.id,
    namaItem: item.nama,
    satuan: item.satuan,
    stokSebelum: item.stok + qty,
    stokSesudah: item.stok,
    nilai: k.nilai,
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
  totalNilai: number;
}

/**
 * Tambah stok banyak barang sekaligus. Jumlah query tetap (cek barang, 1x UPDATE ...
 * FROM VALUES, 1x createMany movement, 1x createMany lapisan), bukan satu query per
 * baris. Tiap baris membentuk satu lapisan sendiri, jadi dua baris untuk barang yang
 * sama dengan harga berbeda menjadi dua lapisan dengan harga masing-masing.
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
  const tanggal = input.tanggal ?? new Date();

  // Satu barang boleh muncul di beberapa baris (harga bisa beda); stoknya dijumlahkan.
  const perItem = new Map<number, number>();
  for (const b of baris) {
    if (!Number.isInteger(b.itemId)) throw new StokError("INPUT_TIDAK_VALID", "ID barang tidak valid.");
    pastikanQty(b.qty);
    pastikanHarga(b.harga);
    perItem.set(b.itemId, (perItem.get(b.itemId) ?? 0) + b.qty);
  }

  // Urutkan id secara deterministik untuk mencegah potensi deadlock saat dua operasi massal berjalan serentak.
  const ids = [...perItem.keys()].sort((a, b) => a - b);
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

  const nilaiSql = Prisma.join(ids.map((id) => Prisma.sql`(${id}::int, ${perItem.get(id)!}::int)`));
  const terubah = await tx.$executeRaw(
    Prisma.sql`UPDATE "item" AS i
      SET "stok" = i."stok" + v.qty, "updated_at" = (NOW() AT TIME ZONE 'UTC')
      FROM (VALUES ${nilaiSql}) AS v(id, qty)
      WHERE i."id" = v.id`
  );
  if (terubah !== ids.length) {
    throw new StokError("STOK_BERUBAH", "Jumlah barang yang diperbarui tidak sesuai. Coba lagi.");
  }

  const rows = baris.map((b) => {
    const harga = b.harga ?? hargaItem.get(b.itemId) ?? 0;
    return { itemId: b.itemId, qty: b.qty, harga, nilai: hitungNilai(b.qty, harga) };
  });

  await tx.stockMovement.createMany({
    data: rows.map((r) => ({
      itemId: r.itemId,
      tipe: TipeStockMovement.masuk,
      qty: r.qty,
      sumber,
      hargaSaatTransaksi: r.harga,
      nilai: r.nilai,
      tanggal,
      catatan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    })),
  });
  await tx.stokLapisan.createMany({
    data: rows.map((r) => ({ itemId: r.itemId, qtyAwal: r.qty, sisaQty: r.qty, harga: r.harga, tanggal, sumber })),
  });

  return {
    jumlahBaris: baris.length,
    jumlahBarang: ids.length,
    totalQty: baris.reduce((s, b) => s + b.qty, 0),
    totalNilai: rows.reduce((s, r) => s + r.nilai, 0),
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
  /** Harga lapisan baru kalau stok NAIK. Default: harga master. Diabaikan kalau stok turun. */
  harga?: number | null;
}

export interface HasilSetStok {
  berubah: boolean;
  stokSebelum: number;
  stokSesudah: number;
  movementId?: number;
  /** Nilai Rupiah selisih (FIFO). */
  nilai?: number;
}

/**
 * Ubah stok ke angka absolut dan catat selisihnya sebagai penyesuaian.
 * Kalau angkanya sama dengan stok sekarang, tidak terjadi apa-apa (tanpa movement).
 *
 * Aturan koreksi FIFO: stok KURANG -> diambil dari lapisan terlama;
 * stok LEBIH -> lapisan baru berharga master saat itu.
 */
export async function setStokKe(tx: TxClient, input: SetStokInput): Promise<HasilSetStok> {
  const { itemId, stokBaru, sumber } = input;
  if (!Number.isInteger(stokBaru) || stokBaru < 0 || stokBaru > QTY_MAKS) {
    throw new StokError("INPUT_TIDAK_VALID", "Stok harus berupa bilangan bulat 0 atau lebih.");
  }
  pastikanHarga(input.harga);
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
  // UPDATE ini sekaligus mengunci baris barang untuk operasi lapisan di bawah.
  const hasil = await tx.item.updateMany({
    where: { id: itemId, stok: item.stok },
    data: { stok: stokBaru },
  });
  if (hasil.count === 0) {
    throw new StokError("STOK_BERUBAH", "Stok barang berubah saat Anda menyimpan. Muat ulang halaman lalu coba lagi.");
  }

  const selisih = stokBaru - item.stok;
  const tanggal = input.tanggal ?? new Date();
  const qty = Math.abs(selisih);
  let nilai: number;
  let hargaMovement: number;
  let rincian: RincianLapisan[] = [];

  if (selisih > 0) {
    hargaMovement = input.harga ?? item.harga;
    nilai = hitungNilai(qty, hargaMovement);
    await tx.stokLapisan.create({
      data: { itemId, qtyAwal: qty, sisaQty: qty, harga: hargaMovement, tanggal, sumber },
    });
  } else {
    const k = (await konsumsiLapisan(tx, [{ itemId, qty, hargaDefault: item.harga, stokSebelum: item.stok }])).get(itemId)!;
    nilai = k.nilai;
    hargaMovement = k.hargaRata;
    rincian = k.rincian;
  }

  const movement = await tx.stockMovement.create({
    data: {
      itemId,
      tipe: selisih > 0 ? TipeStockMovement.penyesuaian_plus : TipeStockMovement.penyesuaian_minus,
      qty,
      sumber,
      hargaSaatTransaksi: hargaMovement,
      nilai,
      tanggal,
      catatan: alasan,
      dibuatOlehId: input.dibuatOlehId ?? null,
    },
    select: { id: true },
  });
  await catatPemakaian(tx, movement.id, rincian);

  return { berubah: true, stokSebelum: item.stok, stokSesudah: stokBaru, movementId: movement.id, nilai };
}

// ---------------------------------------------------------------------
// 4. Stok awal periode (baseline)
// ---------------------------------------------------------------------
export interface BarisStokAwal {
  itemId: number;
  qty: number;
  /**
   * Harga per satuan untuk stok yang BERTAMBAH akibat penyelarasan ini (opsional).
   * Kosong = harga master saat ini. Tidak mengubah harga lapisan yang sudah ada.
   */
  harga?: number | null;
}

export interface PerubahanBaseline {
  itemId: number;
  nama: string;
  stokSebelum: number;
  stokAwal: number;
  mutasiBerjalan: number;
  stokSesudah: number;
  hargaMaster: number;
  /** Harga lapisan baru kalau stok bertambah; null kalau tidak bertambah. */
  hargaLapisan: number | null;
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
    pastikanHarga(b.harga);
    if (dilihat.has(b.itemId)) {
      throw new StokError("INPUT_TIDAK_VALID", `Barang (id ${b.itemId}) muncul lebih dari sekali.`);
    }
    dilihat.add(b.itemId);
  }

  const ids = [...dilihat];
  const items = await tx.item.findMany({
    where: { id: { in: ids } },
    select: { id: true, nama: true, stok: true, harga: true },
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

  const perBaris = new Map(baris.map((b) => [b.itemId, b]));
  return items.map((it) => {
    const b = perBaris.get(it.id)!;
    const mutasiBerjalan = netPerItem.get(it.id) ?? 0;
    const stokSesudah = b.qty + mutasiBerjalan;
    return {
      itemId: it.id,
      nama: it.nama,
      stokSebelum: it.stok,
      stokAwal: b.qty,
      mutasiBerjalan,
      stokSesudah,
      hargaMaster: it.harga,
      hargaLapisan: stokSesudah > it.stok ? (b.harga ?? it.harga) : null,
    };
  });
}

/**
 * Terapkan stok awal sebuah periode (baseline).
 *  - menyimpan snapshot di StokAwalBulan,
 *  - menyelaraskan Item.stok ke (stok awal + mutasi bulan berjalan),
 *  - mencatat selisihnya sebagai movement penyesuaian bersumber "baseline"
 *    (movement baseline TIDAK dihitung sebagai mutasi bulan itu),
 *  - FIFO: stok yang BERTAMBAH membentuk lapisan baru (tanggal = awal periode,
 *    harga dari kolom HARGA atau harga master); stok yang BERKURANG diambil dari
 *    lapisan terlama.
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

  // Urutkan itemId secara deterministik untuk mencegah potensi deadlock.
  const berubah = rencana
    .filter((r) => r.stokSesudah !== r.stokSebelum)
    .sort((a, b) => a.itemId - b.itemId);

  if (berubah.length > 0) {
    // 1) UPDATE stok barang -- sekaligus mengunci baris untuk operasi lapisan.
    const nilaiSql = Prisma.join(
      berubah.map((r) => Prisma.sql`(${r.itemId}::int, ${r.stokSebelum}::int, ${r.stokSesudah}::int)`)
    );
    const terubah = await tx.$executeRaw(
      Prisma.sql`UPDATE "item" AS i
        SET "stok" = v.baru, "updated_at" = (NOW() AT TIME ZONE 'UTC')
        FROM (VALUES ${nilaiSql}) AS v(id, lama, baru)
        WHERE i."id" = v.id AND i."stok" = v.lama`
    );
    if (terubah !== berubah.length) {
      throw new StokError("STOK_BERUBAH", "Stok beberapa barang berubah saat proses berjalan. Muat ulang lalu coba lagi.");
    }

    // 2) Lapisan FIFO: naik -> lapisan baru; turun -> ambil dari lapisan terlama.
    const naik = berubah.filter((r) => r.stokSesudah > r.stokSebelum);
    const turun = berubah.filter((r) => r.stokSesudah < r.stokSebelum);
    if (naik.length > 0) {
      const tanggalLapisan = awalBulanWIB(periode);
      await tx.stokLapisan.createMany({
        data: naik.map((r) => {
          const qty = r.stokSesudah - r.stokSebelum;
          return { itemId: r.itemId, qtyAwal: qty, sisaQty: qty, harga: r.hargaLapisan!, tanggal: tanggalLapisan, sumber: "baseline" };
        }),
      });
    }
    const konsumsi = await konsumsiLapisan(
      tx,
      turun.map((r) => ({
        itemId: r.itemId,
        qty: r.stokSebelum - r.stokSesudah,
        hargaDefault: r.hargaMaster,
        stokSebelum: r.stokSebelum,
      }))
    );

    // 3) Movement (satu per barang yang berubah).
    const dibuat = await tx.stockMovement.createManyAndReturn({
      data: berubah.map((r) => {
        const selisih = r.stokSesudah - r.stokSebelum;
        const qty = Math.abs(selisih);
        const k = konsumsi.get(r.itemId);
        const harga = selisih > 0 ? r.hargaLapisan! : k!.hargaRata;
        const nilai = selisih > 0 ? hitungNilai(qty, harga) : k!.nilai;
        return {
          itemId: r.itemId,
          tipe: selisih > 0 ? TipeStockMovement.penyesuaian_plus : TipeStockMovement.penyesuaian_minus,
          qty,
          sumber: "baseline",
          hargaSaatTransaksi: harga,
          nilai,
          catatan: `Stok awal periode ${periode}: sistem ${r.stokSebelum} diselaraskan ke ${r.stokAwal} (+ mutasi bulan berjalan ${r.mutasiBerjalan}).`,
          dibuatOlehId,
        };
      }),
      select: { id: true, itemId: true },
    });

    // 4) Catat lapisan mana yang dipakai oleh penyesuaian kurang.
    const idMovement = new Map(dibuat.map((d) => [d.itemId, d.id]));
    const pemakaian = turun.flatMap((r) =>
      (konsumsi.get(r.itemId)?.rincian ?? []).map((x) => ({
        movementId: idMovement.get(r.itemId)!,
        lapisanId: x.lapisanId,
        qty: x.qty,
        harga: x.harga,
      }))
    );
    if (pemakaian.length > 0) await tx.lapisanPemakaian.createMany({ data: pemakaian });
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
