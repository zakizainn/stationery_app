import { Prisma } from "@prisma/client";

const ROMAWI_BULAN = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

/**
 * Generate nomor pengajuan format "001/IX/2026" (urut/bulan romawi/tahun).
 * Nomor urut reset ke 001 tiap awal bulan baru, dan naik terus selama
 * bulan berjalan sama.
 *
 * HARUS dipanggil di dalam `db.$transaction(...)` yang sama dengan
 * `tx.request.create(...)`, supaya kalau pembuatan request gagal, kenaikan
 * counter ikut di-rollback juga (tidak ada nomor yang "bocor"/terpakai sia-sia).
 *
 * Aman dari race condition: `upsert` pada constraint unik (bulan, tahun)
 * dieksekusi sebagai satu query atomik (ON CONFLICT DO UPDATE) di Postgres,
 * jadi dua pengajuan yang dibuat bersamaan tidak akan pernah mendapat nomor
 * urut yang sama.
 */
export async function generateNoPengajuan(
  tx: Prisma.TransactionClient,
  tanggal: Date = new Date()
): Promise<string> {
  const bulan = tanggal.getMonth() + 1; // 1-12
  const tahun = tanggal.getFullYear();

  const counter = await tx.requestCounter.upsert({
    where: { bulan_tahun: { bulan, tahun } },
    create: { bulan, tahun, terakhir: 1 },
    update: { terakhir: { increment: 1 } },
  });

  const urut = String(counter.terakhir).padStart(3, "0");
  return `${urut}/${ROMAWI_BULAN[bulan - 1]}/${tahun}`;
}
