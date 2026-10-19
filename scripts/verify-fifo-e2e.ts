import "dotenv/config";
import { db } from "../lib/db";
import { ubahStok, transaksiStok } from "../lib/stok";
import { lapisanAktifItem, persediaanPada, nilaiPersediaan } from "../lib/persediaan";
import { nilaiMovement } from "../lib/laporan-nilai";
import * as XLSX from "xlsx";

async function main() {
  console.log("== UJI INTEGRASI FIFO & LAPORAN ==");

  // 1. Buat barang uji
  const item = await db.item.create({
    data: {
      nama: "UJI_FIFO_E2E_PULPEN",
      kategori: "barang_umum",
      satuan: "pcs",
      stok: 0,
      stokMinimum: 5,
      stokBuffer: 2,
      harga: 4500, // harga master default
      aktif: true,
    },
  });
  console.log(`PASS  Item uji dibuat: ID ${item.id}`);

  try {
    // 2. Restock 1: 10 unit @ Rp 5.000
    await transaksiStok((tx) =>
      ubahStok(tx, {
        itemId: item.id,
        tipe: "masuk",
        qty: 10,
        harga: 5000,
        sumber: "restock",
        catatan: "Batch Restock 1",
      })
    );

    // 3. Restock 2: 15 unit @ Rp 6.000
    await transaksiStok((tx) =>
      ubahStok(tx, {
        itemId: item.id,
        tipe: "masuk",
        qty: 15,
        harga: 6000,
        sumber: "restock",
        catatan: "Batch Restock 2",
      })
    );

    // Cek lapisan aktif
    const lapisanAwal = await lapisanAktifItem(item.id);
    if (lapisanAwal.length !== 2) throw new Error(`Harus ada 2 lapisan, ditemukan ${lapisanAwal.length}`);
    if (lapisanAwal[0].sisaQty !== 10 || lapisanAwal[0].harga !== 5000) throw new Error("Lapisan 1 tidak cocok");
    if (lapisanAwal[1].sisaQty !== 15 || lapisanAwal[1].harga !== 6000) throw new Error("Lapisan 2 tidak cocok");
    console.log("PASS  2 lapisan terbentuk dengan harga masing-masing: 10@5000 + 15@6000");

    // 4. Pemakaian keluar 15 unit
    const mvKeluar = await transaksiStok((tx) =>
      ubahStok(tx, {
        itemId: item.id,
        tipe: "keluar",
        qty: 15,
        sumber: "pengajuan",
        catatan: "Pemakaian 15 unit",
      })
    );

    if (mvKeluar.nilai !== 80000) {
      throw new Error(`Nilai movement keluar harus 80.000, didapat: ${mvKeluar.nilai}`);
    }
    console.log("PASS  Pemakaian 15 unit bernilai FIFO tepat Rp 80.000 (10x5.000 + 5x6.000)");

    // 5. Cek sisa lapisan
    const lapisanSisa = await lapisanAktifItem(item.id);
    if (lapisanSisa.length !== 1) throw new Error(`Harus sisa 1 lapisan, ada ${lapisanSisa.length}`);
    if (lapisanSisa[0].sisaQty !== 10 || lapisanSisa[0].harga !== 6000) throw new Error("Sisa lapisan bukan 10@6000");
    console.log("PASS  Sisa lapisan tepat 10 unit @ Rp 6.000 = Rp 60.000");

    // 6. Uji nilaiMovement untuk laporan
    const mvDb = await db.stockMovement.findUniqueOrThrow({
      where: { id: mvKeluar.movementId },
      include: {
        item: true,
        lapisanPemakaian: { select: { qty: true, harga: true } },
      },
    });

    const nv = nilaiMovement(mvDb);
    if (nv.nominal !== 80000) throw new Error("nilaiMovement nominal salah");
    if (nv.bagian.length !== 2) throw new Error("Bagian harga harus terbagi 2");
    if (nv.bagian[0].harga !== 5000 || nv.bagian[0].qty !== 10) throw new Error("Bagian 1 salah");
    if (nv.bagian[1].harga !== 6000 || nv.bagian[1].qty !== 5) throw new Error("Bagian 2 salah");
    console.log("PASS  nilaiMovement membagi rincian FIFO dengan benar: 10x5.000 + 5x6.000");

    // 7. Uji persediaanPada
    const besok = new Date(Date.now() + 24 * 3600 * 1000);
    const persediaanMap = await persediaanPada(besok);
    const pItem = persediaanMap.get(item.id);
    if (!pItem) throw new Error("Barang uji harus ada di persediaanPada");
    if (pItem.qty !== 10 || pItem.nilai !== 60000) throw new Error("Persediaan akhir barang uji tidak tepat");
    console.log("PASS  persediaanPada merekonstruksi sisa persediaan FIFO dengan tepat (10 unit, Rp 60.000)");

    // 8. Uji pembuatan workbook Excel seperti di /api/laporan/export
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nama", "Kategori", "Satuan", "Stok", "Nilai FIFO"],
      [item.nama, item.kategori, item.satuan, pItem.qty, pItem.nilai],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Persediaan FIFO");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    if (!buf || buf.length === 0) throw new Error("Gagal generate workbook Excel");
    console.log(`PASS  Export sheet Persediaan FIFO berhasil dibuat (${buf.length} bytes)`);

  } finally {
    // Pembersihan
    await db.lapisanPemakaian.deleteMany({
      where: { movement: { itemId: item.id } },
    });
    await db.stockMovement.deleteMany({ where: { itemId: item.id } });
    await db.stokLapisan.deleteMany({ where: { itemId: item.id } });
    await db.item.delete({ where: { id: item.id } });
    console.log("PASS  Pembersihan data uji selesai");
  }

  console.log("\nSEMUA UJI INTEGRASI FIFO & LAPORAN LOLOS!");
}

main()
  .catch((e) => {
    console.error("GAGAL:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
