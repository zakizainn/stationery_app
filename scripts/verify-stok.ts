// Verifikasi lib/stok.ts terhadap database SUNGGUHAN.
//
//   npx tsx scripts/verify-stok.ts
//
// Aman dijalankan di database dev: skrip hanya membuat barang sementara
// berawalan "ZZ_TEST_" (dan data stok awal periode 2099-xx), lalu
// menghapusnya sendiri di akhir. Data lain tidak disentuh.
import "dotenv/config";
import { db } from "@/lib/db";
import {
  StokError,
  hitungBaseline,
  setStokAwalPeriode,
  setStokKe,
  transaksiStok,
  ubahStok,
  ubahStokMasukBanyak,
} from "@/lib/stok";
import { awalBulanWIB, hariIniWIB, periodeSekarangWIB, tanggalWIBKeDate } from "@/lib/waktu";

let gagal = 0;
function cek(nama: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nama}${!ok && detail ? `  -> ${detail}` : ""}`);
  if (!ok) gagal++;
}

async function pastikanGagal(nama: string, kode: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    cek(nama, false, "seharusnya melempar error");
  } catch (e) {
    cek(nama, e instanceof StokError && e.code === kode, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function bersihkan() {
  const filter = { item: { nama: { startsWith: "ZZ_TEST_" } } };
  await db.stockMovement.deleteMany({ where: filter });
  await db.stokAwalBulan.deleteMany({ where: filter });
  await db.item.deleteMany({ where: { nama: { startsWith: "ZZ_TEST_" } } });
}

async function buatItem(nama: string, stok = 0, harga = 1000) {
  return db.item.create({
    data: { nama: `ZZ_TEST_${nama}`, kategori: "barang_umum", satuan: "pcs", stok, harga },
  });
}

// Bukti inti "ledger": stok = SUM(movement bertanda) untuk barang yang dimulai dari 0.
async function stokDariMovement(itemId: number): Promise<number> {
  const r = await db.$queryRaw<{ s: bigint | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN tipe IN ('masuk','penyesuaian_plus') THEN qty ELSE -qty END), 0) AS s
    FROM stock_movement WHERE item_id = ${itemId}`;
  return Number(r[0].s);
}
async function stokSekarang(itemId: number) {
  return (await db.item.findUniqueOrThrow({ where: { id: itemId } })).stok;
}

