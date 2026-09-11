import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Item-item ini awalnya diimpor dengan kategori "barang_umum" (tercampur
// dengan sheet ATK), padahal di Daily_Out.xlsx aslinya berada di sheet
// terpisah "catridge#toner#tinta". Script ini memindahkan kategorinya ke
// "catridge_toner_tinta" agar sesuai dengan pembagian Excel asli (4 kategori:
// Checksheet, ATK, Paper & Other, Catridge/Toner/Tinta).
// Jalankan sekali: npx tsx scripts/backfill-kategori-catridge.ts
const NAMA_CATRIDGE_TONER_TINTA: string[] = [
  "CATRIDGE CANON 750 BLACK",
  "CATRIDGE CANON 751 BLACK",
  "CATRIDGE CANON 751 CYAN",
  "CATRIDGE CANON 751 MAGENTA",
  "CATRIDGE CANON 751 YELLOW",
  "TONER COMPATIBLE 16X",
  "TONER COMPATIBLE 80A/05A",
  "TONER COMPATIBLE HP 93A",
  "CATRIDGE EPSON T6641 BLACK",
  "CATRIDGE EPSON T6642 CYAN",
  "CATRIDGE EPSON T7663 MAGENTA",
  "CATRIDGE EPSON T7664 YELLOW",
  "RIBBON PRINTONIX P300 P600",
  "PITA PRINTRONIX PN 255049-103/P8000-P7000",
  "CATRIDGE CANON 725 BLACK",
  "CATRIDGE CANON 726 BLACK",
  "CATRIDGE CANON 726 CYAN",
  "CATRIDGE CANON 726 MAGENTA",
  "CATRIDGE CANON 726 YELLOW",
  "CATRIDGE HP 950XL BLACK",
  "CATRIDGE HP 951XL CYAN",
  "CATRIDGE HP 951XL MAGENTA",
  "CATRIDGE HP 951XL YELLOW",
  "CATRIDGE EPSON T003 BLACK",
  "CATRIDGE EPSON T003 CYAN",
  "CATRIDGE EPSON T003 MAGENTA",
  "CATRIDGE EPSON T003 YELLOW",
  "TONER COMPATIBLE HP 30A",
  "DRUM UNIT 32A",
  "TINTA EPSON Y001 BLACK",
  "TINTA EPSON Y001 CYAN",
  "TINTA EPSON Y001 MAGENTA",
  "TINTA EPSON Y001 YELLOW",
  "TINTA BROTHER DCP 5000 C",
  "TINTA BROTHER DCP 5000 M",
  "TINTA BROTHER DCP 5000 Y",
  "TINTA BROTHER DCP 6000 BK",
  "BROTHER INK CATRIDGE D-60 BLACK 108ML",
];

async function main() {
  let updated = 0;
  let notFound: string[] = [];
  let alreadyCorrect = 0;

  for (const nama of NAMA_CATRIDGE_TONER_TINTA) {
    const item = await db.item.findFirst({
      where: { nama: { equals: nama, mode: "insensitive" } },
    });

    if (!item) {
      notFound.push(nama);
      continue;
    }

    if (item.kategori === "catridge_toner_tinta") {
      alreadyCorrect++;
      continue;
    }

    await db.item.update({
      where: { id: item.id },
      data: { kategori: "catridge_toner_tinta" },
    });
    updated++;
  }

  console.log(`Backfill selesai: ${updated} item dipindah ke kategori catridge_toner_tinta.`);
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
