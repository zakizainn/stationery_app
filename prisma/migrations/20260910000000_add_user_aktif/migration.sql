-- Soft-delete flag untuk User: mencegah error FK saat menghapus user yang
-- punya riwayat Request/Approval, dan mencegah user nonaktif login lagi.
ALTER TABLE "user" ADD COLUMN "aktif" BOOLEAN NOT NULL DEFAULT true;
