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
    const { nama, role, departemenId, newPassword, aktif } = body;

    const updateData: Prisma.UserUpdateInput = {};
    if (nama) updateData.nama = nama;
    if (role) updateData.role = role as Role;
    if (departemenId) updateData.departemen = { connect: { id: Number(departemenId) } };
    if (newPassword && newPassword.trim() !== "") {
      updateData.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    if (typeof aktif === "boolean") {
      if (userId === parseInt(session.user.id) && !aktif) {
        return NextResponse.json(
          { success: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." },
          { status: 400 }
        );
      }
      updateData.aktif = aktif;
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

    if (userId === parseInt(session.user.id)) {
      return NextResponse.json(
        { success: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." },
        { status: 400 }
      );
    }

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ success: false, error: "User tidak ditemukan" }, { status: 404 });
    }

    if (target.role === "superadmin" && target.aktif) {
      const activeSuperadminCount = await db.user.count({ where: { role: "superadmin", aktif: true } });
      if (activeSuperadminCount <= 1) {
        return NextResponse.json(
          { success: false, error: "Tidak dapat menonaktifkan superadmin aktif terakhir." },
          { status: 400 }
        );
      }
    }

    // Soft-delete: User punya relasi ke Request/Approval yang tidak boleh
    // hilang (riwayat & laporan), jadi user cuma dinonaktifkan, bukan
    // dihapus permanen dari database.
    await db.user.update({ where: { id: userId }, data: { aktif: false } });

    return NextResponse.json({ success: true, message: "User berhasil dinonaktifkan." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete user";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
