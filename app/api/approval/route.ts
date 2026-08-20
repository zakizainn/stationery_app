import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["atasan_departemen", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, action, catatan } = body; // action: 'approve' | 'reject'

    if (!requestId || !action) {
      return NextResponse.json(
        { success: false, error: "requestId dan action wajib diisi." },
        { status: 400 }
      );
    }

    if (action === "reject" && (!catatan || catatan.trim() === "")) {
      return NextResponse.json(
        { success: false, error: "Catatan wajib diisi bila pengajuan ditolak." },
        { status: 400 }
      );
    }

    const request = await db.request.findUnique({
      where: { id: Number(requestId) },
      include: { user: true, approvals: true },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Pengajuan tidak ditemukan" }, { status: 404 });
    }

    const level = session.user.role === "atasan_departemen" ? 1 : 2;

    // Cegah lompat urutan: superadmin (level 2) tidak boleh approve sebelum
    // level 1 (atasan departemen) selesai approve.
    if (level === 2) {
      const level1 = request.approvals.find((a) => a.level === 1);
      if (!level1 || level1.status !== "approved") {
        return NextResponse.json(
          { success: false, error: "Pengajuan ini belum disetujui atasan departemen." },
          { status: 400 }
        );
      }
    }

    // Cegah approval ganda pada level yang sama.
    const existingAtLevel = request.approvals.find((a) => a.level === level);
    if (existingAtLevel && existingAtLevel.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Pengajuan ini sudah diproses pada level approval ini." },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.approval.create({
        data: {
          requestId: request.id,
          approverId: parseInt(session.user.id),
          level,
          status: action === "approve" ? "approved" : "rejected",
          catatan: catatan || null,
          tanggal: new Date(),
        },
      });

      if (action === "reject") {
        await tx.request.update({ where: { id: request.id }, data: { status: "rejected" } });
        await tx.notification.create({
          data: {
            userId: request.userId,
            requestId: request.id,
            pesan: `Pengajuan stationery #${request.id} ditolak oleh ${session.user.name} (level ${level}).${
              catatan ? ` Catatan: ${catatan}` : ""
            }`,
          },
        });
        return;
      }

      // action === "approve"
      if (level === 1) {
        // Baru lolos level 1 — status TETAP pending, menunggu approval superadmin.
        const superadmin = await tx.user.findFirst({ where: { role: "superadmin" } });
        if (superadmin) {
          await tx.notification.create({
            data: {
              userId: superadmin.id,
              requestId: request.id,
              pesan: `Pengajuan #${request.id} dari ${request.user.nama} sudah disetujui atasan departemen — menunggu approval kamu.`,
            },
          });
        }
        await tx.notification.create({
          data: {
            userId: request.userId,
            requestId: request.id,
            pesan: `Pengajuan #${request.id} disetujui atasan departemen, menunggu approval superadmin.`,
          },
        });
      } else {
        // Lolos level 2 — baru sekarang siap diproses admin stationery.
        await tx.request.update({ where: { id: request.id }, data: { status: "approved" } });
        const admins = await tx.user.findMany({ where: { role: "admin_stationery" } });
        await tx.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            requestId: request.id,
            pesan: `Pengajuan #${request.id} dari ${request.user.nama} sudah lolos semua approval — siap diproses.`,
          })),
        });
        await tx.notification.create({
          data: {
            userId: request.userId,
            requestId: request.id,
            pesan: `Pengajuan #${request.id} disetujui superadmin — siap diproses admin stationery.`,
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: `Pengajuan berhasil ${action === "approve" ? "disetujui" : "ditolak"}.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process approval";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
