// Helper tanggal/periode dalam zona waktu WIB (Asia/Jakarta, UTC+7, tanpa DST).
//
// Kenapa file ini ada: batas bulan untuk stok awal & laporan harus mengikuti
// jam dinding WIB, bukan zona waktu server. Server di UTC akan salah memasukkan
// transaksi dini hari tanggal 1 ke bulan sebelumnya.
//
// File ini sengaja MURNI (tanpa import Prisma/DB) supaya aman dipakai di
// komponen client maupun di server.

const WIB_OFFSET = "+07:00";
const POLA_PERIODE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const POLA_TANGGAL = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function periodeValid(periode: string): boolean {
  return POLA_PERIODE.test(periode);
}

/** Periode "YYYY-MM" berdasarkan jam dinding WIB untuk saat tertentu. */
export function periodeSekarangWIB(sekarang: Date = new Date()): string {
  const bagian = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(sekarang);
  const tahun = bagian.find((p) => p.type === "year")?.value;
  const bulan = bagian.find((p) => p.type === "month")?.value;
  return `${tahun}-${bulan}`;
}

/** Awal bulan (00:00 WIB tanggal 1) sebagai Date. Melempar error kalau format salah. */
export function awalBulanWIB(periode: string): Date {
  if (!periodeValid(periode)) {
    throw new Error(`Periode "${periode}" tidak valid. Gunakan format YYYY-MM, misalnya 2026-10.`);
  }
  return new Date(`${periode}-01T00:00:00${WIB_OFFSET}`);
}

/**
 * Tanggal "YYYY-MM-DD" -> Date pada pukul 12:00 WIB.
 * Tengah hari dipilih supaya hari itu tidak bergeser ke hari sebelumnya/sesudahnya
 * ketika dibaca di server dengan zona waktu yang berbeda (UTC maupun WIB).
 * Mengembalikan null kalau formatnya salah atau tanggalnya tidak ada (mis. 2026-02-31).
 */
export function tanggalWIBKeDate(tanggal: string): Date | null {
  if (!POLA_TANGGAL.test(tanggal)) return null;
  const d = new Date(`${tanggal}T12:00:00${WIB_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  // Tolak tanggal yang "meluber" (31 Februari -> 3 Maret).
  const balik = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return balik === tanggal ? d : null;
}

/** Tanggal "YYYY-MM-DD" hari ini menurut WIB. */
export function hariIniWIB(sekarang: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sekarang);
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-10" -> "Oktober 2026" */
export function labelPeriode(periode: string): string {
  const m = POLA_PERIODE.exec(periode);
  if (!m) return periode;
  return `${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}`;
}
