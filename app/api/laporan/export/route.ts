import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

const KATEGORI_LABEL: Record<string, string> = {
  barang_umum: "Barang Umum",
  kertas: "Kertas",
  checksheet: "Checksheet",
};

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
        refRequest: { include: { departemen: { select: { nama: true } } } },
      },
      orderBy: { tanggal: "asc" },
    });

    const perItemMap = new Map<
      number,
      { nama: string; kategori: string; satuan: string; harga: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();
    const perDeptMap = new Map<string, { departemen: string; qtyKeluar: number; nominalKeluar: number }>();
    let totalNominalMasuk = 0;
    let totalNominalKeluar = 0;
    let totalQtyMasuk = 0;
    let totalQtyKeluar = 0;

    for (const mv of movements) {
      const nominal = mv.qty * mv.item.harga;
      if (!perItemMap.has(mv.itemId)) {
        perItemMap.set(mv.itemId, {
          nama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          harga: mv.item.harga,
          qtyMasuk: 0,
          nominalMasuk: 0,
          qtyKeluar: 0,
          nominalKeluar: 0,
        });
      }
      const row = perItemMap.get(mv.itemId)!;

      if (mv.tipe === "masuk") {
        row.qtyMasuk += mv.qty;
        row.nominalMasuk += nominal;
        totalQtyMasuk += mv.qty;
        totalNominalMasuk += nominal;
      } else {
        row.qtyKeluar += mv.qty;
        row.nominalKeluar += nominal;
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

    const perItem = Array.from(perItemMap.values()).sort((a, b) => b.nominalKeluar - a.nominalKeluar);
    const perDepartemen = Array.from(perDeptMap.values()).sort((a, b) => b.nominalKeluar - a.nominalKeluar);

    // --- Susun workbook Excel, 3 sheet ---
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

    // Sheet 2: Per Barang
    const perItemHeaders = ["Nama Barang", "Kategori", "Satuan", "Harga Satuan", "Qty Masuk", "Nominal Masuk", "Qty Keluar", "Nominal Keluar"];
    const perItemRows = perItem.map((it) => [
      it.nama,
      KATEGORI_LABEL[it.kategori] ?? it.kategori,
      it.satuan,
      it.harga,
      it.qtyMasuk,
      it.nominalMasuk,
      it.qtyKeluar,
      it.nominalKeluar,
    ]);
    const wsPerItem = XLSX.utils.aoa_to_sheet([perItemHeaders, ...perItemRows]);
    wsPerItem["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsPerItem, "Per Barang");

    // Sheet 3: Per Departemen
    const perDeptHeaders = ["Departemen", "Total Qty Diambil", "Total Nominal"];
    const perDeptRows = perDepartemen.map((d) => [d.departemen, d.qtyKeluar, d.nominalKeluar]);
    const wsPerDept = XLSX.utils.aoa_to_sheet([perDeptHeaders, ...perDeptRows]);
    wsPerDept["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsPerDept, "Per Departemen");

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
