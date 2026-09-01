import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, error: "ID tidak valid" }, { status: 400 });
    }

    const body = await req.json();
    const { nama, kategori, satuan, stok, stokMinimum, stokBuffer, harga, bisaDitukar, jenisKertas, fotoUrl } = body;

    // Ambil harga lama dulu sebelum diupdate -- perlu buat catat audit log kalau berubah.
    const existingItem = await db.item.findUnique({ where: { id: itemId }, select: { harga: true } });
    if (!existingItem) {
      return NextResponse.json({ success: false, error: "Item tidak ditemukan" }, { status: 404 });
    }

    const updatedItem = await db.item.update({
      where: { id: itemId },
      data: {
        ...(nama && { nama }),
        ...(kategori && { kategori }),
        ...(satuan && { satuan }),
        ...(stok !== undefined && { stok: Number(stok) }),
        ...(stokMinimum !== undefined && { stokMinimum: Number(stokMinimum) }),
        ...(stokBuffer !== undefined && { stokBuffer: Number(stokBuffer) }),
        ...(harga !== undefined && { harga: Number(harga) }),
        ...(bisaDitukar !== undefined && { bisaDitukar: Boolean(bisaDitukar) }),
        jenisKertas: jenisKertas !== undefined ? jenisKertas : undefined,
        fotoUrl: fotoUrl !== undefined ? fotoUrl : undefined,
      },
    });

    // Catat ke audit log KALAU harga benar-benar berubah -- ini sumber kebenaran
    // utama untuk "kapan persis harga berubah", terlepas ada transaksi atau tidak.
    if (harga !== undefined && Number(harga) !== existingItem.harga) {
      await db.hargaHistory.create({
        data: {
          itemId,
          hargaLama: existingItem.harga,
          hargaBaru: Number(harga),
          diubahOlehId: parseInt(session.user.id),
        },
      });
    }

    return NextResponse.json({ success: true, data: updatedItem });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update item";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, error: "ID tidak valid" }, { status: 400 });
    }

    await db.item.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true, message: "Item berhasil dihapus" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete item";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
