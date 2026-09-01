import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, error: "ID tidak valid" }, { status: 400 });
    }

    const history = await db.hargaHistory.findMany({
      where: { itemId },
      include: { diubahOleh: { select: { nama: true } } },
      orderBy: { tanggal: "desc" },
    });

    return NextResponse.json({ success: true, data: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat riwayat harga";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
