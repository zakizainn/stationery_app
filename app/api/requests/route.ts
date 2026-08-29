import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma, StatusRequest, TipeRequest } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const monthParam = searchParams.get("month"); // format "YYYY-MM"

    const whereCondition: Prisma.RequestWhereInput = {};

    if (session.user.role === "staf") {
      whereCondition.userId = parseInt(session.user.id);
    } else if (session.user.role === "atasan_departemen") {
      whereCondition.departemenId = session.user.departemenId;
    }

    if (statusParam) {
      whereCondition.status = statusParam as StatusRequest;
    }

    if (monthParam) {
      const [year, month] = monthParam.split("-").map(Number);
      if (year && month) {
        whereCondition.tanggal = {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        };
      }
    }

    const requests = await db.request.findMany({
      where: whereCondition,
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
      orderBy: { tanggal: "desc" },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch requests";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { tipe, catatan, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Keranjang kosong / tidak ada item yang diajukan." },
        { status: 400 }
      );
    }

    const isRutin = (tipe as TipeRequest) === "rutin" || !tipe;
    const initialStatus: StatusRequest = isRutin ? "approved" : "pending";

    const newRequest = await db.$transaction(async (tx) => {
      const createdRequest = await tx.request.create({
        data: {
          userId: parseInt(session.user.id),
          departemenId: session.user.departemenId,
          tipe: (tipe as TipeRequest) || "rutin",
          catatan: catatan || null,
          status: initialStatus,
        },
      });

      for (const item of items) {
        await tx.requestItem.create({
          data: {
            requestId: createdRequest.id,
            itemId: Number(item.itemId),
            qtyDiajukan: Number(item.qty),
            penggunaan: item.penggunaan || null,
            itemLamaId: item.itemLamaId ? Number(item.itemLamaId) : null,
          },
        });
      }

      if (isRutin) {
        // Direct to Admin Stationery -> Notify admin_stationery users
        const adminUsers = await tx.user.findMany({
          where: { role: "admin_stationery" },
        });

        for (const admin of adminUsers) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              requestId: createdRequest.id,
              pesan: `Pengajuan order rutin baru #${createdRequest.id} dari ${session.user.name} (${session.user.nik}) langsung masuk antrean Admin Stationery.`,
            },
          });
        }
      } else {
        // Notifikasi ke Atasan Departemen for Order Baru
        const atasan = await tx.user.findFirst({
          where: {
            departemenId: session.user.departemenId,
            role: "atasan_departemen",
          },
        });

        if (atasan) {
          await tx.notification.create({
            data: {
              userId: atasan.id,
              requestId: createdRequest.id,
              pesan: `Pengajuan order baru #${createdRequest.id} dari ${session.user.name} (${session.user.nik}) membutuhkan persetujuan.`,
            },
          });
        }
      }

      return createdRequest;
    });

    return NextResponse.json({ success: true, data: newRequest }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
