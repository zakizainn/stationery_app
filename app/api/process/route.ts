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

    if (!["diproses", "selesai"].includes(status)) {
      return NextResponse.json({ success: false, error: "Status tujuan tidak valid." }, { status: 400 });
    }

    const request = await db.request.findUnique({
      where: { id: Number(requestId) },
      include: { items: { include: { item: true } } },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Pengajuan tidak ditemukan" }, { status: 404 });
    }

    // Status pengajuan hanya boleh mengalir approved -> diproses -> selesai.
    // Ini adalah SUMBER KEBENARAN di server -- filter di frontend (dashboard)
    // hanya untuk UX, bukan pengaman. Tanpa ini, request yang masih "pending"
    // atau sudah "rejected" bisa langsung diproses lewat panggilan API langsung.
    const allowedFromStatus: Record<string, string[]> = {
      diproses: ["approved"],
      selesai: ["approved", "diproses"],
    };
    if (!allowedFromStatus[status].includes(request.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Pengajuan berstatus "${request.status}" tidak dapat diubah menjadi "${status}". Pengajuan harus disetujui (approved) terlebih dahulu.`,
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // Guard atomik terhadap race condition: klaim transisi status di dalam
      // transaksi berdasarkan status yang masih sama dengan yang baru dibaca.
      // Kalau ada request lain (mis. double-click) yang lebih dulu mengubah
      // status, updateMany ini akan mengenai 0 baris dan transaksi dibatalkan
      // -- mencegah stok terpotong dua kali untuk satu pesanan yang sama.
      const claim = await tx.request.updateMany({
        where: { id: request.id, status: request.status },
        data: { status },
      });
      if (claim.count === 0) {
        throw new Error("Pengajuan ini sudah diubah statusnya oleh proses lain. Silakan muat ulang halaman.");
      }

      // Process item quantity adjustments (counter offer) and stock movements
      if (items && Array.isArray(items)) {
        for (const itemAdj of items) {
          const qtyApproved = itemAdj.qtyDisetujui !== undefined ? Number(itemAdj.qtyDisetujui) : itemAdj.qtyDiajukan;

          if (!Number.isFinite(qtyApproved) || qtyApproved < 0) {
            throw new Error("Jumlah disetujui tidak valid.");
          }

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
              // Baca stok terkini di dalam transaksi (bukan dari data yang
              // sudah dibaca sebelum transaksi dimulai) dan tolak bila tidak
              // cukup -- stok tidak boleh menjadi negatif.
              const currentItem = await tx.item.findUnique({ where: { id: reqItem.itemId } });
              if (!currentItem || currentItem.stok < finalQty) {
                throw new Error(
                  `Stok "${reqItem.item.nama}" tidak mencukupi (tersedia ${currentItem?.stok ?? 0}, diminta ${finalQty}). Kurangi jumlah disetujui terlebih dahulu.`
                );
              }

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
                  hargaSaatTransaksi: reqItem.item.harga,
                  refRequestId: request.id,
                },
              });
            }
          }
        }
      }

      // Notify owner
      const statusMessage =
        status === "diproses"
          ? "sedang diproses oleh Admin Stationery."
          : "telah selesai dan barang siap diambil/diserahterimakan.";

      await tx.notification.create({
        data: {
          userId: request.userId,
          requestId: request.id,
          pesan: `Pengajuan stationery #${request.noPengajuan} ${statusMessage}`,
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
