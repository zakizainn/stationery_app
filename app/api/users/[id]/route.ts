import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    const body = await req.json();
    const action = body.action;
    const target = await db.user.findUnique({ where: { id: userId }, select: { requestedRole: true } });
    if (!target?.requestedRole) {
      return NextResponse.json({ success: false, error: "Tidak ada permintaan role yang menunggu." }, { status: 404 });
    }

    if (action === "approve") {
      await db.user.update({ where: { id: userId }, data: { role: target.requestedRole, requestedRole: null } });
    } else if (action === "reject") {
      await db.user.update({ where: { id: userId }, data: { requestedRole: null } });
    } else {
      return NextResponse.json({ success: false, error: "Aksi tidak valid." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process role request";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);

    const body = await req.json();
    const { nama, role, departemenId, newPassword, aktif, email } = body;

    const updateData: Prisma.UserUpdateInput = {};
    let emailChanged = false;
    if (nama) updateData.nama = nama;
    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return NextResponse.json({ success: false, error: "Format email tidak valid." }, { status: 400 });
      const duplicate = await db.user.findFirst({ where: { email: normalizedEmail, id: { not: userId } } });
      if (duplicate) return NextResponse.json({ success: false, error: "Email sudah digunakan." }, { status: 400 });
      const current = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
      updateData.email = normalizedEmail;
      emailChanged = current?.email !== normalizedEmail;
    }
    if (role) updateData.role = role as Role;
    if (departemenId) updateData.departemen = { connect: { id: Number(departemenId) } };
    if (newPassword && newPassword.trim() !== "") {
      if (newPassword.length < 10 || newPassword.length > 128) return NextResponse.json({ success: false, error: "Password harus 10–128 karakter." }, { status: 400 });
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

    const updatedUser = await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, nik: true, nama: true, email: true, role: true, departemenId: true },
      });
      if (emailChanged || Boolean(newPassword?.trim()) || aktif === false) {
        await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      }
      return user;
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
    const session = await getAuthSession();
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
