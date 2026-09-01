import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Audit log harga baru dibuat setelah fitur ini ada, jadi transaksi LAMA tidak
// otomatis punya entri di sana. Ini best-effort: rekonstruksi perubahan harga
// yang "kebetulan ketahuan" lewat urutan hargaSaatTransaksi di stock_movement.
// TIDAK mendeteksi perubahan harga yang tidak pernah dibarengi transaksi apa pun
// (itu memang tidak bisa diketahui lagi -- makanya fitur ini dibuat, supaya ke
// depannya tidak kejadian lagi).
// Jalankan sekali: npx tsx scripts/backfill-harga-history.ts
async function main() {
  const items = await db.item.findMany({
    include: {
      stockMovements: {
        where: { hargaSaatTransaksi: { gt: 0 } },
        orderBy: { tanggal: "asc" },
      },
    },
  });

  let created = 0;

  for (const item of items) {
    let hargaSebelumnya: number | null = null;

    for (const mv of item.stockMovements) {
      if (hargaSebelumnya !== null && mv.hargaSaatTransaksi !== hargaSebelumnya) {
        await db.hargaHistory.create({
          data: {
            itemId: item.id,
            hargaLama: hargaSebelumnya,
            hargaBaru: mv.hargaSaatTransaksi,
            tanggal: mv.tanggal,
            // diubahOlehId sengaja dibiarkan kosong -- rekonstruksi ini tidak
            // tahu siapa yang mengubahnya waktu itu.
          },
        });
        created++;
      }
      hargaSebelumnya = mv.hargaSaatTransaksi;
    }
  }

  console.log(`Backfill selesai: ${created} entri riwayat harga direkonstruksi dari data transaksi lama.`);
  console.log("Catatan: ini cuma menangkap perubahan yang kebetulan dibarengi transaksi -- bukan riwayat lengkap.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
