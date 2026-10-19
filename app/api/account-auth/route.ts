import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createAuthToken, genericAuthMessage, hashToken, limitAuthRequest, requestOrigin, sendAccountEmail } from "@/lib/account-auth";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const departemen = await db.departemen.findMany({
      select: { id: true, nama: true, kode: true },
      orderBy: { nama: "asc" },
    });
    return NextResponse.json({ success: true, data: departemen }, { headers: noStore });
  } catch {
    return NextResponse.json({ success: false, error: "Daftar departemen belum dapat dimuat." }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    if (action === "register") {
      const nik = String(body.nik ?? "").trim();
      const nama = String(body.nama ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const departemenId = Number(body.departemenId);
      const requestedRole = body.requestedRole;
      const validRoles = ["staf", "atasan_departemen", "admin_stationery", "superadmin"];
      const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 100);
      const [allowedKey, allowedIp] = await Promise.all([
        limitAuthRequest(hashToken(`register:${ip}:${nik.toLowerCase()}`), 3),
        limitAuthRequest(hashToken(`register-ip:${ip}`), 10),
      ]);
      if (!allowedKey || !allowedIp) return NextResponse.json({ success: false, error: "Terlalu banyak percobaan. Silakan coba lagi nanti." }, { status: 429, headers: noStore });
      if (!nik || nik.length > 50 || !nama || nama.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128 || !Number.isInteger(departemenId) || departemenId < 1 || !validRoles.includes(requestedRole)) {
        return NextResponse.json({ success: false, error: "Periksa kembali data. Password harus 10–128 karakter." }, { status: 400, headers: noStore });
      }
      const departemen = await db.departemen.findUnique({ where: { id: departemenId }, select: { id: true } });
      if (!departemen) return NextResponse.json({ success: false, error: "Departemen tidak valid." }, { status: 400, headers: noStore });
      const [existingNik, existingEmail] = await Promise.all([
        db.user.findUnique({ where: { nik }, select: { id: true } }),
        db.user.findUnique({ where: { email }, select: { id: true } }),
      ]);
      if (existingNik || existingEmail) {
        return NextResponse.json({ success: false, error: existingNik ? "NIK sudah terdaftar." : "Email sudah digunakan." }, { status: 409, headers: noStore });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await db.user.create({
        data: { nik, nama, email, passwordHash, role: "staf", requestedRole, departemenId },
      });
      return NextResponse.json({ success: true, message: "Pendaftaran berhasil. Silakan masuk menggunakan NIK dan password Anda." }, { status: 201, headers: noStore });
    }
    if (action === "request-reset") {
      const rawIdentifier = String(body.identifier ?? "").trim();
      const identifier = rawIdentifier.toLowerCase().slice(0, 254);
      const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 100);
      const key = hashToken(`${ip}:${identifier}`);
      const ipKey = hashToken(`ip:${ip}`);
      const [allowedKey, allowedIp] = await Promise.all([limitAuthRequest(key), limitAuthRequest(ipKey, 20)]);
      if (!allowedKey || !allowedIp) return NextResponse.json({ success: true, message: genericAuthMessage }, { headers: noStore });

      const user = await db.user.findFirst({ where: { OR: [{ nik: rawIdentifier }, { email: identifier }] } });
      if (user?.aktif && user.email) {
        const token = await createAuthToken(user.id, "reset");
        await sendAccountEmail(user.email, "Reset password Stationery App", `Gunakan tautan berikut untuk membuat password baru (berlaku 1 jam dan hanya dapat digunakan sekali):\n\n${requestOrigin(req)}/forgot-password#token=${encodeURIComponent(token)}`);
      }
      return NextResponse.json({ success: true, message: genericAuthMessage }, { headers: noStore });
    }

    const token = String(body.token ?? "");
    if (!token || token.length > 200) return NextResponse.json({ success: false, error: "Tautan tidak valid atau sudah kedaluwarsa." }, { status: 400, headers: noStore });
    const tokenHash = hashToken(token);
    const record = await db.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.aktif) return NextResponse.json({ success: false, error: "Tautan tidak valid atau sudah kedaluwarsa." }, { status: 400, headers: noStore });

    if (action === "verify") {
      return NextResponse.json({ success: false, error: "Verifikasi email tidak lagi diperlukan." }, { status: 410, headers: noStore });
    }
    if (action === "reset") {
      if (record.purpose !== "reset") return NextResponse.json({ success: false, error: "Tautan tidak valid atau sudah kedaluwarsa." }, { status: 400, headers: noStore });
      const password = String(body.password ?? "");
      if (password.length < 10 || password.length > 128) return NextResponse.json({ success: false, error: "Gunakan password dengan panjang 10–128 karakter." }, { status: 400, headers: noStore });
      const consumed = await db.authToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!consumed.count) return NextResponse.json({ success: false, error: "Tautan tidak valid atau sudah kedaluwarsa." }, { status: 400, headers: noStore });
      await db.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
      await db.authToken.updateMany({ where: { userId: record.userId, purpose: "reset", usedAt: null }, data: { usedAt: new Date() } });
      return NextResponse.json({ success: true, message: "Password berhasil diperbarui. Silakan masuk." }, { headers: noStore });
    }
    return NextResponse.json({ success: false, error: "Permintaan tidak valid." }, { status: 400, headers: noStore });
  } catch (error) {
    console.error("Account authentication request failed:", error);
    return NextResponse.json(
      { success: false, error: "Permintaan belum dapat diproses. Layanan email mungkin bermasalah; coba lagi atau hubungi admin." },
      { status: 502, headers: noStore },
    );
  }
}
