import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Notifikasi selama ini sudah dibuat di database (saat approve/reject/proses)
// tapi tidak pernah ada endpoint atau UI untuk membacanya. Endpoint ini
// mengisi bagian yang hilang itu.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const notifications = await db.notification.findMany({
      where: { userId: parseInt(session.user.id) },
      orderBy: { tanggal: "desc" },
      take: 50,
    });

    const unreadCount = await db.notification.count({
      where: { userId: parseInt(session.user.id), dibaca: false },
    });

    return NextResponse.json({ success: true, data: notifications, unreadCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch notifications";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, all } = body;
    const userId = parseInt(session.user.id);

    if (all) {
      await db.notification.updateMany({
        where: { userId, dibaca: false },
        data: { dibaca: true },
      });
      return NextResponse.json({ success: true, message: "Semua notifikasi ditandai dibaca." });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "id atau all wajib diisi." }, { status: 400 });
    }

    // Pastikan notifikasi ini memang milik user yang login.
    const notif = await db.notification.findUnique({ where: { id: Number(id) } });
    if (!notif || notif.userId !== userId) {
      return NextResponse.json({ success: false, error: "Notifikasi tidak ditemukan" }, { status: 404 });
    }

    await db.notification.update({ where: { id: Number(id) }, data: { dibaca: true } });

    return NextResponse.json({ success: true, message: "Notifikasi ditandai dibaca." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update notification";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
