import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { nilaiPersediaan } from "@/lib/persediaan";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const persediaanMap = await nilaiPersediaan();
    let totalNilai = 0;
    let totalQty = 0;
    const perItem: Record<number, { qty: number; nilai: number }> = {};

    for (const [id, item] of persediaanMap.entries()) {
      totalNilai += item.nilai;
      totalQty += item.qty;
      perItem[id] = { qty: item.qty, nilai: item.nilai };
    }

    return NextResponse.json({
      success: true,
      data: {
        totalNilai,
        totalQty,
        jumlahBarang: persediaanMap.size,
        perItem,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat nilai persediaan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
