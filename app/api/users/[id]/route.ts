import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    const body = await req.json();
    const { nama, role, departemenId, newPassword } = body;

    const updateData: Prisma.UserUpdateInput = {};
    if (nama) updateData.nama = nama;
    if (role) updateData.role = role as Role;
    if (departemenId) updateData.departemen = { connect: { id: Number(departemenId) } };
    if (newPassword && newPassword.trim() !== "") {
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, nik: true, nama: true, role: true, departemenId: true },
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update user";
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
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    await db.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, message: "User berhasil dihapus." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete user";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
