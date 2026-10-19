// Verifikasi logika FIFO (lib/stok.ts) terhadap database SUNGGUHAN.
//
//   npx tsx scripts/verify-fifo.ts
//
// Aman dijalankan di database dev: hanya membuat barang sementara berawalan
// "ZZ_FIFO_" (dan stok awal periode 2099-xx), lalu menghapusnya sendiri.
import "dotenv/config";
import { db } from "@/lib/db";
import { nilaiMovement } from "@/lib/laporan-nilai";
import { lapisanAktifItem, nilaiPersediaan, periksaKonsistensiLapisan, persediaanPada } from "@/lib/persediaan";
import {
  StokError,
  setStokAwalPeriode,
  setStokKe,
  transaksiStok,
  ubahStok,
  ubahStokMasukBanyak,
} from "@/lib/stok";
import { tanggalWIBKeDate } from "@/lib/waktu";

let gagal = 0;
function cek(nama: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nama}${!ok && detail !== undefined ? `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`);
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

const PREFIX = "ZZ_FIFO_";
async function bersihkan() {
  const filter = { item: { nama: { startsWith: PREFIX } } };
  await db.lapisanPemakaian.deleteMany({ where: { movement: filter } });
  await db.stockMovement.deleteMany({ where: filter });
  await db.stokLapisan.deleteMany({ where: filter });
  await db.stokAwalBulan.deleteMany({ where: filter });
  await db.item.deleteMany({ where: { nama: { startsWith: PREFIX } } });
}

const buatItem = (nama: string, harga: number, stok = 0) =>
  db.item.create({ data: { nama: `${PREFIX}${nama}`, kategori: "barang_umum", satuan: "pcs", harga, stok } });
const stokDb = async (id: number) => (await db.item.findUniqueOrThrow({ where: { id } })).stok;
const layers = (id: number) => db.stokLapisan.findMany({ where: { itemId: id }, orderBy: [{ tanggal: "asc" }, { id: "asc" }] });
const aktif = async (id: number) => (await layers(id)).filter((l) => l.sisaQty > 0).map((l) => `${l.sisaQty}@${l.harga}`);
const D = (t: string) => tanggalWIBKeDate(t)!;

// Aturan tetap + konservasi: stok == SUM(sisa); tiap lapisan: qtyAwal - sisa == SUM(pemakaian); sisa >= 0.
async function invarian(label: string, id: number) {
  const ls = await layers(id);
  const sum = ls.reduce((s, l) => s + l.sisaQty, 0);
  const stok = await stokDb(id);
  cek(`[${label}] invarian: stok (${stok}) == SUM sisa lapisan (${sum})`, stok === sum, { stok, sum });
  const pem = await db.lapisanPemakaian.groupBy({ by: ["lapisanId"], where: { lapisan: { itemId: id } }, _sum: { qty: true } });
  const dipakai = new Map(pem.map((p) => [p.lapisanId, p._sum.qty ?? 0]));
  const rusak = ls.filter((l) => l.sisaQty < 0 || l.qtyAwal - l.sisaQty !== (dipakai.get(l.id) ?? 0));
  cek(`[${label}] konservasi: tiap lapisan qtyAwal - sisa == total pemakaian, tidak ada sisa negatif`, rusak.length === 0, rusak);
}