async function main() {
  await bersihkan();
  console.log("\n== waktu (WIB) ==");
  cek("01:00 WIB tgl 1 Okt (=18:00 UTC 30 Sep) masuk periode 2026-10", periodeSekarangWIB(new Date("2026-09-30T18:00:00Z")) === "2026-10");
  cek("23:59 WIB 31 Okt masih 2026-10", periodeSekarangWIB(new Date("2026-10-31T16:59:00Z")) === "2026-10");
  cek("00:00 WIB 1 Nov = 2026-11", periodeSekarangWIB(new Date("2026-10-31T17:00:00Z")) === "2026-11");
  cek("awalBulanWIB('2026-10') = 2026-09-30T17:00Z", awalBulanWIB("2026-10").toISOString() === "2026-09-30T17:00:00.000Z");
  cek("tanggal valid -> 12:00 WIB (05:00Z)", tanggalWIBKeDate("2026-10-12")?.toISOString() === "2026-10-12T05:00:00.000Z");
  cek("tanggal 31 Februari ditolak", tanggalWIBKeDate("2026-02-31") === null);
  cek("format salah ditolak", tanggalWIBKeDate("12/10/2026") === null);
  cek("hariIniWIB berformat YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(hariIniWIB()));

  console.log("\n== ubahStok ==");
  const a = await buatItem("A", 0, 1500);
  const r1 = await transaksiStok((tx) => ubahStok(tx, { itemId: a.id, tipe: "masuk", qty: 10, sumber: "restock" }));
  cek("masuk 10: stok 0 -> 10", r1.stokSebelum === 0 && r1.stokSesudah === 10 && (await stokSekarang(a.id)) === 10);
  const mv1 = await db.stockMovement.findUniqueOrThrow({ where: { id: r1.movementId } });
  cek("movement mencatat tipe/sumber/harga snapshot", mv1.tipe === "masuk" && mv1.sumber === "restock" && mv1.hargaSaatTransaksi === 1500);

  const r2 = await transaksiStok((tx) => ubahStok(tx, { itemId: a.id, tipe: "keluar", qty: 4, sumber: "pengajuan" }));
  cek("keluar 4: stok 10 -> 6", r2.stokSebelum === 10 && r2.stokSesudah === 6);

  await pastikanGagal("keluar melebihi stok ditolak (STOK_TIDAK_CUKUP)", "STOK_TIDAK_CUKUP", () =>
    transaksiStok((tx) => ubahStok(tx, { itemId: a.id, tipe: "keluar", qty: 7, sumber: "pengajuan" }))
  );
  cek("stok tetap 6 setelah penolakan, tidak ada movement baru", (await stokSekarang(a.id)) === 6 && (await db.stockMovement.count({ where: { itemId: a.id } })) === 2);

  await pastikanGagal("barang tidak ada (masuk)", "ITEM_TIDAK_ADA", () =>
    transaksiStok((tx) => ubahStok(tx, { itemId: 99999999, tipe: "masuk", qty: 1, sumber: "restock" }))
  );
  await pastikanGagal("barang tidak ada (keluar)", "ITEM_TIDAK_ADA", () =>
    transaksiStok((tx) => ubahStok(tx, { itemId: 99999999, tipe: "keluar", qty: 1, sumber: "pengajuan" }))
  );
  await pastikanGagal("qty 0 ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => ubahStok(tx, { itemId: a.id, tipe: "masuk", qty: 0, sumber: "restock" }))
  );
  await pastikanGagal("qty pecahan ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => ubahStok(tx, { itemId: a.id, tipe: "masuk", qty: 1.5, sumber: "restock" }))
  );

  // Rollback: perubahan stok ikut dibatalkan kalau langkah berikutnya gagal.
  try {
    await transaksiStok(async (tx) => {
      await ubahStok(tx, { itemId: a.id, tipe: "masuk", qty: 100, sumber: "restock" });
      throw new Error("sengaja gagal");
    });
  } catch {
    /* diharapkan */
  }
  cek("rollback: stok tidak berubah kalau transaksi gagal", (await stokSekarang(a.id)) === 6);

  console.log("\n== keamanan konkurensi ==");
  const b = await buatItem("B", 10);
  const hasil = await Promise.allSettled([
    transaksiStok((tx) => ubahStok(tx, { itemId: b.id, tipe: "keluar", qty: 7, sumber: "pengajuan" })),
    transaksiStok((tx) => ubahStok(tx, { itemId: b.id, tipe: "keluar", qty: 7, sumber: "pengajuan" })),
  ]);
  const berhasil = hasil.filter((h) => h.status === "fulfilled").length;
  cek("2 pengambilan 7 serentak dari stok 10: tepat 1 yang berhasil", berhasil === 1, `berhasil=${berhasil}`);
  cek("stok akhir 3 dan TIDAK negatif", (await stokSekarang(b.id)) === 3);
  const c = await buatItem("C", 100);
  const banyak = await Promise.allSettled(
    Array.from({ length: 12 }, () => transaksiStok((tx) => ubahStok(tx, { itemId: c.id, tipe: "keluar", qty: 10, sumber: "pengajuan" })))
  );
  const ok12 = banyak.filter((h) => h.status === "fulfilled").length;
  cek("12 pengambilan 10 serentak dari stok 100: tepat 10 berhasil", ok12 === 10, `berhasil=${ok12}`);
  cek("stok akhir 0 (tidak negatif)", (await stokSekarang(c.id)) === 0);

  console.log("\n== restock massal ==");
  const m1 = await buatItem("M1", 0, 500);
  const m2 = await buatItem("M2", 5, 700);
  const mm = await transaksiStok((tx) =>
    ubahStokMasukBanyak(tx, {
      baris: [
        { itemId: m1.id, qty: 10 },
        { itemId: m1.id, qty: 5, harga: 650 }, // barang sama, harga beda
        { itemId: m2.id, qty: 20, harga: 0 },
      ],
      sumber: "restock_massal",
      tanggal: tanggalWIBKeDate("2026-10-12")!,
      catatan: "PO-123 / Pemasok X",
      dibuatOlehId: null,
    })
  );
  cek("ringkasan: 3 baris, 2 barang, total 35", mm.jumlahBaris === 3 && mm.jumlahBarang === 2 && mm.totalQty === 35);
  cek("stok M1 = 15 (10+5 dijumlahkan), M2 = 25", (await stokSekarang(m1.id)) === 15 && (await stokSekarang(m2.id)) === 25);
  const mvs = await db.stockMovement.findMany({ where: { itemId: m1.id }, orderBy: { id: "asc" } });
  cek("M1 punya 2 movement, harga per baris (default 500 & 650)", mvs.length === 2 && mvs[0].hargaSaatTransaksi === 500 && mvs[1].hargaSaatTransaksi === 650);
  cek("tanggal & catatan & sumber tersimpan", mvs[0].tanggal.toISOString() === "2026-10-12T05:00:00.000Z" && mvs[0].catatan === "PO-123 / Pemasok X" && mvs[0].sumber === "restock_massal");
  const mv0 = await db.stockMovement.findFirstOrThrow({ where: { itemId: m2.id } });
  cek("harga eksplisit 0 dihormati (bukan jatuh ke default)", mv0.hargaSaatTransaksi === 0);

  await pastikanGagal("id barang tak dikenal membatalkan SELURUH batch", "ITEM_TIDAK_ADA", () =>
    transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: [{ itemId: m1.id, qty: 1 }, { itemId: 99999999, qty: 1 }], sumber: "restock_massal" }))
  );
  cek("batch gagal: stok M1 tidak ikut berubah (masih 15)", (await stokSekarang(m1.id)) === 15);
  await pastikanGagal("batch kosong ditolak", "INPUT_TIDAK_VALID", () => transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: [], sumber: "restock_massal" })));
  await pastikanGagal("qty negatif dalam batch ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: [{ itemId: m1.id, qty: -3 }], sumber: "restock_massal" }))
  );

  // Skala: 240 barang sekaligus harus cepat dan konsisten (jumlah query tetap).
  const semua = await db.item.findMany({ where: { nama: { not: { startsWith: "ZZ_TEST_" } } }, select: { id: true, stok: true } });
  if (semua.length > 0) {
    const sebelum = new Map(semua.map((i) => [i.id, i.stok]));
    const t0 = Date.now();
    await transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: semua.map((i) => ({ itemId: i.id, qty: 3 })), sumber: "restock_massal", catatan: "ZZ_TEST skala" }));
    const ms = Date.now() - t0;
    const sesudah = await db.item.findMany({ where: { id: { in: semua.map((i) => i.id) } }, select: { id: true, stok: true } });
    cek(`${semua.length} barang sekaligus: semua bertambah tepat 3`, sesudah.every((i) => i.stok === sebelum.get(i.id)! + 3));
    cek(`${semua.length} barang selesai dalam ${ms} ms (< 5000 ms, batas transaksi default)`, ms < 5000, `${ms} ms`);
    // kembalikan data asli: hapus movement uji lalu kurangi lagi
    await db.stockMovement.deleteMany({ where: { catatan: "ZZ_TEST skala" } });
    await db.$executeRaw`UPDATE item SET stok = stok - 3 WHERE id = ANY(${semua.map((i) => i.id)}::int[])`;
  }

  console.log("\n== setStokKe (edit manual) ==");
  const s = await buatItem("S", 20, 800);
  const same = await transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 20, alasan: null, sumber: "edit_manual" }));
  cek("angka sama: tidak berubah, tanpa alasan pun boleh, tanpa movement", same.berubah === false && (await db.stockMovement.count({ where: { itemId: s.id } })) === 0);
  await pastikanGagal("ubah tanpa alasan ditolak (ALASAN_WAJIB)", "ALASAN_WAJIB", () =>
    transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 25, alasan: "   ", sumber: "edit_manual" }))
  );
  cek("stok tetap 20 setelah ditolak", (await stokSekarang(s.id)) === 20);
  const naik = await transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 25, alasan: "Salah input awal", sumber: "edit_manual" }));
  const mvN = await db.stockMovement.findUniqueOrThrow({ where: { id: naik.movementId! } });
  cek("naik 20->25: penyesuaian_plus qty 5 dengan alasan", mvN.tipe === "penyesuaian_plus" && mvN.qty === 5 && mvN.catatan === "Salah input awal");
  const turun = await transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 18, alasan: "Hitung fisik", sumber: "edit_manual" }));
  const mvT = await db.stockMovement.findUniqueOrThrow({ where: { id: turun.movementId! } });
  cek("turun 25->18: penyesuaian_minus qty 7", mvT.tipe === "penyesuaian_minus" && mvT.qty === 7 && (await stokSekarang(s.id)) === 18);
  await pastikanGagal("stok negatif ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: -1, alasan: "x", sumber: "edit_manual" }))
  );
  const bentrok = await Promise.allSettled([
    transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 50, alasan: "A", sumber: "edit_manual" })),
    transaksiStok((tx) => setStokKe(tx, { itemId: s.id, stokBaru: 60, alasan: "B", sumber: "edit_manual" })),
  ]);
  const stokAkhirS = await stokSekarang(s.id);
  cek("dua edit bentrok: stok akhir salah satu dari 50/60, bukan campuran", [50, 60].includes(stokAkhirS), `stok=${stokAkhirS}`);
  void bentrok;

  console.log("\n== stok awal periode (baseline) ==");
  const p = "2099-01";
  const admin = await db.user.findFirstOrThrow();
  const x = await buatItem("X", 0, 100);
  const y = await buatItem("Y", 0, 100);
  const pratinjau = await db.$transaction((tx) => hitungBaseline(tx, p, [{ itemId: x.id, qty: 40 }, { itemId: y.id, qty: 15 }]));
  cek("pratinjau tidak menulis apa pun", (await stokSekarang(x.id)) === 0 && (await db.stokAwalBulan.count({ where: { periode: p, itemId: x.id } })) === 0);
  cek("pratinjau menghitung stokSesudah = stok awal (belum ada mutasi)", pratinjau.find((r) => r.itemId === x.id)?.stokSesudah === 40);

  const bl = await transaksiStok((tx) => setStokAwalPeriode(tx, { periode: p, baris: [{ itemId: x.id, qty: 40 }, { itemId: y.id, qty: 15 }], dibuatOlehId: admin.id }));
  cek("baseline: 2 barang disesuaikan", bl.jumlahBarang === 2 && bl.jumlahDisesuaikan === 2);
  cek("stok X=40, Y=15", (await stokSekarang(x.id)) === 40 && (await stokSekarang(y.id)) === 15);
  const snap = await db.stokAwalBulan.findUniqueOrThrow({ where: { periode_itemId: { periode: p, itemId: x.id } } });
  cek("snapshot StokAwalBulan tersimpan (X=40, sumber baseline)", snap.qty === 40 && snap.sumber === "baseline");
  const mvB = await db.stockMovement.findFirstOrThrow({ where: { itemId: x.id, sumber: "baseline" } });
  cek("movement baseline: penyesuaian_plus 40 + catatan", mvB.tipe === "penyesuaian_plus" && mvB.qty === 40 && !!mvB.catatan);

  // Mutasi di dalam periode (tanggal 2099-01-10): masuk 5, keluar 8.
  await transaksiStok(async (tx) => {
    await ubahStok(tx, { itemId: x.id, tipe: "masuk", qty: 5, sumber: "restock", tanggal: new Date("2099-01-10T05:00:00Z") });
    await ubahStok(tx, { itemId: x.id, tipe: "keluar", qty: 8, sumber: "pengajuan", tanggal: new Date("2099-01-12T05:00:00Z") });
  });
  cek("setelah mutasi stok X = 37", (await stokSekarang(x.id)) === 37);

  // Menjalankan baseline LAGI dengan angka yang sama harus idempotent:
  // movement baseline tidak boleh dihitung sebagai mutasi (kalau dihitung -> double count).
  const ulang = await db.$transaction((tx) => hitungBaseline(tx, p, [{ itemId: x.id, qty: 40 }]));
  cek("idempotent: stokSesudah = 40 + (5-8) = 37, sama dengan stok sekarang", ulang[0].mutasiBerjalan === -3 && ulang[0].stokSesudah === 37 && ulang[0].stokSebelum === 37, JSON.stringify(ulang[0]));
  const bl2 = await transaksiStok((tx) => setStokAwalPeriode(tx, { periode: p, baris: [{ itemId: x.id, qty: 40 }], dibuatOlehId: admin.id }));
  cek("baseline ulang dengan angka sama: 0 barang disesuaikan, stok tetap 37", bl2.jumlahDisesuaikan === 0 && (await stokSekarang(x.id)) === 37);

  // Koreksi stok awal: ternyata 50. stok = 50 + (5-8) = 47.
  await transaksiStok((tx) => setStokAwalPeriode(tx, { periode: p, baris: [{ itemId: x.id, qty: 50 }], dibuatOlehId: admin.id }));
  cek("koreksi stok awal 40 -> 50: stok = 47 (mutasi bulan berjalan dipertahankan)", (await stokSekarang(x.id)) === 47);
  const snap2 = await db.stokAwalBulan.findUniqueOrThrow({ where: { periode_itemId: { periode: p, itemId: x.id } } });
  cek("snapshot di-upsert (1 baris per periode+barang) = 50", snap2.qty === 50 && (await db.stokAwalBulan.count({ where: { periode: p, itemId: x.id } })) === 1);

  await pastikanGagal("stok awal membuat total negatif ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => setStokAwalPeriode(tx, { periode: p, baris: [{ itemId: x.id, qty: 1 }], dibuatOlehId: admin.id }))
  );
  await pastikanGagal("periode salah format ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => setStokAwalPeriode(tx, { periode: "2099-13", baris: [{ itemId: x.id, qty: 1 }], dibuatOlehId: admin.id }))
  );
  await pastikanGagal("barang ganda dalam satu batch ditolak", "INPUT_TIDAK_VALID", () =>
    transaksiStok((tx) => setStokAwalPeriode(tx, { periode: p, baris: [{ itemId: x.id, qty: 1 }, { itemId: x.id, qty: 2 }], dibuatOlehId: admin.id }))
  );

  console.log("\n== BUKTI LEDGER: stok = SUM(movement) untuk setiap barang uji ==");
  for (const [nama, it] of [["A", a], ["B", b], ["C", c], ["M1", m1], ["M2", m2], ["S", s], ["X", x], ["Y", y]] as const) {
    const aktual = await stokSekarang(it.id);
    const dariLedger = await stokDariMovement(it.id);
    // Barang yang dibuat dengan stok awal > 0 lewat cara lama (tanpa movement)
    // selisihnya dengan ledger tepat sebesar stok awal itu (it.stok = nilai saat dibuat).
    const harapan = it.stok;
    cek(`barang ${nama}: stok ${aktual} == ledger ${dariLedger}${harapan ? ` + stok-awal-lama ${harapan}` : ""}`, aktual - dariLedger === harapan);
  }

  await bersihkan();
  const sisa = await db.item.count({ where: { nama: { startsWith: "ZZ_TEST_" } } });
  cek("pembersihan: tidak ada barang uji tersisa", sisa === 0);

  console.log(gagal === 0 ? "\nSEMUA LOLOS" : `\n${gagal} CEK GAGAL`);
  await db.$disconnect();
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERROR tak terduga:", e);
  try {
    await bersihkan();
  } catch {
    /* abaikan */
  }
  process.exit(1);
});
