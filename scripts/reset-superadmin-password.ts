import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

const nik = process.argv[2] || "90001";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Jalankan perintah ini dari terminal interaktif.");
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const lines = createInterface({ input, output });
    lines.close();
    output.write(prompt);
    input.setRawMode(true);
    input.resume();

    let value = "";
    const finish = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Dibatalkan."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const user = await db.user.findUnique({ where: { nik }, select: { id: true, nik: true, nama: true, role: true, aktif: true } });
  if (!user || user.role !== "superadmin") throw new Error(`Akun Superadmin dengan NIK ${nik} tidak ditemukan.`);
  if (!user.aktif) throw new Error(`Akun ${nik} sedang tidak aktif. Aktifkan melalui database/admin terlebih dahulu.`);

  const password = await readSecret(`Password baru untuk ${user.nama} (${user.nik}): `);
  if (password.length < 10 || password.length > 128) throw new Error("Password harus 10–128 karakter.");
  const confirmation = await readSecret("Ulangi password baru: ");
  if (password !== confirmation) throw new Error("Konfirmasi password tidak cocok.");

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log(`Password akun Superadmin ${user.nik} berhasil diperbarui.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Reset password gagal.");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());