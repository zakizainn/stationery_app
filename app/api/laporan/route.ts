import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    // month format: "YYYY-MM" (dari <input type="month">). Default: bulan berjalan.
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // awal bulan berikutnya (exclusive)

    const movements = await db.stockMovement.findMany({
      where: { tanggal: { gte: start, lt: end } },
      include: {
        item: true,
        refRequest: {
          include: { departemen: { select: { id: true, nama: true, kode: true } } },
        },
      },
      orderBy: { tanggal: "asc" },
    });

    // Rekap per item
    const perItemMap = new Map<
      number,
      { itemId: number; nama: string; kategori: string; satuan: string; harga: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();

    // Rekap per departemen (hanya relevan untuk transaksi keluar, karena masuk/restock tidak terikat departemen)
    const perDeptMap = new Map<string, { departemen: string; qtyKeluar: number; nominalKeluar: number }>();

    let totalNominalMasuk = 0;
    let totalNominalKeluar = 0;
    let totalQtyMasuk = 0;
    let totalQtyKeluar = 0;

    for (const mv of movements) {
      const nominal = mv.qty * mv.item.harga;

      if (!perItemMap.has(mv.itemId)) {
        perItemMap.set(mv.itemId, {
          itemId: mv.itemId,
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

    return NextResponse.json({
      success: true,
      periode: { year, month, label: start.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) },
      summary: { totalNominalMasuk, totalNominalKeluar, totalQtyMasuk, totalQtyKeluar },
      perItem,
      perDepartemen,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate laporan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
