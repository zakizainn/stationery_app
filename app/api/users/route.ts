import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        nik: true,
        nama: true,
        role: true,
        aktif: true,
        departemenId: true,
        departemen: { select: { id: true, nama: true, kode: true } },
        createdAt: true,
      },
      orderBy: { nama: "asc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
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
    const { nik, nama, password, role, departemenId } = body;

    if (!nik || !nama || !password || !role || !departemenId) {
      return NextResponse.json(
        { success: false, error: "NIK, Nama, Password, Role, dan Departemen wajib diisi." },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({ where: { nik } });
    if (existingUser) {
      return NextResponse.json({ success: false, error: "NIK sudah terdaftar." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        nik,
        nama,
        passwordHash,
        role: role as Role,
        departemenId: Number(departemenId),
      },
      select: {
        id: true,
        nik: true,
        nama: true,
        role: true,
        departemenId: true,
        departemen: { select: { nama: true } },
      },
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
