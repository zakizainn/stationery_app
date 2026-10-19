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
4. (Opsional, hanya development) Isi data contoh — 22 departemen, 4 akun uji, beberapa item:
   ```
   npx prisma db seed
   ```
  Seed berisi akun contoh; jangan jalankan di produksi. Password seed dibuat acak dan tidak diketahui. Untuk menetapkan password akun Superadmin yang sudah ada, gunakan utilitas reset di bawah.
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

## Email akun dan pemulihan password

Email kerja wajib unik (case-insensitive) dan valid, tetapi tidak memerlukan verifikasi untuk menggunakan akun. Setelah pendaftaran berhasil, akun dapat langsung masuk menggunakan NIK dan password. Role aktif saat pendaftaran selalu `staf`; role khusus yang diminta hanya aktif setelah disetujui Superadmin. Kolom status verifikasi lama tetap ada untuk kompatibilitas data, tetapi tidak membatasi login.

Untuk pengiriman email lewat akun Gmail aplikasi, aktifkan Verifikasi 2 Langkah pada akun Google lalu buat App Password khusus aplikasi. Simpan App Password hanya di environment server, jangan gunakan password login Google biasa dan jangan commit nilainya ke Git.

```env
APP_URL=https://stationery.intra.perusahaan
GMAIL_USER=stationaryapps@gmail.com
GMAIL_APP_PASSWORD=<App Password dari Google>
```

Email reset password dikirim melalui Gmail SMTP (`smtp.gmail.com`, port 587 dengan STARTTLS). `APP_URL` harus origin HTTPS aplikasi pada produksi dan dapat dibuka oleh pengguna melalui jaringan kantor atau VPN. Untuk hostname internal, arahkan DNS internal ke IP server dan pasang sertifikat HTTPS yang dipercaya perangkat pengguna. Pengiriman email hanya diperlukan untuk pemulihan password, bukan untuk pendaftaran atau login.

Reset password menggunakan tautan acak yang tokennya disimpan sebagai hash SHA-256 dan berlaku 1 jam. Respons permintaan tidak membocorkan apakah NIK/email terdaftar. Batas permintaan reset adalah 5 per identifier dan 20 per IP dalam 15 menit; proxy harus mengatur `X-Forwarded-For` secara terpercaya. Password baru harus 10–128 karakter.

### Migrasi akun lama

Setelah backup database, jalankan:

```bash
npx prisma migrate deploy
npx prisma generate
```

Isi email kerja sebenarnya untuk setiap akun lama lewat Manajemen Pengguna agar dapat digunakan untuk pemulihan password. Jangan isi nilai contoh di database produksi. Konfigurasikan variabel Gmail di atas sebelum mengaktifkan fitur reset password. Akun lama dapat masuk tanpa verifikasi email selama masih aktif. `auth_attempt` menyimpan data rate limit; bersihkan record lama sesuai retensi operasional.

### Reset password Superadmin

`password_hash` berisi hash bcrypt satu arah, bukan password yang dapat dibaca atau dibalik. Untuk menetapkan password baru pada akun Superadmin yang sudah ada, dari terminal interaktif di root project jalankan:

```bash
npx tsx scripts/reset-superadmin-password.ts 90001
```

Ganti `90001` dengan NIK akun Superadmin yang benar. Utilitas meminta password dua kali tanpa menampilkannya, lalu hanya memperbarui hash untuk akun aktif yang role-nya `superadmin`. Pastikan `DATABASE_URL` menunjuk ke database yang benar dan buat backup sebelum operasi database.

### Migrasi penghapusan kolom lama

Setelah backup database, deploy migrasi untuk menghapus `email_verified_at`, satu-satunya kolom user yang sudah tidak dipakai:

```bash
npx prisma migrate deploy
npx prisma generate
```

Kolom `email` tetap digunakan untuk reset password dan `requested_role` tetap digunakan untuk alur persetujuan role. Jangan menghapus `password_hash`, karena aplikasi memerlukannya untuk memverifikasi password tanpa menyimpan password asli.

Role tetap `staf`, `atasan_departemen`, `admin_stationery`, dan `superadmin`; setiap akun tetap memiliki satu departemen. API pengajuan membatasi staf pada data miliknya, atasan pada departemennya, dan API approval memeriksa departemen di server.
