import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, status, items } = body; // status: 'diproses' | 'selesai'

    if (!requestId || !status) {
      return NextResponse.json(
        { success: false, error: "requestId dan status wajib diisi." },
        { status: 400 }
      );
    }

    const request = await db.request.findUnique({
      where: { id: Number(requestId) },
      include: { items: { include: { item: true } } },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Pengajuan tidak ditemukan" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // Process item quantity adjustments (counter offer) and stock movements
      if (items && Array.isArray(items)) {
        for (const itemAdj of items) {
          const qtyApproved = itemAdj.qtyDisetujui !== undefined ? Number(itemAdj.qtyDisetujui) : itemAdj.qtyDiajukan;
          
          await tx.requestItem.update({
            where: { id: Number(itemAdj.requestItemId) },
            data: {
              qtyDisetujui: qtyApproved,
              catatanAdmin: itemAdj.catatanAdmin || null,
            },
          });

          // If finishing order, deduct stock and record movement
          if (status === "selesai" && request.status !== "selesai") {
            const reqItem = request.items.find(i => i.id === Number(itemAdj.requestItemId));
            const finalQty = qtyApproved;

            if (reqItem && finalQty > 0) {
              // Deduct stock
              await tx.item.update({
                where: { id: reqItem.itemId },
                data: { stok: { decrement: finalQty } },
              });

              // Record outbound stock movement
              await tx.stockMovement.create({
                data: {
                  itemId: reqItem.itemId,
                  tipe: "keluar",
                  qty: finalQty,
                  refRequestId: request.id,
                },
              });
            }
          }
        }
      }

      // Update Request status
      await tx.request.update({
        where: { id: request.id },
        data: { status },
      });

      // Notify owner
      const statusMessage =
        status === "diproses"
          ? "sedang diproses oleh Admin Stationery."
          : "telah selesai dan barang siap diambil/diserahterimakan.";

      await tx.notification.create({
        data: {
          userId: request.userId,
          requestId: request.id,
          pesan: `Pengajuan stationery #${request.id} ${statusMessage}`,
        },
      });
    });

    return NextResponse.json({ success: true, message: `Status pengajuan berhasil diubah menjadi ${status}.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
