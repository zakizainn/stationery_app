import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { OPSI_TRANSAKSI_STOK, StokError, ubahStok } from "@/lib/stok";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
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
              // Kurangi stok + catat movement lewat pintu tunggal (lib/stok.ts).
              // Kecukupan stok diperiksa ATOMIK di database (UPDATE ... WHERE stok >= qty),
              // bukan baca-lalu-tulis di aplikasi -- stok tidak bisa negatif walau dua
              // pesanan diselesaikan bersamaan.
              try {
                await ubahStok(tx, {
                  itemId: reqItem.itemId,
                  tipe: "keluar",
                  qty: finalQty,
                  sumber: "pengajuan",
                  // Nilai barang keluar ditentukan lapisan FIFO (yang terlama dulu),
                  // bukan harga master -- jadi tidak ada harga yang dikirim di sini.
                  refRequestId: request.id,
                  dibuatOlehId: Number(session.user.id),
                });
              } catch (e) {
                if (e instanceof StokError && e.code === "STOK_TIDAK_CUKUP") {
                  throw new Error(`${e.message} Kurangi jumlah disetujui terlebih dahulu.`);
                }
                throw e;
              }
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
    }, OPSI_TRANSAKSI_STOK);

    return NextResponse.json({ success: true, message: `Status pengajuan berhasil diubah menjadi ${status}.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
