import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { periksaKonsistensiLapisan } from "@/lib/persediaan";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const [anomali, penyeimbangCount] = await Promise.all([
      periksaKonsistensiLapisan(),
      db.stokLapisan.count({ where: { sumber: "penyeimbang" } }),
    ]);

    const sehat = anomali.length === 0 && penyeimbangCount === 0;

    return NextResponse.json({
      success: true,
      data: {
        sehat,
        jumlahAnomali: anomali.length,
        anomali,
        jumlahLapisanPenyeimbang: penyeimbangCount,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memeriksa kesehatan lapisan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
