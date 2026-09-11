import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Kolom SATUAN untuk item-item ini kosong di Daily_Out.xlsx (sub-bagian
// "OTHER" pada sheet "Paper & other"). Saat diimpor, satuannya ikut
// ter-default "rim" (satuan khusus kertas) dari baris di atasnya --
// padahal barang-barang ini bukan kertas (cleaner, refill, mesin, tisu).
// Script ini mengoreksi ke satuan yang masuk akal. Kategorinya (kertas)
// TIDAK diubah -- itu memang sesuai sheet "Paper & other" aslinya yang
// menggabungkan bagian PAPER + OTHER jadi satu.
// Jalankan sekali: npx tsx scripts/backfill-satuan-kertas-lainnya.ts
const SATUAN_FIX: { nama: string; satuan: string }[] = [
  { nama: "CLEANER BOTOL", satuan: "botol" },
  { nama: "REFIL CLEAR", satuan: "botol" },
  { nama: "REFIL STELLA MATIC", satuan: "botol" },
  { nama: "STELLA MATIC MESIN", satuan: "unit" },
  { nama: "TISSU", satuan: "pack" },
  // Opsional/confidence lebih rendah -- Excel tidak mengisi SATUAN untuk 2
  // item ini sama sekali; "roll" dipilih karena mirip item plotter lain
  // yang berformat rol panjang (bukan lembaran seperti rim).
  { nama: 'KERTAS HVS 80 GR AO 36"', satuan: "roll" },
  { nama: "KERTAS HVS 80 GR A1 50 M", satuan: "roll" },
];

async function main() {
  let updated = 0;
  let notFound: string[] = [];
  let alreadyCorrect = 0;

  for (const { nama, satuan } of SATUAN_FIX) {
    const item = await db.item.findFirst({
      where: { nama: { equals: nama, mode: "insensitive" } },
    });

    if (!item) {
      notFound.push(nama);
      continue;
    }

    if (item.satuan === satuan) {
      alreadyCorrect++;
      continue;
    }

    await db.item.update({
      where: { id: item.id },
      data: { satuan },
    });
    updated++;
  }

  console.log(`Backfill selesai: ${updated} item diperbaiki satuannya.`);
  if (alreadyCorrect > 0) {
    console.log(`${alreadyCorrect} item sudah benar sebelumnya (dilewati).`);
  }
  if (notFound.length > 0) {
    console.log(`${notFound.length} nama tidak ketemu di database (mungkin sudah diedit/dihapus):`);
    console.log(notFound.join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
