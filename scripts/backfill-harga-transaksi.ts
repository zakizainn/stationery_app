import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Stock movement lama (dibuat sebelum kolom hargaSaatTransaksi ada) nilainya
// masih 0. Ini best-effort: isi pakai harga item SAAT INI, karena harga
// historis yang sebenarnya di titik waktu itu sudah tidak bisa diketahui lagi.
// Jalankan sekali: npx tsx scripts/backfill-harga-transaksi.ts
async function main() {
  const movements = await db.stockMovement.findMany({
    where: { hargaSaatTransaksi: 0 },
    include: { item: true },
  });

  let updated = 0;
  for (const mv of movements) {
    if (mv.item.harga === 0) continue; // item juga belum punya harga, skip
    await db.stockMovement.update({
      where: { id: mv.id },
      data: { hargaSaatTransaksi: mv.item.harga },
    });
    updated++;
  }

  console.log(`Backfill selesai: ${updated} dari ${movements.length} stock_movement lama diisi (pakai harga item saat ini).`);
  console.log("Catatan: ini estimasi terbaik -- harga asli di titik waktu transaksi lama sudah tidak tercatat.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
