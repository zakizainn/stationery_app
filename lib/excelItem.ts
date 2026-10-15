// Helper bersama untuk impor Excel yang mencocokkan baris ke barang lewat NAMA
// (restock massal, stok awal periode). Murni (tanpa DB) supaya mudah diuji.
import * as XLSX from "xlsx";

export const UKURAN_FILE_MAKS = 5 * 1024 * 1024; // 5 MB
export const BARIS_EXCEL_MAKS = 2000;

/** Membaca sheet pertama jadi baris objek. Nama kolom di-UPPERCASE & di-trim ("Nama " -> "NAMA"). */
export function bacaBarisExcel(buffer: ArrayBuffer): { baris: Record<string, unknown>[]; namaSheet: string } {
  const wb = XLSX.read(buffer, { type: "array" });
  const namaSheet = wb.SheetNames[0];
  if (!namaSheet) throw new Error("File Excel tidak berisi sheet apa pun.");
  const mentah: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[namaSheet], { defval: "" });
  if (mentah.length > BARIS_EXCEL_MAKS) {
    throw new Error(`File terlalu besar: ${mentah.length} baris (maksimal ${BARIS_EXCEL_MAKS}).`);
  }
  const baris = mentah.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim().toUpperCase()] = v;
    return out;
  });
  return { baris, namaSheet };
}

/**
 * Normalisasi nama untuk pencocokan: huruf besar, spasi ganda dirapikan, dan
 * variasi tanda petik/inci disamakan (Excel sering mengubah " jadi “ ”).
 */
export function normalisasiNama(nama: unknown): string {
  return String(nama ?? "")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export interface ItemCocok {
  id: number;
  nama: string;
  satuan: string;
  stok: number;
  aktif: boolean;
}

export type HasilCocok =
  | { ok: true; item: ItemCocok }
  | { ok: false; pesan: string };

/** Membuat fungsi pencocok nama -> barang. Nama kembar setelah normalisasi dianggap ambigu. */
export function buatPencocok(items: ItemCocok[]): (nama: unknown) => HasilCocok {
  const peta = new Map<string, ItemCocok[]>();
  for (const it of items) {
    const k = normalisasiNama(it.nama);
    peta.set(k, [...(peta.get(k) ?? []), it]);
  }
  return (nama) => {
    const k = normalisasiNama(nama);
    if (!k) return { ok: false, pesan: "NAMA kosong." };
    const cocok = peta.get(k);
    if (!cocok) return { ok: false, pesan: "Barang tidak ditemukan. Periksa penulisan nama (harus sama dengan Master Item)." };
    if (cocok.length > 1) return { ok: false, pesan: "Nama ini dipakai lebih dari satu barang, tidak bisa dipastikan." };
    if (!cocok[0].aktif) return { ok: false, pesan: "Barang ini nonaktif." };
    return { ok: true, item: cocok[0] };
  };
}

export type HasilAngka = { kosong: true } | { kosong: false; nilai: number } | { error: string };

/**
 * Membaca sel angka bulat. Sel kosong -> {kosong:true}. Menerima angka Excel
 * maupun teks angka ("12"). Pecahan, huruf, dan negatif ditolak dengan pesan jelas.
 */
export function bacaAngkaBulat(raw: unknown, nama: string): HasilAngka {
  if (raw === "" || raw == null) return { kosong: true };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/\s/g, ""));
  if (!Number.isFinite(n)) return { error: `${nama} "${String(raw)}" bukan angka.` };
  if (!Number.isInteger(n)) return { error: `${nama} ${n} harus bilangan bulat.` };
  if (n < 0) return { error: `${nama} tidak boleh negatif.` };
  return { kosong: false, nilai: n };
}

/** Membuat file xlsx (buffer) dari header + baris. */
export function buatXlsx(namaSheet: string, header: string[], baris: (string | number)[][], lebarKolom: number[]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
  ws["!cols"] = lebarKolom.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, namaSheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
