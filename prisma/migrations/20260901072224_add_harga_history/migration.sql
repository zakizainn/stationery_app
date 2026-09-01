-- CreateTable
CREATE TABLE "harga_history" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "harga_lama" INTEGER NOT NULL,
    "harga_baru" INTEGER NOT NULL,
    "diubah_oleh_id" INTEGER,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harga_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "harga_history" ADD CONSTRAINT "harga_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harga_history" ADD CONSTRAINT "harga_history_diubah_oleh_id_fkey" FOREIGN KEY ("diubah_oleh_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
