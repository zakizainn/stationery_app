import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { lapisanAktifItem } from "@/lib/persediaan";

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

    const item = await db.item.findUnique({
      where: { id: itemId },
      select: { id: true, nama: true, stok: true, satuan: true, harga: true },
    });

    if (!item) {
      return NextResponse.json({ success: false, error: "Barang tidak ditemukan" }, { status: 404 });
    }

    const lapisan = await lapisanAktifItem(itemId);
    const totalNilai = lapisan.reduce((sum, l) => sum + l.nilai, 0);
    const totalQty = lapisan.reduce((sum, l) => sum + l.sisaQty, 0);

    return NextResponse.json({
      success: true,
      data: {
        item,
        lapisan,
        totalNilai,
        totalQty,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memuat lapisan FIFO";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
