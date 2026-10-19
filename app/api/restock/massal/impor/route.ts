import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getKategoriLabel } from "@/lib/kategori";
import {
  MIME_XLSX,
  UKURAN_FILE_MAKS,
  bacaAngkaBulat,
  bacaBarisExcel,
  buatPencocok,
  buatXlsx,
} from "@/lib/excelItem";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

// GET: unduh template restock berisi SELURUH barang aktif. Admin cukup mengisi
// kolom QTY (dan HARGA bila harga beli berbeda) untuk barang yang datang;
// baris dengan QTY kosong diabaikan.
export async function GET() {
  const session = await getAuthSession();
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const items = await db.item.findMany({
    where: { aktif: true },
    orderBy: [{ kategori: "asc" }, { nama: "asc" }],
    select: { nama: true, kategori: true, satuan: true, stok: true },
  });

  const buffer = buatXlsx(
    "Restock",
    ["NAMA", "KATEGORI", "SATUAN", "STOK_SAAT_INI", "QTY", "HARGA"],
    items.map((it) => [it.nama, getKategoriLabel(it.kategori), it.satuan, it.stok, "", ""]),
    [38, 20, 10, 14, 10, 12]
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_XLSX,
      "Content-Disposition": 'attachment; filename="template-restock-massal.xlsx"',
    },
  });
}

// POST: PRATINJAU saja (tidak menulis apa pun ke database). Membaca file,
// mencocokkan NAMA ke barang aktif, dan mengembalikan tiap baris beserta
// statusnya supaya admin bisa memeriksa sebelum menyimpan.
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "File Excel tidak ditemukan." }, { status: 400 });
    }
    if (file.size > UKURAN_FILE_MAKS) {
      return NextResponse.json({ success: false, error: "File terlalu besar (maksimal 5 MB)." }, { status: 400 });
    }

    const { baris, namaSheet } = bacaBarisExcel(await file.arrayBuffer());
    if (baris.length === 0) {
      return NextResponse.json({ success: false, error: "File Excel kosong." }, { status: 400 });
    }
    if (!("NAMA" in baris[0]) || !("QTY" in baris[0])) {
      return NextResponse.json(
        { success: false, error: 'Kolom "NAMA" dan "QTY" wajib ada. Gunakan template dari tombol "Unduh template".' },
        { status: 400 }
      );
    }

    // Cocokkan terhadap SEMUA barang (termasuk nonaktif) supaya pesannya jelas
    // ("nonaktif", bukan "tidak ditemukan").
    const semua = await db.item.findMany({ select: { id: true, nama: true, satuan: true, stok: true, aktif: true } });
    const cocok = buatPencocok(semua);

    type Status = "ok" | "error";
    const hasil: {
      rowNum: number;
      nama: string;
      itemId?: number;
      itemNama?: string;
      satuan?: string;
      stokSaatIni?: number;
      qty?: number;
      harga: number | null;
      status: Status;
      pesan?: string;
    }[] = [];
    let dilewati = 0;

    baris.forEach((row, i) => {
      const rowNum = i + 2; // baris 1 = header
      const namaRaw = String(row["NAMA"] ?? "").trim();
      const qty = bacaAngkaBulat(row["QTY"], "QTY");
      const harga = bacaAngkaBulat(row["HARGA"], "HARGA");

      if (!namaRaw && "kosong" in qty && qty.kosong) return; // baris kosong sama sekali
      if ("kosong" in qty && (qty.kosong || qty.nilai === 0)) {
        dilewati++; // barang ada di template tapi tidak datang
        return;
      }

      const dasar = { rowNum, nama: namaRaw, harga: "kosong" in harga && !harga.kosong ? harga.nilai : null };
      if ("error" in qty) return void hasil.push({ ...dasar, status: "error", pesan: qty.error });
      if ("error" in harga) return void hasil.push({ ...dasar, status: "error", pesan: harga.error });

      const m = cocok(namaRaw);
      if (!m.ok) return void hasil.push({ ...dasar, status: "error", pesan: m.pesan });

      hasil.push({
        ...dasar,
        itemId: m.item.id,
        itemNama: m.item.nama,
        satuan: m.item.satuan,
        stokSaatIni: m.item.stok,
        qty: qty.nilai,
        status: "ok",
      });
    });

    const valid = hasil.filter((h) => h.status === "ok");
    return NextResponse.json({
      success: true,
      data: {
        namaSheet,
        baris: hasil,
        ringkasan: {
          valid: valid.length,
          error: hasil.length - valid.length,
          dilewati,
          totalQty: valid.reduce((s, h) => s + (h.qty ?? 0), 0),
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal membaca file Excel";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
