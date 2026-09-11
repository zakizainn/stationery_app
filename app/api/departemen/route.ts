import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const departemens = await db.departemen.findMany({
      include: {
        _count: { select: { users: true, requests: true } },
      },
      orderBy: { kode: "asc" },
    });

    return NextResponse.json({ success: true, data: departemens });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch departemens";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { kode, nama } = body;

    if (!kode || !nama) {
      return NextResponse.json(
        { success: false, error: "Kode dan Nama Departemen wajib diisi." },
        { status: 400 }
      );
    }

    const existingDept = await db.departemen.findUnique({ where: { kode } });
    if (existingDept) {
      return NextResponse.json({ success: false, error: "Kode departemen sudah digunakan." }, { status: 400 });
    }

    const newDept = await db.departemen.create({
      data: { kode, nama },
    });

    return NextResponse.json({ success: true, data: newDept }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create departemen";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
