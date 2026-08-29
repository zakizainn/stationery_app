import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { KategoriItem, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const kategori = searchParams.get("kategori") as KategoriItem | null;

    // Pagination untuk infinite scroll di katalog — default 24 item per batch
    // (kelipatan rapi untuk grid 2/3/4 kolom), maksimal 100 untuk jaga-jaga.
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 24;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const whereCondition: Prisma.ItemWhereInput = {};

    if (query) {
      whereCondition.nama = {
        contains: query,
        mode: "insensitive",
      };
    }

    if (kategori && ["barang_umum", "kertas", "checksheet"].includes(kategori)) {
      whereCondition.kategori = kategori;
    }

    // Dropdown "tukar dengan barang lain" butuh daftar penuh, bukan satu batch
    // saja — bypass pagination lewat ?all=1 (tetap hormati filter q/kategori bila ada).
    const returnAll = searchParams.get("all") === "1";

    const [rawItems, total] = await Promise.all([
      db.item.findMany({
        where: whereCondition,
        orderBy: { nama: "asc" },
        ...(returnAll ? {} : { skip: offset, take: limit }),
      }),
      db.item.count({ where: whereCondition }),
    ]);

    // "Stok bayangan": admin/superadmin lihat stok gudang asli (perlu buat
    // restock & proses order akurat). Staf/atasan departemen lihat stok
    // asli dikurangi stokBuffer -- mencegah over-order & jadi safety stock,
    // tanpa mengubah data stok asli di database.
    const session = await getServerSession(authOptions);
    const seesRealStock = session ? ["admin_stationery", "superadmin"].includes(session.user.role) : false;
    const items = rawItems.map((it) =>
      seesRealStock ? it : { ...it, stok: Math.max(0, it.stok - it.stokBuffer) }
    );

    return NextResponse.json({
      success: true,
      data: items,
      pagination: { offset, limit, total, hasMore: offset + items.length < total },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch items";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["admin_stationery", "superadmin"].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { nama, kategori, satuan, stok, stokMinimum, stokBuffer, harga, bisaDitukar, jenisKertas, fotoUrl } = body;

    if (!nama || !kategori || !satuan) {
      return NextResponse.json(
        { success: false, error: "Nama, kategori, dan satuan wajib diisi." },
        { status: 400 }
      );
    }

    const newItem = await db.item.create({
      data: {
        nama,
        kategori,
        satuan,
        stok: Number(stok) || 0,
        stokMinimum: Number(stokMinimum) || 0,
        stokBuffer: Number(stokBuffer) || 0,
        harga: Number(harga) || 0,
        bisaDitukar: Boolean(bisaDitukar),
        jenisKertas: kategori === "kertas" ? jenisKertas : null,
        fotoUrl: fotoUrl || null,
      },
    });

    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create item";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
