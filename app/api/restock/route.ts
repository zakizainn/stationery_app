import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { StokError, statusHttpStokError, transaksiStok, ubahStok } from "@/lib/stok";
import { hariIniWIB, tanggalWIBKeDate } from "@/lib/waktu";

const HARI_MAKS_MUNDUR = 60;

export async function GET(_req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const movements = await db.stockMovement.findMany({
      include: {
        item: true,
        dibuatOleh: { select: { nama: true } },
        refRequest: {
          include: {
            user: { select: { nama: true } },
            departemen: { select: { kode: true } },
          },
        },
      },
      orderBy: { tanggal: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: movements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock movements";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { itemId, tanggal, catatan } = body;
    const qty = Number(body.qty);
    // Harga beli per satuan (opsional). Kosong = harga master. Membentuk lapisan FIFO
    // berharga ini; TIDAK mengubah harga master barang.
    const harga = body.harga === undefined || body.harga === null || body.harga === "" ? null : Number(body.harga);

    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, error: "Pilih barang dan masukkan jumlah stok yang valid (bilangan bulat > 0)." },
        { status: 400 }
      );
    }

    // Tanggal opsional (YYYY-MM-DD, WIB) -- untuk mencatat barang yang datang di hari sebelumnya.
    let tanggalMasuk: Date | undefined;
    if (tanggal) {
      const t = String(tanggal);
      const d = tanggalWIBKeDate(t);
      if (!d) {
        return NextResponse.json({ success: false, error: "Format tanggal tidak valid (gunakan YYYY-MM-DD)." }, { status: 400 });
      }
      if (t > hariIniWIB()) {
        return NextResponse.json({ success: false, error: "Tanggal restock tidak boleh di masa depan." }, { status: 400 });
      }
      if (Date.now() - d.getTime() > HARI_MAKS_MUNDUR * 86_400_000) {
        return NextResponse.json({ success: false, error: `Tanggal restock terlalu lampau (maksimal ${HARI_MAKS_MUNDUR} hari ke belakang).` }, { status: 400 });
      }
      tanggalMasuk = d;
    }

    const item = await transaksiStok((tx) =>
      ubahStok(tx, {
        itemId: Number(itemId),
        tipe: "masuk",
        qty,
        sumber: "restock",
        harga,
        tanggal: tanggalMasuk,
        catatan: catatan ? String(catatan) : null,
        dibuatOlehId: Number(session.user.id),
      })
    );

    return NextResponse.json({ success: true, message: `Stok ${item.namaItem} berhasil ditambah sebanyak ${qty} ${item.satuan}.` });
  } catch (error: unknown) {
    if (error instanceof StokError) {
      return NextResponse.json({ success: false, error: error.message }, { status: statusHttpStokError(error) });
    }
    const message = error instanceof Error ? error.message : "Failed to restock item";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
