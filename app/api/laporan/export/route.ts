import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKategoriLabel } from "@/lib/kategori";
import * as XLSX from "xlsx";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const periodeLabel = start.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    // Rekap sama persis dengan /api/laporan -- lihat file itu untuk detail logika.
    const movements = await db.stockMovement.findMany({
      where: { tanggal: { gte: start, lt: end } },
      include: {
        item: true,
        refRequest: {
          include: {
            departemen: { select: { nama: true } },
            user: { select: { nama: true } },
          },
        },
      },
      orderBy: { tanggal: "asc" },
    });

    const perItemMap = new Map<
      number,
      { nama: string; kategori: string; satuan: string; hargaMin: number; hargaMax: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();
    const breakdownMap = new Map<
      number,
      Map<number, { harga: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }>
    >();
    const perDeptMap = new Map<string, { departemen: string; qtyKeluar: number; nominalKeluar: number }>();
    const perKategoriMap = new Map<
      string,
      { kategori: string; label: string; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();
    let totalNominalMasuk = 0;
    let totalNominalKeluar = 0;
    let totalQtyMasuk = 0;
    let totalQtyKeluar = 0;

    for (const mv of movements) {
      // Pakai harga snapshot saat transaksi (bukan mv.item.harga yang bisa berubah
      // kalau admin edit harga item sekarang) -- supaya laporan bulan lalu tidak
      // ikut berubah gara-gara harga terbaru.
      const hargaTransaksi = mv.hargaSaatTransaksi || mv.item.harga;
      const nominal = mv.qty * hargaTransaksi;
      if (!perItemMap.has(mv.itemId)) {
        perItemMap.set(mv.itemId, {
          nama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          hargaMin: hargaTransaksi,
          hargaMax: hargaTransaksi,
          qtyMasuk: 0,
          nominalMasuk: 0,
          qtyKeluar: 0,
          nominalKeluar: 0,
        });
      }
      const row = perItemMap.get(mv.itemId)!;
      row.hargaMin = Math.min(row.hargaMin, hargaTransaksi);
      row.hargaMax = Math.max(row.hargaMax, hargaTransaksi);

      if (!breakdownMap.has(mv.itemId)) breakdownMap.set(mv.itemId, new Map());
      const itemBreakdown = breakdownMap.get(mv.itemId)!;
      if (!itemBreakdown.has(hargaTransaksi)) {
        itemBreakdown.set(hargaTransaksi, { harga: hargaTransaksi, qtyMasuk: 0, nominalMasuk: 0, qtyKeluar: 0, nominalKeluar: 0 });
      }
      const priceRow = itemBreakdown.get(hargaTransaksi)!;

      if (!perKategoriMap.has(mv.item.kategori)) {
        perKategoriMap.set(mv.item.kategori, {
          kategori: mv.item.kategori,
          label: getKategoriLabel(mv.item.kategori),
          qtyMasuk: 0,
          nominalMasuk: 0,
          qtyKeluar: 0,
          nominalKeluar: 0,
        });
      }
      const kategoriRow = perKategoriMap.get(mv.item.kategori)!;

      if (mv.tipe === "masuk") {
        row.qtyMasuk += mv.qty;
        row.nominalMasuk += nominal;
        priceRow.qtyMasuk += mv.qty;
        priceRow.nominalMasuk += nominal;
        kategoriRow.qtyMasuk += mv.qty;
        kategoriRow.nominalMasuk += nominal;
        totalQtyMasuk += mv.qty;
        totalNominalMasuk += nominal;
      } else {
        row.qtyKeluar += mv.qty;
        row.nominalKeluar += nominal;
        priceRow.qtyKeluar += mv.qty;
        priceRow.nominalKeluar += nominal;
        kategoriRow.qtyKeluar += mv.qty;
        kategoriRow.nominalKeluar += nominal;
        totalQtyKeluar += mv.qty;
        totalNominalKeluar += nominal;

        const deptNama = mv.refRequest?.departemen?.nama ?? "Tidak diketahui";
        if (!perDeptMap.has(deptNama)) {
          perDeptMap.set(deptNama, { departemen: deptNama, qtyKeluar: 0, nominalKeluar: 0 });
        }
        const deptRow = perDeptMap.get(deptNama)!;
        deptRow.qtyKeluar += mv.qty;
        deptRow.nominalKeluar += nominal;
      }
    }

    // Detail transaksi mentah -- sama seperti /api/laporan, lihat file itu untuk komentar detail.
    const detailTransaksi = movements
      .map((mv) => {
        const hargaTransaksi = mv.hargaSaatTransaksi || mv.item.harga;
        return {
          tanggal: mv.tanggal,
          tipe: mv.tipe,
          itemNama: mv.item.nama,
          satuan: mv.item.satuan,
          qty: mv.qty,
          harga: hargaTransaksi,
          nominal: mv.qty * hargaTransaksi,
          noPengajuan: mv.refRequest?.noPengajuan ?? "-",
          departemen: mv.refRequest?.departemen?.nama ?? "-",
          pemohon: mv.refRequest?.user?.nama ?? "-",
        };
      })
      .sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime());

    const perItem = Array.from(perItemMap.entries())
      .map(([itemId, it]) => ({
        itemId,
        ...it,
        breakdown: Array.from(breakdownMap.get(itemId)?.values() ?? []).sort((a, b) => a.harga - b.harga),
      }))
      .sort((a, b) => b.nominalKeluar - a.nominalKeluar);
    const perDepartemen = Array.from(perDeptMap.values()).sort((a, b) => b.nominalKeluar - a.nominalKeluar);
    const perKategori = Array.from(perKategoriMap.values()).sort(
      (a, b) => b.nominalMasuk + b.nominalKeluar - (a.nominalMasuk + a.nominalKeluar)
    );

    // --- Susun workbook Excel, 6 sheet ---
    const wb = XLSX.utils.book_new();

    // Sheet 1: Ringkasan
    const ringkasanRows = [
      ["Laporan Amount In / Amount Out - Stationery PT JAI"],
      ["Periode", periodeLabel],
      [],
      ["Amount In (Restock/Pembelian)", totalNominalMasuk],
      ["Amount Out (Pemakaian)", totalNominalKeluar],
      ["Selisih (In - Out)", totalNominalMasuk - totalNominalKeluar],
      [],
      ["Total Qty Masuk", totalQtyMasuk],
      ["Total Qty Keluar", totalQtyKeluar],
    ];
    const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows);
    wsRingkasan["!cols"] = [{ wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsRingkasan, "Ringkasan");

    // Sheet 2: Per Kategori
    const perKategoriHeaders = ["Kategori", "Qty Masuk", "Nominal Masuk", "Qty Keluar", "Nominal Keluar"];
    const perKategoriRows = perKategori.map((k) => [k.label, k.qtyMasuk, k.nominalMasuk, k.qtyKeluar, k.nominalKeluar]);
    const wsPerKategori = XLSX.utils.aoa_to_sheet([perKategoriHeaders, ...perKategoriRows]);
    wsPerKategori["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsPerKategori, "Per Kategori");

    // Sheet 3: Per Barang
    const perItemHeaders = ["Nama Barang", "Kategori", "Satuan", "Harga Satuan", "Qty Masuk", "Nominal Masuk", "Qty Keluar", "Nominal Keluar"];
    const perItemRows = perItem.map((it) => [
      it.nama,
      getKategoriLabel(it.kategori),
      it.satuan,
      it.hargaMin === it.hargaMax ? it.hargaMin : `Rp ${it.hargaMin.toLocaleString("id-ID")} - Rp ${it.hargaMax.toLocaleString("id-ID")} (berubah)`,
      it.qtyMasuk,
      it.nominalMasuk,
      it.qtyKeluar,
      it.nominalKeluar,
    ]);
    const wsPerItem = XLSX.utils.aoa_to_sheet([perItemHeaders, ...perItemRows]);
    wsPerItem["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsPerItem, "Per Barang");

    // Sheet 4: Per Departemen
    const perDeptHeaders = ["Departemen", "Total Qty Diambil", "Total Nominal"];
    const perDeptRows = perDepartemen.map((d) => [d.departemen, d.qtyKeluar, d.nominalKeluar]);
    const wsPerDept = XLSX.utils.aoa_to_sheet([perDeptHeaders, ...perDeptRows]);
    wsPerDept["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsPerDept, "Per Departemen");

    // Sheet 5: Rincian per Harga -- hanya barang yang harganya berubah dalam periode ini
    const itemsWithPriceChange = perItem.filter((it) => it.hargaMin !== it.hargaMax);
    const rincianHeaders = ["Nama Barang", "Harga", "Qty Masuk", "Nominal Masuk", "Qty Keluar", "Nominal Keluar"];
    const rincianRows: (string | number)[][] = [];
    for (const it of itemsWithPriceChange) {
      for (const b of it.breakdown) {
        rincianRows.push([it.nama, b.harga, b.qtyMasuk, b.nominalMasuk, b.qtyKeluar, b.nominalKeluar]);
      }
    }
    const wsRincian = XLSX.utils.aoa_to_sheet([rincianHeaders, ...rincianRows]);
    wsRincian["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsRincian, "Rincian per Harga");

    // Sheet 6: Detail Transaksi -- 1 baris per pergerakan stok, jadi laporan bisa
    // ditelusuri sampai ke pengajuan & pemohon aslinya, bukan cuma angka rekap.
    const detailHeaders = ["Tanggal", "Tipe", "Barang", "Qty", "Satuan", "Harga", "Nominal", "No. Pengajuan", "Departemen", "Pemohon"];
    const detailRows = detailTransaksi.map((d) => [
      d.tanggal.toLocaleDateString("id-ID"),
      d.tipe === "masuk" ? "Masuk" : "Keluar",
      d.itemNama,
      d.qty,
      d.satuan,
      d.harga,
      d.nominal,
      d.noPengajuan,
      d.departemen,
      d.pemohon,
    ]);
    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
    wsDetail["!cols"] = [
      { wch: 12 },
      { wch: 8 },
      { wch: 28 },
      { wch: 8 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 20 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Transaksi");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `laporan-stationery-${year}-${String(month).padStart(2, "0")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal export laporan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
