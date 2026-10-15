import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKategoriLabel } from "@/lib/kategori";
import { MIME_XLSX, buatXlsx } from "@/lib/excelItem";
import { StokError, statusHttpStokError, setStokAwalPeriode, transaksiStok } from "@/lib/stok";
import { periodeSekarangWIB, periodeValid } from "@/lib/waktu";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

function periodeDariQuery(raw: string | null): string {
  return raw && periodeValid(raw) ? raw : periodeSekarangWIB();
}

// GET ?periode=YYYY-MM            -> status: sudah berapa barang yang punya stok awal di periode itu
// GET ?periode=YYYY-MM&template=1 -> unduh template Excel (isi kolom STOK_AWAL)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const periode = periodeDariQuery(searchParams.get("periode"));

  if (searchParams.get("template") === "1") {
    const items = await db.item.findMany({
      where: { aktif: true },
      orderBy: [{ kategori: "asc" }, { nama: "asc" }],
      select: { nama: true, kategori: true, satuan: true, stok: true },
    });
    const buffer = buatXlsx(
      `Stok Awal ${periode}`,
      ["NAMA", "KATEGORI", "SATUAN", "STOK_SISTEM_SAAT_INI", "STOK_AWAL"],
      items.map((it) => [it.nama, getKategoriLabel(it.kategori), it.satuan, it.stok, ""]),
      [38, 20, 10, 22, 12]
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_XLSX,
        "Content-Disposition": `attachment; filename="template-stok-awal-${periode}.xlsx"`,
      },
    });
  }

  const [jumlah, terakhir, totalAktif] = await Promise.all([
    db.stokAwalBulan.count({ where: { periode } }),
    db.stokAwalBulan.aggregate({ where: { periode }, _max: { updatedAt: true } }),
    db.item.count({ where: { aktif: true } }),
  ]);
  return NextResponse.json({
    success: true,
    data: { periode, jumlahBarang: jumlah, totalBarangAktif: totalAktif, terakhirDiperbarui: terakhir._max.updatedAt },
  });
}

// POST: terapkan stok awal sebuah periode. Body: { periode, baris: [{ itemId, qty }] }
// Satu transaksi: semua barang atau tidak sama sekali.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const periode = String(body?.periode ?? "");
    if (!periodeValid(periode)) {
      return NextResponse.json({ success: false, error: "Periode tidak valid (gunakan format YYYY-MM)." }, { status: 400 });
    }
    if (periode > periodeSekarangWIB()) {
      return NextResponse.json({ success: false, error: "Periode tidak boleh di masa depan." }, { status: 400 });
    }
    if (!Array.isArray(body?.baris) || body.baris.length === 0) {
      return NextResponse.json({ success: false, error: "Tidak ada baris untuk disimpan." }, { status: 400 });
    }

    const baris = body.baris.map((b: Record<string, unknown>) => ({ itemId: Number(b.itemId), qty: Number(b.qty) }));
    const hasil = await transaksiStok((tx) =>
      setStokAwalPeriode(tx, { periode, baris, dibuatOlehId: Number(session.user.id) })
    );

    return NextResponse.json({
      success: true,
      message: `Stok awal ${periode} tersimpan untuk ${hasil.jumlahBarang} barang (${hasil.jumlahDisesuaikan} barang stoknya diselaraskan).`,
      data: hasil,
    });
  } catch (error: unknown) {
    if (error instanceof StokError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusHttpStokError(error) });
    }
    const message = error instanceof Error ? error.message : "Gagal menyimpan stok awal";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
