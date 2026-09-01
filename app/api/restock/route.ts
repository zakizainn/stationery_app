import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const movements = await db.stockMovement.findMany({
      include: {
        item: true,
        refRequest: {
          include: {
            user: { select: { nama: true } },
            departemen: { select: { kode: true } },
          },
        },
      },
      orderBy: { tanggal: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: movements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock movements";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { itemId, qty } = body;

    if (!itemId || !qty || Number(qty) <= 0) {
      return NextResponse.json(
        { success: false, error: "Pilih barang dan masukkan jumlah stok yang valid (>0)." },
        { status: 400 }
      );
    }

    const item = await db.item.findUnique({ where: { id: Number(itemId) } });
    if (!item) {
      return NextResponse.json({ success: false, error: "Barang tidak ditemukan." }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.item.update({
        where: { id: Number(itemId) },
        data: { stok: { increment: Number(qty) } },
      });

      await tx.stockMovement.create({
        data: {
          itemId: Number(itemId),
          tipe: "masuk",
          qty: Number(qty),
          hargaSaatTransaksi: item.harga,
        },
      });
    });

    return NextResponse.json({ success: true, message: `Stok ${item.nama} berhasil ditambah sebanyak ${qty} ${item.satuan}.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restock item";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
