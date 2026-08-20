# Stationery App — PT JAI

Aplikasi manajemen stationery (ATK) internal PT Jatim Autocomp Indonesia.
Lihat `Spesifikasi_Teknis_Aplikasi_Stationery_PT_JAI.docx` untuk alur bisnis,
skema data lengkap, dan role & hak akses.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- PostgreSQL + Prisma
- NextAuth v4 (Credentials — NIK + password internal)
- Tailwind CSS

## Setup

1. Install dependency (sudah terpasang di project ini):
   ```
   npm install
   ```
2. Salin `.env.example` ke `.env` dan isi `DATABASE_URL` sesuai PostgreSQL kamu,
   plus `NEXTAUTH_SECRET` (generate dengan `openssl rand -base64 32`).
3. Generate Prisma client & jalankan migrasi pertama:
   ```
   npx prisma generate
   npx prisma migrate dev --name init
   ```
   > Project ini pakai **Prisma 7**, yang mewajibkan driver adapter (`@prisma/adapter-pg`
   > + `pg`, sudah terpasang) — koneksi database tidak lagi lewat `url` di
   > `schema.prisma`, melainkan lewat `prisma.config.ts` (untuk CLI/migrate) dan
   > `lib/db.ts` (untuk runtime). Kedua file ini sudah disiapkan, tinggal pastikan
   > `DATABASE_URL` di `.env` benar.
4. (Opsional) Isi data contoh — 2 departemen, 1 user tiap role, beberapa item:
   ```
   npx prisma db seed
   ```
   Password default semua akun contoh: `password123` (NIK ada di `prisma/seed.ts`).
5. Jalankan dev server:
   ```
   npm run dev
   ```

> Catatan: langkah 3–4 tidak bisa dijalankan di sandbox tempat project ini
> dibuat karena `binaries.prisma.sh` tidak dapat diakses dari jaringan sandbox
> — jalankan di komputer/servermu sendiri.

## Struktur folder

```
app/
  (auth)/login          — halaman login (NIK + password)
  (staf)/                — staf & atasan departemen: beranda, katalog, keranjang, riwayat
  (approval)/approval    — atasan departemen (level 1) & superadmin (level 2)
  (admin)/                — admin stationery: dashboard, master item, restock, laporan
  (superadmin)/           — kelola user & departemen
  api/                    — route handlers (auth, requests, items, notifications)
lib/
  db.ts                   — Prisma client singleton
  auth.ts                 — konfigurasi NextAuth
prisma/
  schema.prisma           — skema 7 entitas (Departemen, User, Item, Request,
                             RequestItem, Approval, StockMovement, Notification)
  seed.ts                 — data contoh
components/
  ui/AppShell.tsx         — header + nav bersama, dipakai tiap layout role
  katalog/ keranjang/ approval/ admin/  — tempat komponen per modul
middleware.ts             — proteksi route + redirect sesuai role
types/index.ts             — tipe Role, KategoriItem, TipeRequest, dst.
```

## Yang sudah jadi (skeleton)

- Login dengan NIK + password (NextAuth Credentials + bcrypt)
- Middleware pembatas akses per role, sesuai matriks permission di dokumen spesifikasi
- Layout + navigasi terpisah untuk tiap kelompok role
- Skema database lengkap (belum di-migrate — lihat langkah setup)
- Halaman placeholder untuk semua modul yang sudah dirancang

## Yang masih perlu dikerjakan

- Implementasi UI katalog, keranjang, approval, dan dashboard admin sesuai mockup
  yang sudah didiskusikan (grid item, counter offer, dsb.)
- Route handler di `app/api/` (saat ini masih folder kosong): CRUD request,
  approve/reject, proses order, kelola item
- Data master departemen & sect/line (masih asumsi — lihat dokumen spesifikasi bagian 7)
- Upload foto item ke storage lokal
