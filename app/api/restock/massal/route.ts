import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { StokError, statusHttpStokError, transaksiStok, ubahStokMasukBanyak, type BarisMasuk } from "@/lib/stok";
import { hariIniWIB, tanggalWIBKeDate } from "@/lib/waktu";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];
const HARI_MAKS_MUNDUR = 366;

// POST: simpan restock banyak barang sekaligus dalam SATU transaksi.
// Body: { tanggal?: "YYYY-MM-DD", catatan?: string, baris: [{ itemId, qty, harga? }] }
// Semua baris berhasil atau semuanya dibatalkan.
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    if (!Array.isArray(body?.baris) || body.baris.length === 0) {
      return NextResponse.json({ success: false, error: "Tidak ada baris untuk disimpan." }, { status: 400 });
    }

    // Tanggal barang datang (WIB). Default: sekarang. Tidak boleh di masa depan.
    let tanggal: Date | undefined;
    if (body.tanggal) {
      const t = String(body.tanggal);
      const d = tanggalWIBKeDate(t);
      if (!d) {
        return NextResponse.json({ success: false, error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)." }, { status: 400 });
      }
      if (t > hariIniWIB()) {
        return NextResponse.json({ success: false, error: "Tanggal restock tidak boleh di masa depan." }, { status: 400 });
      }
      if (Date.now() - d.getTime() > HARI_MAKS_MUNDUR * 86_400_000) {
        return NextResponse.json({ success: false, error: "Tanggal restock terlalu lama (maksimal 1 tahun ke belakang)." }, { status: 400 });
      }
      tanggal = d;
    }

    const baris: BarisMasuk[] = body.baris.map((b: Record<string, unknown>) => ({
      itemId: Number(b.itemId),
      qty: Number(b.qty),
      harga: b.harga === null || b.harga === undefined || b.harga === "" ? null : Number(b.harga),
    }));

    const hasil = await transaksiStok((tx) =>
      ubahStokMasukBanyak(tx, {
        baris,
        sumber: "restock_massal",
        tanggal,
        catatan: body.catatan ? String(body.catatan) : null,
        dibuatOlehId: Number(session.user.id),
      })
    );

    return NextResponse.json({
      success: true,
      message: `Restock berhasil disimpan: ${hasil.jumlahBarang} barang, total ${hasil.totalQty} unit.`,
      data: hasil,
    });
  } catch (error: unknown) {
    if (error instanceof StokError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusHttpStokError(error) });
    }
    const message = error instanceof Error ? error.message : "Gagal menyimpan restock massal";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
