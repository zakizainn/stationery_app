-- CreateEnum
CREATE TYPE "Role" AS ENUM ('staf', 'atasan_departemen', 'superadmin', 'admin_stationery');

-- CreateEnum
CREATE TYPE "KategoriItem" AS ENUM ('barang_umum', 'kertas', 'checksheet');

-- CreateEnum
CREATE TYPE "TipeRequest" AS ENUM ('rutin', 'order_baru');

-- CreateEnum
CREATE TYPE "StatusRequest" AS ENUM ('pending', 'approved', 'rejected', 'diproses', 'selesai');

-- CreateEnum
CREATE TYPE "StatusApproval" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TipeStockMovement" AS ENUM ('keluar', 'masuk');

-- CreateTable
CREATE TABLE "departemen" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "kode" TEXT NOT NULL,

    CONSTRAINT "departemen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "nik" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "departemen_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" "KategoriItem" NOT NULL,
    "foto_url" TEXT,
    "satuan" TEXT NOT NULL,
    "stok" INTEGER NOT NULL DEFAULT 0,
    "stok_minimum" INTEGER NOT NULL DEFAULT 0,
    "bisa_ditukar" BOOLEAN NOT NULL DEFAULT false,
    "jenis_kertas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "departemen_id" INTEGER NOT NULL,
    "tipe" "TipeRequest" NOT NULL,
    "status" "StatusRequest" NOT NULL DEFAULT 'pending',
    "catatan" TEXT,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_item" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qty_diajukan" INTEGER NOT NULL,
    "qty_disetujui" INTEGER,
    "item_lama_id" INTEGER,
    "penggunaan" TEXT,
    "catatan_admin" TEXT,

    CONSTRAINT "request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "approver_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "status" "StatusApproval" NOT NULL DEFAULT 'pending',
    "catatan" TEXT,
    "tanggal" TIMESTAMP(3),

    CONSTRAINT "approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "tipe" "TipeStockMovement" NOT NULL,
    "qty" INTEGER NOT NULL,
    "ref_request_id" INTEGER,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "request_id" INTEGER,
    "pesan" TEXT NOT NULL,
    "dibaca" BOOLEAN NOT NULL DEFAULT false,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departemen_kode_key" ON "departemen"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "user_nik_key" ON "user"("nik");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_departemen_id_fkey" FOREIGN KEY ("departemen_id") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_departemen_id_fkey" FOREIGN KEY ("departemen_id") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_item_lama_id_fkey" FOREIGN KEY ("item_lama_id") REFERENCES "item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval" ADD CONSTRAINT "approval_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_ref_request_id_fkey" FOREIGN KEY ("ref_request_id") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
