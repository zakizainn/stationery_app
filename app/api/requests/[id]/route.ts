import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const requestId = parseInt(id);
    if (isNaN(requestId)) {
      return NextResponse.json({ success: false, error: "ID tidak valid" }, { status: 400 });
    }

    const requestDetail = await db.request.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { id: true, nama: true, nik: true } },
        departemen: { select: { id: true, nama: true, kode: true } },
        items: {
          include: {
            item: true,
            itemLama: true,
          },
        },
        approvals: {
          include: {
            approver: { select: { nama: true, role: true } },
          },
          orderBy: { level: "asc" },
        },
      },
    });

    if (!requestDetail) {
      return NextResponse.json({ success: false, error: "Pengajuan tidak ditemukan" }, { status: 404 });
    }

    // Kepemilikan/departemen: staf hanya boleh lihat pengajuannya sendiri,
    // atasan departemen hanya pengajuan departemennya. Tanpa ini siapa pun
    // yang login bisa lihat detail pengajuan orang/departemen lain cuma
    // dengan menebak ID di URL.
    const role = session.user.role;
    const isOwner = requestDetail.userId === parseInt(session.user.id);
    const isSameDept = requestDetail.departemenId === session.user.departemenId;
    const isPrivileged = role === "admin_stationery" || role === "superadmin";

    if (!isPrivileged) {
      if (role === "staf" && !isOwner) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
      }
      if (role === "atasan_departemen" && !isSameDept) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
      }
    }

    return NextResponse.json({ success: true, data: requestDetail });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch request detail";
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
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const requestId = parseInt(id);

    const request = await db.request.findUnique({ where: { id: requestId } });
    if (!request) {
      return NextResponse.json({ success: false, error: "Pengajuan tidak ditemukan" }, { status: 404 });
    }

    // Only owner or superadmin can delete pending request
    if (request.userId !== parseInt(session.user.id) && session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ success: false, error: "Hanya pengajuan berstatus 'pending' yang dapat dibatalkan" }, { status: 400 });
    }

    await db.request.delete({ where: { id: requestId } });

    return NextResponse.json({ success: true, message: "Pengajuan berhasil dibatalkan" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
