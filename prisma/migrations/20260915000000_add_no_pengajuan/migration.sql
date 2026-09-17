-- CreateTable: penghitung nomor urut pengajuan per bulan/tahun
CREATE TABLE "request_counter" (
    "id" SERIAL NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "terakhir" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "request_counter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "request_counter_bulan_tahun_key" ON "request_counter"("bulan", "tahun");

-- AlterTable: tambah kolom dulu tanpa NOT NULL/UNIQUE, karena baris yang
-- sudah ada belum punya nilainya -- diisi lewat backfill di bawah, baru
-- kolomnya diwajibkan & diberi constraint unique di akhir migration ini.
ALTER TABLE "request" ADD COLUMN "no_pengajuan" TEXT;

-- Backfill nomor pengajuan untuk request yang sudah ada, urut per
-- bulan/tahun berdasarkan tanggal pengajuan asli (bukan urutan id),
-- format 001/IX/2026 (urut/bulan romawi/tahun).
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM tanggal), EXTRACT(MONTH FROM tanggal)
      ORDER BY tanggal, id
    ) AS urut,
    EXTRACT(MONTH FROM tanggal)::int AS bulan,
    EXTRACT(YEAR FROM tanggal)::int AS tahun
  FROM "request"
)
UPDATE "request" r
SET "no_pengajuan" = LPAD(numbered.urut::text, 3, '0') || '/' ||
  (CASE numbered.bulan
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END) || '/' || numbered.tahun::text
FROM numbered
WHERE r.id = numbered.id;

-- Seed request_counter dengan angka urut terakhir tiap bulan/tahun, supaya
-- pengajuan baru lanjut dari nomor terakhir, bukan reset ke 001.
INSERT INTO "request_counter" (bulan, tahun, terakhir)
SELECT
  EXTRACT(MONTH FROM tanggal)::int,
  EXTRACT(YEAR FROM tanggal)::int,
  COUNT(*)::int
FROM "request"
GROUP BY EXTRACT(MONTH FROM tanggal)::int, EXTRACT(YEAR FROM tanggal)::int
ON CONFLICT ("bulan", "tahun") DO UPDATE SET "terakhir" = EXCLUDED."terakhir";

-- Setelah dibackfill, baru diwajibkan & dibuat unique.
ALTER TABLE "request" ALTER COLUMN "no_pengajuan" SET NOT NULL;
CREATE UNIQUE INDEX "request_no_pengajuan_key" ON "request"("no_pengajuan");
