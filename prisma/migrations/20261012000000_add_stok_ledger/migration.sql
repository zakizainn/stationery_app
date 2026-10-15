-- AlterEnum
-- Dua tipe baru untuk koreksi stok. Sengaja terpisah dari masuk/keluar supaya
-- penyesuaian (STO, edit manual, stok awal) tidak ikut dihitung sebagai
-- Amount In / Amount Out di Laporan.
ALTER TYPE "TipeStockMovement" ADD VALUE 'penyesuaian_plus';
ALTER TYPE "TipeStockMovement" ADD VALUE 'penyesuaian_minus';

-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "catatan" TEXT,
ADD COLUMN     "dibuat_oleh_id" INTEGER,
ADD COLUMN     "sumber" TEXT NOT NULL DEFAULT 'sistem';

-- Isi "sumber" untuk movement lama supaya riwayat tetap bisa dibedakan:
-- yang punya referensi pengajuan = pemakaian, sisanya = restock.
UPDATE "stock_movement"
SET "sumber" = CASE WHEN "ref_request_id" IS NOT NULL THEN 'pengajuan' ELSE 'restock' END;

-- CreateTable
CREATE TABLE "stok_awal_bulan" (
    "id" SERIAL NOT NULL,
    "periode" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "sumber" TEXT NOT NULL DEFAULT 'baseline',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stok_awal_bulan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stok_awal_bulan_periode_item_id_key" ON "stok_awal_bulan"("periode", "item_id");

-- CreateIndex
CREATE INDEX "stock_movement_item_id_tanggal_idx" ON "stock_movement"("item_id", "tanggal");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_dibuat_oleh_id_fkey" FOREIGN KEY ("dibuat_oleh_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_awal_bulan" ADD CONSTRAINT "stok_awal_bulan_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