async function main() {
  await bersihkan();

  console.log("\n== 1. Skenario inti: stok lama Rp 3.000, restock Rp 3.500, pemakaian 25 ==");
  const A = await buatItem("A", 3000);
  await transaksiStok((tx) => ubahStok(tx, { itemId: A.id, tipe: "masuk", qty: 10, sumber: "restock", harga: 3000, tanggal: D("2026-10-01") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: A.id, tipe: "masuk", qty: 20, sumber: "restock", harga: 3500, tanggal: D("2026-10-10") }));
  cek("2 lapisan terbentuk: 10@3000 (lama) dan 20@3500 (baru)", JSON.stringify(await aktif(A.id)) === JSON.stringify(["10@3000", "20@3500"]), await aktif(A.id));
  const out1 = await transaksiStok((tx) => ubahStok(tx, { itemId: A.id, tipe: "keluar", qty: 25, sumber: "pengajuan" }));
  cek("keluar 25: nilai = 10x3000 + 15x3500 = Rp 82.500", out1.nilai === 82500, out1.nilai);
  const mv1 = await db.stockMovement.findUniqueOrThrow({ where: { id: out1.movementId }, include: { lapisanPemakaian: true } });
  cek("movement menyimpan nilai beku 82.500 dan harga rata-rata 3.300", mv1.nilai === 82500 && mv1.hargaSaatTransaksi === 3300, { n: mv1.nilai, h: mv1.hargaSaatTransaksi });
  const pm = mv1.lapisanPemakaian.map((p) => `${p.qty}@${p.harga}`).sort();
  cek("rincian pemakaian: 10@3000 + 15@3500", JSON.stringify(pm) === JSON.stringify(["10@3000", "15@3500"]), pm);
  cek("sisa lapisan: 5@3500, stok 5", JSON.stringify(await aktif(A.id)) === JSON.stringify(["5@3500"]) && (await stokDb(A.id)) === 5);
  const pers1 = (await nilaiPersediaan([A.id])).get(A.id);
  cek("nilai persediaan FIFO = 5 x 3.500 = Rp 17.500 (bukan 5 x harga master)", pers1?.nilai === 17500 && pers1?.qty === 5, pers1);
  await invarian("A", A.id);

  console.log("\n== 2. Nilai dibekukan: harga master berubah tidak memengaruhi yang sudah tercatat ==");
  await db.item.update({ where: { id: A.id }, data: { harga: 5000 } });
  const mv1b = await db.stockMovement.findUniqueOrThrow({ where: { id: out1.movementId } });
  cek("setelah harga master jadi 5.000, nilai movement lama tetap 82.500", mv1b.nilai === 82500);
  cek("nilai persediaan tetap 17.500 (lapisan membawa harganya sendiri)", (await nilaiPersediaan([A.id])).get(A.id)?.nilai === 17500);
  const out2 = await transaksiStok((tx) => ubahStok(tx, { itemId: A.id, tipe: "keluar", qty: 5, sumber: "pengajuan" }));
  cek("keluar 5 berikutnya: 5 x 3.500 = Rp 17.500 (BUKAN 5 x 5.000)", out2.nilai === 17500, out2.nilai);
  cek("semua lapisan habis, nilai persediaan 0", (await aktif(A.id)).length === 0 && ((await nilaiPersediaan([A.id])).get(A.id)?.nilai ?? 0) === 0);
  await invarian("A-habis", A.id);
  await pastikanGagal("keluar saat stok 0 ditolak", "STOK_TIDAK_CUKUP", () => transaksiStok((tx) => ubahStok(tx, { itemId: A.id, tipe: "keluar", qty: 1, sumber: "pengajuan" })));

  console.log("\n== 3. Urutan FIFO: berdasarkan TANGGAL lapisan, bukan urutan input ==");
  const B = await buatItem("B", 1000);
  await transaksiStok((tx) => ubahStok(tx, { itemId: B.id, tipe: "masuk", qty: 10, sumber: "restock", harga: 4000, tanggal: D("2026-10-10") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: B.id, tipe: "masuk", qty: 10, sumber: "restock", harga: 3000, tanggal: D("2026-10-05") })); // dicatat belakangan, tanggal lebih lama
  const outB = await transaksiStok((tx) => ubahStok(tx, { itemId: B.id, tipe: "keluar", qty: 10, sumber: "pengajuan" }));
  cek("lapisan bertanggal 5 Okt (3.000) dipakai lebih dulu: nilai 10 x 3.000 = 30.000", outB.nilai === 30000, outB.nilai);
  cek("sisa: 10@4000", JSON.stringify(await aktif(B.id)) === JSON.stringify(["10@4000"]));
  const C = await buatItem("C", 1000);
  await transaksiStok((tx) => ubahStok(tx, { itemId: C.id, tipe: "masuk", qty: 5, sumber: "restock", harga: 100, tanggal: D("2026-10-05") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: C.id, tipe: "masuk", qty: 5, sumber: "restock", harga: 200, tanggal: D("2026-10-05") }));
  const outC = await transaksiStok((tx) => ubahStok(tx, { itemId: C.id, tipe: "keluar", qty: 5, sumber: "pengajuan" }));
  cek("tanggal sama: yang dicatat lebih dulu (id kecil) dipakai dulu -> 5 x 100", outC.nilai === 500, outC.nilai);
  await invarian("B", B.id);
  await invarian("C", C.id);

  console.log("\n== 4. Pembulatan harga rata-rata ==");
  const R = await buatItem("R", 1);
  await transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: [{ itemId: R.id, qty: 10, harga: 3000 }, { itemId: R.id, qty: 10, harga: 3500 }], sumber: "restock_massal" }));
  const outR = await transaksiStok((tx) => ubahStok(tx, { itemId: R.id, tipe: "keluar", qty: 15, sumber: "pengajuan" }));
  const mvR = await db.stockMovement.findUniqueOrThrow({ where: { id: outR.movementId } });
  cek("nilai 10x3000 + 5x3500 = 47.500; harga rata-rata 3.167 (dibulatkan dari 3.166,67)", outR.nilai === 47500 && mvR.hargaSaatTransaksi === 3167, { n: outR.nilai, h: mvR.hargaSaatTransaksi });

  console.log("\n== 5. Restock massal: baris berbeda harga = lapisan berbeda ==");
  const M = await buatItem("M", 1);
  const bulk = await transaksiStok((tx) =>
    ubahStokMasukBanyak(tx, { baris: [{ itemId: M.id, qty: 10, harga: 100 }, { itemId: M.id, qty: 10, harga: 200 }, { itemId: M.id, qty: 4 }], sumber: "restock_massal", tanggal: D("2026-10-06") })
  );
  cek("ringkasan: 3 baris, total qty 24, total nilai 10x100 + 10x200 + 4x1 = 3.004", bulk.jumlahBaris === 3 && bulk.totalQty === 24 && bulk.totalNilai === 3004, bulk);
  cek("3 lapisan: 10@100, 10@200, 4@1 (harga master untuk baris tanpa harga)", JSON.stringify(await aktif(M.id)) === JSON.stringify(["10@100", "10@200", "4@1"]), await aktif(M.id));
  const outM = await transaksiStok((tx) => ubahStok(tx, { itemId: M.id, tipe: "keluar", qty: 15, sumber: "pengajuan" }));
  cek("keluar 15 menembus 2 lapisan: 10x100 + 5x200 = 2.000", outM.nilai === 2000, outM.nilai);
  await invarian("M", M.id);

  console.log("\n== 6. Koreksi stok: kurang = lapisan terlama, lebih = lapisan baru harga master ==");
  const S = await buatItem("S", 3100);
  await transaksiStok((tx) => ubahStokMasukBanyak(tx, { baris: [{ itemId: S.id, qty: 10, harga: 3000 }, { itemId: S.id, qty: 10, harga: 3500 }], sumber: "restock_massal", tanggal: D("2026-10-02") }));
  const kurang = await transaksiStok((tx) => setStokKe(tx, { itemId: S.id, stokBaru: 15, alasan: "Hasil hitung fisik", sumber: "edit_manual" }));
  cek("stok 20 -> 15 (kurang 5): nilai selisih 5 x 3.000 = Rp 15.000 (dari lapisan terlama)", kurang.nilai === 15000, kurang.nilai);
  cek("sisa lapisan: 5@3000, 10@3500", JSON.stringify(await aktif(S.id)) === JSON.stringify(["5@3000", "10@3500"]), await aktif(S.id));
  const mvK = await db.stockMovement.findUniqueOrThrow({ where: { id: kurang.movementId! }, include: { lapisanPemakaian: true } });
  cek("movement penyesuaian_minus mencatat lapisan yang dipakai", mvK.tipe === "penyesuaian_minus" && mvK.lapisanPemakaian.length === 1 && mvK.lapisanPemakaian[0].harga === 3000 && mvK.nilai === 15000);
  const lebih = await transaksiStok((tx) => setStokKe(tx, { itemId: S.id, stokBaru: 20, alasan: "Ditemukan 5 unit", sumber: "edit_manual" }));
  cek("stok 15 -> 20 (lebih 5): lapisan baru 5 @ harga master 3.100, nilai Rp 15.500", lebih.nilai === 15500 && (await aktif(S.id)).at(-1) === "5@3100", await aktif(S.id));
  const lMovePlus = await db.stockMovement.findUniqueOrThrow({ where: { id: lebih.movementId! } });
  cek("movement penyesuaian_plus bernilai 15.500", lMovePlus.tipe === "penyesuaian_plus" && lMovePlus.nilai === 15500);
  const adj = await transaksiStok((tx) => ubahStok(tx, { itemId: S.id, tipe: "penyesuaian_minus", qty: 8, sumber: "sto", catatan: "uji" }));
  cek("penyesuaian_minus langsung 8: 5x3000 + 3x3500 = 25.500", adj.nilai === 25500, adj.nilai);
  await invarian("S", S.id);

  console.log("\n== 7. Stok awal periode (baseline) dengan HARGA ==");
  const periode = "2099-01";
  const admin = await db.user.findFirstOrThrow();
  const Z = await buatItem("Z", 2000);
  const b1 = await transaksiStok((tx) => setStokAwalPeriode(tx, { periode, baris: [{ itemId: Z.id, qty: 40, harga: 3200 }], dibuatOlehId: admin.id }));
  cek("baseline 40 dengan HARGA 3.200 -> 1 lapisan 40@3200", b1.jumlahDisesuaikan === 1 && JSON.stringify(await aktif(Z.id)) === JSON.stringify(["40@3200"]), await aktif(Z.id));
  const lb = (await layers(Z.id))[0];
  cek("lapisan baseline bertanggal awal periode (1 Jan 2099 00:00 WIB) dan bersumber baseline", lb.tanggal.toISOString() === "2098-12-31T17:00:00.000Z" && lb.sumber === "baseline", lb);
  const mvB1 = await db.stockMovement.findFirstOrThrow({ where: { itemId: Z.id, sumber: "baseline" } });
  cek("movement baseline bernilai 40 x 3.200 = 128.000", mvB1.nilai === 128000 && mvB1.tipe === "penyesuaian_plus");
  await transaksiStok((tx) => setStokAwalPeriode(tx, { periode, baris: [{ itemId: Z.id, qty: 30 }], dibuatOlehId: admin.id }));
  cek("koreksi turun ke 30: 10 diambil dari lapisan terlama -> 30@3200", JSON.stringify(await aktif(Z.id)) === JSON.stringify(["30@3200"]), await aktif(Z.id));
  const mvB2 = (await db.stockMovement.findMany({ where: { itemId: Z.id, sumber: "baseline" }, orderBy: { id: "asc" } })).at(-1)!;
  cek("penyesuaian turun bernilai 10 x 3.200 = 32.000", mvB2.tipe === "penyesuaian_minus" && mvB2.nilai === 32000, mvB2);
  await transaksiStok((tx) => setStokAwalPeriode(tx, { periode, baris: [{ itemId: Z.id, qty: 50 }], dibuatOlehId: admin.id }));
  cek("naik ke 50 TANPA harga: 20 unit di harga master 2.000", JSON.stringify(await aktif(Z.id)) === JSON.stringify(["30@3200", "20@2000"]), await aktif(Z.id));
  await transaksiStok((tx) => setStokAwalPeriode(tx, { periode, baris: [{ itemId: Z.id, qty: 50 }], dibuatOlehId: admin.id }));
  cek("baseline ulang angka sama: tidak ada lapisan baru (idempotent)", (await layers(Z.id)).length === 2, (await layers(Z.id)).length);
  await invarian("Z", Z.id);

  console.log("\n== 8. Penyembuhan data lama (stok ada tapi lapisan tidak) ==");
  const H = await buatItem("H", 1000, 8); // dibuat langsung dengan stok 8 TANPA lapisan (cara lama)
  const awalDrift = (await periksaKonsistensiLapisan()).some((k) => k.itemId === H.id);
  cek("pemeriksa konsistensi mendeteksi ketidaksesuaian (stok 8, lapisan 0)", awalDrift);
  const outH = await transaksiStok((tx) => ubahStok(tx, { itemId: H.id, tipe: "keluar", qty: 5, sumber: "pengajuan" }));
  cek("keluar 5 tetap berhasil: dinilai harga master 5 x 1.000 = 5.000", outH.nilai === 5000, outH.nilai);
  cek("lapisan penyeimbang membentuk SELURUH 8 unit; sisa 3@1000 (invarian pulih)", JSON.stringify(await aktif(H.id)) === JSON.stringify(["3@1000"]) && (await stokDb(H.id)) === 3, await aktif(H.id));
  cek("sumber lapisan 'penyeimbang'", (await layers(H.id))[0].sumber === "penyeimbang");
  await invarian("H", H.id);
  const H2 = await buatItem("H2", 700, 6);
  const sk = await transaksiStok((tx) => setStokKe(tx, { itemId: H2.id, stokBaru: 2, alasan: "uji", sumber: "edit_manual" }));
  cek("setStokKe turun pada data lama: 4 x 700 = 2.800, sisa 2@700", sk.nilai === 2800 && JSON.stringify(await aktif(H2.id)) === JSON.stringify(["2@700"]), { n: sk.nilai, a: await aktif(H2.id) });
  await invarian("H2", H2.id);

  console.log("\n== 9. Batas & pembatalan ==");
  const L = await buatItem("L", 1000);
  await pastikanGagal("nilai > Rp 2,1 miliar ditolak", "INPUT_TIDAK_VALID", () => transaksiStok((tx) => ubahStok(tx, { itemId: L.id, tipe: "masuk", qty: 3000, harga: 1_000_000, sumber: "restock" })));
  cek("ditolak -> stok tetap 0 dan tidak ada lapisan", (await stokDb(L.id)) === 0 && (await layers(L.id)).length === 0);
  await transaksiStok((tx) => ubahStok(tx, { itemId: L.id, tipe: "masuk", qty: 10, harga: 100, sumber: "restock" }));
  try {
    await transaksiStok(async (tx) => {
      await ubahStok(tx, { itemId: L.id, tipe: "keluar", qty: 7, sumber: "pengajuan" });
      throw new Error("sengaja gagal");
    });
  } catch {
    /* diharapkan */
  }
  cek("rollback: stok kembali 10 dan lapisan kembali 10@100", (await stokDb(L.id)) === 10 && JSON.stringify(await aktif(L.id)) === JSON.stringify(["10@100"]));
  cek("rollback: tidak ada movement/pemakaian yatim dari transaksi yang gagal", (await db.stockMovement.count({ where: { itemId: L.id } })) === 1 && (await db.lapisanPemakaian.count({ where: { lapisan: { itemId: L.id } } })) === 0);
  await pastikanGagal("harga negatif ditolak", "INPUT_TIDAK_VALID", () => transaksiStok((tx) => ubahStok(tx, { itemId: L.id, tipe: "masuk", qty: 1, harga: -5, sumber: "restock" })));
  await transaksiStok((tx) => ubahStok(tx, { itemId: L.id, tipe: "masuk", qty: 2, harga: 0, sumber: "restock" }));
  const outFree = await transaksiStok((tx) => ubahStok(tx, { itemId: L.id, tipe: "keluar", qty: 12, sumber: "pengajuan" }));
  cek("lapisan berharga 0 (barang gratis) dihormati: 10x100 + 2x0 = 1.000", outFree.nilai === 1000, outFree.nilai);

  console.log("\n== 10. Konkurensi: 20 pengambilan serentak dari 5 lapisan berbeda harga ==");
  const K = await buatItem("K", 1);
  await transaksiStok((tx) =>
    ubahStokMasukBanyak(tx, { baris: [10, 20, 30, 40, 50].map((h, i) => ({ itemId: K.id, qty: 20, harga: h * (i + 1) })), sumber: "restock_massal", tanggal: D("2026-10-03") })
  );
  const nilaiAwal = (await layers(K.id)).reduce((s, l) => s + l.qtyAwal * l.harga, 0);
  const hasil = await Promise.allSettled(Array.from({ length: 20 }, () => transaksiStok((tx) => ubahStok(tx, { itemId: K.id, tipe: "keluar", qty: 7, sumber: "pengajuan" }))));
  const ok = hasil.filter((h) => h.status === "fulfilled").length;
  cek("dari stok 100: tepat 14 pengambilan 7 unit yang berhasil (98 unit)", ok === 14, { ok });
  cek("stok akhir 2, tidak negatif", (await stokDb(K.id)) === 2);
  await invarian("K", K.id);
  const nilaiKeluar = (await db.stockMovement.findMany({ where: { itemId: K.id, tipe: "keluar" } })).reduce((s, m) => s + (m.nilai ?? 0), 0);
  const nilaiSisa = (await layers(K.id)).reduce((s, l) => s + l.sisaQty * l.harga, 0);
  cek(`KONSERVASI NILAI: total nilai awal (${nilaiAwal}) == nilai keluar (${nilaiKeluar}) + persediaan sisa (${nilaiSisa})`, nilaiAwal === nilaiKeluar + nilaiSisa);
  const ber = hasil.filter((h) => h.status === "rejected").map((h) => (h as PromiseRejectedResult).reason);
  cek("6 yang gagal semuanya karena STOK_TIDAK_CUKUP (bukan error acak)", ber.length === 6 && ber.every((e) => e instanceof StokError && e.code === "STOK_TIDAK_CUKUP"), ber.map(String));

  const X = await buatItem("X", 100);
  await transaksiStok((tx) => ubahStok(tx, { itemId: X.id, tipe: "masuk", qty: 100, harga: 100, sumber: "restock", tanggal: D("2026-10-01") }));
  const campur = await Promise.allSettled([
    ...Array.from({ length: 10 }, (_, i) => transaksiStok((tx) => ubahStok(tx, { itemId: X.id, tipe: "masuk", qty: 5, harga: 200 + i, sumber: "restock", tanggal: D("2026-10-09") }))),
    ...Array.from({ length: 10 }, () => transaksiStok((tx) => ubahStok(tx, { itemId: X.id, tipe: "keluar", qty: 3, sumber: "pengajuan" }))),
  ]);
  cek("campuran 10 masuk + 10 keluar serentak: semuanya berhasil", campur.every((c) => c.status === "fulfilled"), campur.filter((c) => c.status === "rejected").map(String));
  cek("stok akhir = 100 + 50 - 30 = 120", (await stokDb(X.id)) === 120);
  await invarian("X", X.id);
  const lx = await layers(X.id);
  const nilaiMasukX = lx.reduce((s, l) => s + l.qtyAwal * l.harga, 0);
  const keluarX = (await db.stockMovement.findMany({ where: { itemId: X.id, tipe: "keluar" } })).reduce((s, m) => s + (m.nilai ?? 0), 0);
  const sisaX = lx.reduce((s, l) => s + l.sisaQty * l.harga, 0);
  cek("KONSERVASI NILAI pada beban campuran", nilaiMasukX === keluarX + sisaX, { nilaiMasukX, keluarX, sisaX });
  cek("30 unit keluar semuanya diambil dari lapisan 100@100 yang lebih tua (nilai 30 x 100 = 3.000)", keluarX === 3000, keluarX);

  console.log("\n== 11. Pembaca persediaan ==");
  const la = await lapisanAktifItem(S.id);
  cek("lapisanAktifItem: urut terlama dulu, nilai = sisa x harga", la.length > 0 && la.every((l, i) => i === 0 || la[i - 1].tanggal <= l.tanggal) && la.every((l) => l.nilai === l.sisaQty * l.harga));
  const semuaPers = await nilaiPersediaan();
  cek("nilaiPersediaan() tanpa argumen mencakup barang uji", semuaPers.has(S.id) && semuaPers.get(S.id)!.nilai === la.reduce((s, l) => s + l.nilai, 0));
  const sisaDrift = (await periksaKonsistensiLapisan()).filter((k) => k.nama.startsWith(PREFIX));
  cek("seluruh barang uji konsisten (stok == SUM lapisan)", sisaDrift.length === 0, sisaDrift);

  console.log("\n== 11b. Persediaan PADA tanggal tertentu (untuk Laporan bulan lalu) ==");
  const P = await buatItem("P", 1);
  await transaksiStok((tx) => ubahStok(tx, { itemId: P.id, tipe: "masuk", qty: 10, harga: 100, sumber: "restock", tanggal: D("2026-10-01") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: P.id, tipe: "masuk", qty: 10, harga: 200, sumber: "restock", tanggal: D("2026-10-05") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: P.id, tipe: "keluar", qty: 12, sumber: "pengajuan", tanggal: D("2026-10-10") }));
  await transaksiStok((tx) => ubahStok(tx, { itemId: P.id, tipe: "keluar", qty: 3, sumber: "pengajuan", tanggal: D("2026-11-05") }));
  const at = async (t: string) => (await persediaanPada(new Date(t))).get(P.id);
  const p8 = await at("2026-10-08T00:00:00Z");
  cek("sebelum pemakaian (8 Okt): 10@100 + 10@200 = Rp 3.000, 20 unit", p8?.nilai === 3000 && p8?.qty === 20, p8);
  const p31 = await at("2026-10-31T17:00:00Z");
  cek("akhir Okt: 12 unit sudah keluar (10@100 + 2@200) -> sisa 8@200 = Rp 1.600", p31?.nilai === 1600 && p31?.qty === 8 && JSON.stringify(p31?.lapisan) === JSON.stringify([{ harga: 200, qty: 8 }]), p31);
  const p30n = await at("2026-11-30T17:00:00Z");
  cek("akhir Nov: 3 unit lagi keluar dari 200 -> sisa 5@200 = Rp 1.000", p30n?.nilai === 1000 && p30n?.qty === 5, p30n);
  const p0 = await at("2026-09-30T00:00:00Z");
  cek("sebelum lapisan pertama ada: tidak ada persediaan", p0 === undefined, p0);
  cek("persediaan hari ini (live) sama dengan akhir Nov", (await nilaiPersediaan([P.id])).get(P.id)?.nilai === 1000);
  await invarian("P", P.id);

  console.log("\n== 12. Modul nilai laporan (lib/laporan-nilai) ==");
  const base = { item: { harga: 999 }, nilai: null as number | null, hargaSaatTransaksi: 0 };
  const lama1 = nilaiMovement({ ...base, qty: 4, hargaSaatTransaksi: 250 });
  cek("movement LAMA (nilai null): qty x harga snapshot", lama1.nominal === 1000 && lama1.hargaRata === 250);
  const lama2 = nilaiMovement({ ...base, qty: 4, hargaSaatTransaksi: 0 });
  cek("movement LAMA tanpa snapshot: jatuh ke harga master (perilaku lama)", lama2.nominal === 3996 && lama2.hargaRata === 999);
  const gratis = nilaiMovement({ ...base, qty: 4, nilai: 0, hargaSaatTransaksi: 0 });
  cek("movement baru bernilai 0 (barang gratis) DIHORMATI, tidak jatuh ke harga master", gratis.nominal === 0 && gratis.hargaRata === 0);
  const fifo = nilaiMovement({ ...base, qty: 25, nilai: 82500, hargaSaatTransaksi: 3300, lapisanPemakaian: [{ qty: 10, harga: 3000 }, { qty: 15, harga: 3500 }] });
  cek("keluar FIFO: nominal 82.500, rata-rata 3.300, bagian per harga", fifo.nominal === 82500 && fifo.hargaRata === 3300 && JSON.stringify(fifo.bagian) === JSON.stringify([{ harga: 3000, qty: 10 }, { harga: 3500, qty: 15 }]), fifo);
  const dup = nilaiMovement({ ...base, qty: 6, nilai: 600, hargaSaatTransaksi: 100, lapisanPemakaian: [{ qty: 2, harga: 100 }, { qty: 4, harga: 100 }] });
  cek("rincian dengan harga sama digabung", dup.bagian.length === 1 && dup.bagian[0].qty === 6);

  await bersihkan();
  cek("pembersihan: tidak ada barang/lapisan uji tersisa", (await db.item.count({ where: { nama: { startsWith: PREFIX } } })) === 0 && (await db.stokLapisan.count({ where: { item: { nama: { startsWith: PREFIX } } } })) === 0);

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
