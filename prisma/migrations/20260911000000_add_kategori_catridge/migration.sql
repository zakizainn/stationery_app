-- AlterEnum
-- Menambah kategori ke-4 untuk mencocokkan pembagian asli di Daily_Out.xlsx
-- (checksheet, ATK, Paper & Other, Catridge/Toner/Tinta). Sebelumnya item
-- Catridge/Toner/Tinta ikut ditaruh di "barang_umum" bersama ATK.
ALTER TYPE "KategoriItem" ADD VALUE 'catridge_toner_tinta';
