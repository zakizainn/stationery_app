import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { UKURAN_FILE_MAKS, bacaAngkaBulat, bacaBarisExcel, buatPencocok } from "@/lib/excelItem";
import { StokError, hitungBaseline, statusHttpStokError } from "@/lib/stok";
import { periodeSekarangWIB, periodeValid } from "@/lib/waktu";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

// POST (FormData: file, periode): PRATINJAU stok awal. Tidak menulis apa pun.
// Mengembalikan, per baris, stok sistem sekarang, stok awal dari Excel, mutasi
// bulan berjalan, dan stok hasil akhir yang akan diterapkan.
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const periode = String(formData.get("periode") ?? "");
    if (!periodeValid(periode)) {
      return NextResponse.json({ success: false, error: "Periode tidak valid (gunakan format YYYY-MM)." }, { status: 400 });
    }
    if (periode > periodeSekarangWIB()) {
      return NextResponse.json({ success: false, error: "Periode tidak boleh di masa depan." }, { status: 400 });
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "File Excel tidak ditemukan." }, { status: 400 });
    }
    if (file.size > UKURAN_FILE_MAKS) {
      return NextResponse.json({ success: false, error: "File terlalu besar (maksimal 5 MB)." }, { status: 400 });
    }

    const { baris } = bacaBarisExcel(await file.arrayBuffer());
    if (baris.length === 0) {
      return NextResponse.json({ success: false, error: "File Excel kosong." }, { status: 400 });
    }
    if (!("NAMA" in baris[0]) || !("STOK_AWAL" in baris[0])) {
      return NextResponse.json(
        { success: false, error: 'Kolom "NAMA" dan "STOK_AWAL" wajib ada. Gunakan template dari tombol "Unduh template".' },
        { status: 400 }
      );
    }

    const semua = await db.item.findMany({ select: { id: true, nama: true, satuan: true, stok: true, aktif: true } });
    const cocok = buatPencocok(semua);

    type Baris = {
      rowNum: number;
      nama: string;
      itemId?: number;
      itemNama?: string;
      satuan?: string;
      stokSistem?: number;
      stokAwal?: number;
      mutasiBerjalan?: number;
      stokSesudah?: number;
      selisih?: number;
      status: "ok" | "error";
      pesan?: string;
    };
    const hasil: Baris[] = [];
    const valid: Baris[] = [];
    const sudahAda = new Set<number>();
    let dilewati = 0;

    baris.forEach((row, i) => {
      const rowNum = i + 2;
      const namaRaw = String(row["NAMA"] ?? "").trim();
      const awal = bacaAngkaBulat(row["STOK_AWAL"], "STOK_AWAL");
      if (!namaRaw && "kosong" in awal && awal.kosong) return;
      if ("kosong" in awal && awal.kosong) {
        dilewati++; // STOK_AWAL dikosongkan = barang ini tidak diselaraskan
        return;
      }
      if ("error" in awal) return void hasil.push({ rowNum, nama: namaRaw, status: "error", pesan: awal.error });

      const m = cocok(namaRaw);
      if (!m.ok) return void hasil.push({ rowNum, nama: namaRaw, status: "error", pesan: m.pesan });
      if (sudahAda.has(m.item.id)) {
        return void hasil.push({ rowNum, nama: namaRaw, status: "error", pesan: "Barang ini muncul lebih dari sekali di file." });
      }
      sudahAda.add(m.item.id);

      const b: Baris = {
        rowNum,
        nama: namaRaw,
        itemId: m.item.id,
        itemNama: m.item.nama,
        satuan: m.item.satuan,
        stokSistem: m.item.stok,
        stokAwal: "kosong" in awal && !awal.kosong ? awal.nilai : 0,
        status: "ok",
      };
      hasil.push(b);
      valid.push(b);
    });

    if (valid.length > 0) {
      const rencana = await db.$transaction((tx) =>
        hitungBaseline(tx, periode, valid.map((b) => ({ itemId: b.itemId!, qty: b.stokAwal! })))
      );
      const peta = new Map(rencana.map((r) => [r.itemId, r]));
      for (const b of valid) {
        const r = peta.get(b.itemId!)!;
        b.mutasiBerjalan = r.mutasiBerjalan;
        b.stokSesudah = r.stokSesudah;
        b.selisih = r.stokSesudah - r.stokSebelum;
        if (r.stokSesudah < 0) {
          b.status = "error";
          b.pesan = `Stok awal ${r.stokAwal} + mutasi bulan ini ${r.mutasiBerjalan} menjadi negatif.`;
        }
      }
    }

    const ok = hasil.filter((h) => h.status === "ok");
    return NextResponse.json({
      success: true,
      data: {
        periode,
        baris: hasil,
        ringkasan: {
          valid: ok.length,
          error: hasil.length - ok.length,
          dilewati,
          berubah: ok.filter((h) => (h.selisih ?? 0) !== 0).length,
          sama: ok.filter((h) => (h.selisih ?? 0) === 0).length,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof StokError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusHttpStokError(error) });
    }
    const message = error instanceof Error ? error.message : "Gagal membaca file Excel";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
