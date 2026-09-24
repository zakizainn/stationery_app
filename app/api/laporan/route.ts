import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKategoriLabel } from "@/lib/kategori";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    // month format: "YYYY-MM" (dari <input type="month">). Default: bulan berjalan.
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // awal bulan berikutnya (exclusive)

    const movements = await db.stockMovement.findMany({
      where: { tanggal: { gte: start, lt: end } },
      include: {
        item: true,
        refRequest: {
          include: {
            departemen: { select: { id: true, nama: true, kode: true } },
            user: { select: { nama: true } },
          },
        },
      },
      orderBy: { tanggal: "asc" },
    });

    // Rekap per item
    const perItemMap = new Map<
      number,
      { itemId: number; nama: string; kategori: string; satuan: string; hargaMin: number; hargaMax: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();

    // Rincian per titik harga dalam tiap item -- supaya kalau harga berubah
    // lebih dari sekali, admin bisa lihat persis qty & nominal di tiap harga,
    // bukan cuma rentang min-max.
    const breakdownMap = new Map<
      number,
      Map<number, { harga: number; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }>
    >();

    // Rekap per departemen (hanya relevan untuk transaksi keluar, karena masuk/restock tidak terikat departemen)
    const perDeptMap = new Map<string, { departemen: string; qtyKeluar: number; nominalKeluar: number }>();

    // Rekap per kategori item (ATK, Kertas, Checksheet, Catridge/Toner/Tinta) --
    // level yang lebih ringkas dari per barang, biasanya ini yang paling dicari
    // manajemen (mis. "berapa habis buat kertas bulan ini").
    const perKategoriMap = new Map<
      string,
      { kategori: string; label: string; qtyMasuk: number; nominalMasuk: number; qtyKeluar: number; nominalKeluar: number }
    >();

    let totalNominalMasuk = 0;
    let totalNominalKeluar = 0;
    let totalQtyMasuk = 0;
    let totalQtyKeluar = 0;

    for (const mv of movements) {
      // Pakai harga snapshot saat transaksi (bukan mv.item.harga yang bisa berubah
      // kalau admin edit harga item sekarang) -- supaya laporan bulan lalu tidak
      // ikut berubah gara-gara harga terbaru.
      const hargaTransaksi = mv.hargaSaatTransaksi || mv.item.harga;
      const nominal = mv.qty * hargaTransaksi;

      if (!perItemMap.has(mv.itemId)) {
        perItemMap.set(mv.itemId, {
          itemId: mv.itemId,
          nama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          hargaMin: hargaTransaksi,
          hargaMax: hargaTransaksi,
          qtyMasuk: 0,
          nominalMasuk: 0,
          qtyKeluar: 0,
          nominalKeluar: 0,
        });
      }
      const row = perItemMap.get(mv.itemId)!;
      // Catat rentang harga -- kalau harga sempat berubah di tengah periode
      // (mis. restock pertama Rp550, restock kedua Rp750), tabel perlu nunjukin
      // rentangnya, bukan cuma harga transaksi pertama yang ketemu.
      row.hargaMin = Math.min(row.hargaMin, hargaTransaksi);
      row.hargaMax = Math.max(row.hargaMax, hargaTransaksi);

      if (!breakdownMap.has(mv.itemId)) breakdownMap.set(mv.itemId, new Map());
      const itemBreakdown = breakdownMap.get(mv.itemId)!;
      if (!itemBreakdown.has(hargaTransaksi)) {
        itemBreakdown.set(hargaTransaksi, { harga: hargaTransaksi, qtyMasuk: 0, nominalMasuk: 0, qtyKeluar: 0, nominalKeluar: 0 });
      }
      const priceRow = itemBreakdown.get(hargaTransaksi)!;

      if (!perKategoriMap.has(mv.item.kategori)) {
        perKategoriMap.set(mv.item.kategori, {
          kategori: mv.item.kategori,
          label: getKategoriLabel(mv.item.kategori),
          qtyMasuk: 0,
          nominalMasuk: 0,
          qtyKeluar: 0,
          nominalKeluar: 0,
        });
      }
      const kategoriRow = perKategoriMap.get(mv.item.kategori)!;

      if (mv.tipe === "masuk") {
        row.qtyMasuk += mv.qty;
        row.nominalMasuk += nominal;
        priceRow.qtyMasuk += mv.qty;
        priceRow.nominalMasuk += nominal;
        kategoriRow.qtyMasuk += mv.qty;
        kategoriRow.nominalMasuk += nominal;
        totalQtyMasuk += mv.qty;
        totalNominalMasuk += nominal;
      } else {
        row.qtyKeluar += mv.qty;
        row.nominalKeluar += nominal;
        priceRow.qtyKeluar += mv.qty;
        priceRow.nominalKeluar += nominal;
        kategoriRow.qtyKeluar += mv.qty;
        kategoriRow.nominalKeluar += nominal;
        totalQtyKeluar += mv.qty;
        totalNominalKeluar += nominal;

        const deptNama = mv.refRequest?.departemen?.nama ?? "Tidak diketahui";
        if (!perDeptMap.has(deptNama)) {
          perDeptMap.set(deptNama, { departemen: deptNama, qtyKeluar: 0, nominalKeluar: 0 });
        }
        const deptRow = perDeptMap.get(deptNama)!;
        deptRow.qtyKeluar += mv.qty;
        deptRow.nominalKeluar += nominal;
      }
    }

    // Detail transaksi mentah -- 1 baris per StockMovement, supaya laporan bisa
    // ditelusuri sampai ke pengajuan & pemohon aslinya (bukan cuma angka rekap).
    // Transaksi "masuk" (restock) tidak terikat pengajuan/departemen/pemohon
    // karena diinput langsung oleh admin stationery.
    const detailTransaksi = movements
      .map((mv) => {
        const hargaTransaksi = mv.hargaSaatTransaksi || mv.item.harga;
        return {
          id: mv.id,
          tanggal: mv.tanggal,
          tipe: mv.tipe,
          itemNama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          qty: mv.qty,
          harga: hargaTransaksi,
          nominal: mv.qty * hargaTransaksi,
          noPengajuan: mv.refRequest?.noPengajuan ?? null,
          departemen: mv.refRequest?.departemen?.nama ?? null,
          pemohon: mv.refRequest?.user?.nama ?? null,
        };
      })
      .sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime()); // terbaru dulu

    const perItem = Array.from(perItemMap.values())
      .sort((a, b) => b.nominalKeluar - a.nominalKeluar)
      .map((it) => ({
        ...it,
        breakdown: Array.from(breakdownMap.get(it.itemId)?.values() ?? []).sort((a, b) => a.harga - b.harga),
      }));
    const perDepartemen = Array.from(perDeptMap.values()).sort((a, b) => b.nominalKeluar - a.nominalKeluar);
    const perKategori = Array.from(perKategoriMap.values()).sort(
      (a, b) => b.nominalMasuk + b.nominalKeluar - (a.nominalMasuk + a.nominalKeluar)
    );

    // Tren 6 bulan terakhir (termasuk bulan yang dipilih) -- dipakai buat grafik
    // tren di dashboard visualisasi. Sengaja query terpisah dari `movements` di
    // atas (yang scope-nya cuma 1 bulan) supaya query utama tetap ringan.
    const TREND_MONTHS = 6;
    const trendStart = new Date(year, month - 1 - (TREND_MONTHS - 1), 1);
    const trendMovements = await db.stockMovement.findMany({
      where: { tanggal: { gte: trendStart, lt: end } },
      select: { tanggal: true, tipe: true, qty: true, hargaSaatTransaksi: true, item: { select: { harga: true } } },
    });

    const trenMap = new Map<
      string,
      { year: number; month: number; label: string; nominalMasuk: number; nominalKeluar: number }
    >();
    // Inisialisasi semua 6 bulan dengan 0 dulu -- supaya bulan tanpa transaksi
    // tetap muncul di grafik (bukan bolong), bukan cuma bulan yang ada datanya.
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      trenMap.set(key, {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
        nominalMasuk: 0,
        nominalKeluar: 0,
      });
    }
    for (const mv of trendMovements) {
      const key = `${mv.tanggal.getFullYear()}-${mv.tanggal.getMonth() + 1}`;
      const row = trenMap.get(key);
      if (!row) continue;
      const hargaTransaksi = mv.hargaSaatTransaksi || mv.item.harga;
      const nominal = mv.qty * hargaTransaksi;
      if (mv.tipe === "masuk") row.nominalMasuk += nominal;
      else row.nominalKeluar += nominal;
    }
    const tren = Array.from(trenMap.values());

    return NextResponse.json({
      success: true,
      periode: { year, month, label: start.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) },
      summary: { totalNominalMasuk, totalNominalKeluar, totalQtyMasuk, totalQtyKeluar },
      perItem,
      perDepartemen,
      perKategori,
      detailTransaksi,
      tren,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate laporan";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
