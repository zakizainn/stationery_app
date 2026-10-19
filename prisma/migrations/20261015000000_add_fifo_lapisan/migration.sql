-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "nilai" INTEGER;

-- CreateTable
CREATE TABLE "stok_lapisan" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qty_awal" INTEGER NOT NULL,
    "sisa_qty" INTEGER NOT NULL,
    "harga" INTEGER NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sumber" TEXT NOT NULL DEFAULT 'restock',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stok_lapisan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapisan_pemakaian" (
    "id" SERIAL NOT NULL,
    "movement_id" INTEGER NOT NULL,
    "lapisan_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "harga" INTEGER NOT NULL,

    CONSTRAINT "lapisan_pemakaian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stok_lapisan_item_id_tanggal_id_idx" ON "stok_lapisan"("item_id", "tanggal", "id");

-- CreateIndex
CREATE INDEX "lapisan_pemakaian_movement_id_idx" ON "lapisan_pemakaian"("movement_id");

-- CreateIndex
CREATE INDEX "lapisan_pemakaian_lapisan_id_idx" ON "lapisan_pemakaian"("lapisan_id");

-- AddForeignKey
ALTER TABLE "stok_lapisan" ADD CONSTRAINT "stok_lapisan_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapisan_pemakaian" ADD CONSTRAINT "lapisan_pemakaian_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapisan_pemakaian" ADD CONSTRAINT "lapisan_pemakaian_lapisan_id_fkey" FOREIGN KEY ("lapisan_id") REFERENCES "stok_lapisan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lapisan awal FIFO: stok yang SUDAH ADA saat migrasi ini dijalankan dijadikan satu
-- lapisan per barang, dihargai harga master saat ini (harga pembelian aslinya tidak
-- tercatat). Tanggalnya sengaja dibuat sangat lama supaya stok yang sudah ada selalu
-- dipakai lebih dulu daripada restock baru -- inilah arti FIFO untuk stok awal.
INSERT INTO "stok_lapisan" ("item_id", "qty_awal", "sisa_qty", "harga", "tanggal", "sumber")
SELECT "id", "stok", "stok", "harga", TIMESTAMP '2000-01-01 00:00:00', 'migrasi'
FROM "item"
WHERE "stok" > 0;
