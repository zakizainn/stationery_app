import { getAuthSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nilaiMovement, nominalMovement } from "@/lib/laporan-nilai";
import { PERIODE_MULAI_FIFO, persediaanPada } from "@/lib/persediaan";
import { getKategoriLabel } from "@/lib/kategori";
import { awalBulanWIB } from "@/lib/waktu";

// Laporan Amount In / Out hanya menghitung PEMBELIAN (masuk) dan PEMAKAIAN (keluar).
// Movement "penyesuaian_*" (STO, edit manual, stok awal) adalah koreksi stok,
// bukan transaksi, jadi sengaja tidak ikut dihitung.
const TIPE_LAPORAN: ("masuk" | "keluar")[] = ["masuk", "keluar"];

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
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

    // Batas bulan diselaraskan ke jam WIB (Asia/Jakarta, UTC+7), bukan zona waktu server.
    const periodeKey = `${year}-${String(month).padStart(2, "0")}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextPeriodeKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
    const start = awalBulanWIB(periodeKey);
    const end = awalBulanWIB(nextPeriodeKey); // awal bulan berikutnya pukul 00:00 WIB (exclusive)

    const movements = await db.stockMovement.findMany({
      where: { tanggal: { gte: start, lt: end }, tipe: { in: TIPE_LAPORAN } },
      include: {
        item: true,
        lapisanPemakaian: { select: { qty: true, harga: true } },
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
      // Nilai movement: barang keluar dihitung FIFO dari rincian lapisan yang dipakai,
      // barang masuk dari harga belinya. Movement lama (sebelum FIFO) tetap dihitung
      // cara lama (harga snapshot). Satu modul dipakai bersama Excel -- lib/laporan-nilai.ts.
      const nv = nilaiMovement(mv);
      const hargaTransaksi = nv.hargaRata;
      const nominal = nv.nominal;
      const hargaTerendah = Math.min(...nv.bagian.map((b) => b.harga));
      const hargaTertinggi = Math.max(...nv.bagian.map((b) => b.harga));

      if (!perItemMap.has(mv.itemId)) {
        perItemMap.set(mv.itemId, {
          itemId: mv.itemId,
          nama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          hargaMin: hargaTerendah,
          hargaMax: hargaTertinggi,
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
      row.hargaMin = Math.min(row.hargaMin, hargaTerendah);
      row.hargaMax = Math.max(row.hargaMax, hargaTertinggi);

      if (!breakdownMap.has(mv.itemId)) breakdownMap.set(mv.itemId, new Map());
      const itemBreakdown = breakdownMap.get(mv.itemId)!;
      // Satu movement keluar bisa memakai beberapa lapisan (harga berbeda): satu baris
      // rincian per harga, sehingga "berapa unit di harga berapa" terlihat jelas.
      const priceRows = nv.bagian.map((b) => {
        if (!itemBreakdown.has(b.harga)) {
          itemBreakdown.set(b.harga, { harga: b.harga, qtyMasuk: 0, nominalMasuk: 0, qtyKeluar: 0, nominalKeluar: 0 });
        }
        return { pr: itemBreakdown.get(b.harga)!, b };
      });

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
        for (const { pr, b } of priceRows) {
          pr.qtyMasuk += b.qty;
          pr.nominalMasuk += b.qty * b.harga;
        }
        kategoriRow.qtyMasuk += mv.qty;
        kategoriRow.nominalMasuk += nominal;
        totalQtyMasuk += mv.qty;
        totalNominalMasuk += nominal;
      } else {
        row.qtyKeluar += mv.qty;
        row.nominalKeluar += nominal;
        for (const { pr, b } of priceRows) {
          pr.qtyKeluar += b.qty;
          pr.nominalKeluar += b.qty * b.harga;
        }
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
        const nv = nilaiMovement(mv);
        return {
          id: mv.id,
          tanggal: mv.tanggal,
          tipe: mv.tipe,
          itemNama: mv.item.nama,
          kategori: mv.item.kategori,
          satuan: mv.item.satuan,
          qty: mv.qty,
          harga: nv.hargaRata,
          nominal: nv.nominal,
          // Pembagian per harga (FIFO). Satu elemen untuk barang masuk / movement lama.
          lapisan: nv.bagian,
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

    // Tren 6 bulan terakhir (termasuk bulan yang dipilih) -- dihitung dalam zona WIB
    const TREND_MONTHS = 6;
    let trendStartYear = year;
    let trendStartMonth = month - (TREND_MONTHS - 1);
    while (trendStartMonth <= 0) {
      trendStartMonth += 12;
      trendStartYear -= 1;
    }
    const trendStart = awalBulanWIB(`${trendStartYear}-${String(trendStartMonth).padStart(2, "0")}`);
    const trendMovements = await db.stockMovement.findMany({
      where: { tanggal: { gte: trendStart, lt: end }, tipe: { in: TIPE_LAPORAN } },
      select: { tanggal: true, tipe: true, qty: true, nilai: true, hargaSaatTransaksi: true, item: { select: { harga: true } } },
    });

    const trenMap = new Map<
      string,
      { year: number; month: number; label: string; nominalMasuk: number; nominalKeluar: number }
    >();
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      let tMonth = month - i;
      let tYear = year;
      while (tMonth <= 0) {
        tMonth += 12;
        tYear -= 1;
      }
      const key = `${tYear}-${tMonth}`;
      const d = awalBulanWIB(`${tYear}-${String(tMonth).padStart(2, "0")}`);
      trenMap.set(key, {
        year: tYear,
        month: tMonth,
        label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
        nominalMasuk: 0,
        nominalKeluar: 0,
      });
    }
    for (const mv of trendMovements) {
      const key = `${mv.tanggal.getFullYear()}-${mv.tanggal.getMonth() + 1}`;
      const row = trenMap.get(key);
      if (!row) continue;
      const nominal = nominalMovement(mv);
      if (mv.tipe === "masuk") row.nominalMasuk += nominal;
      else row.nominalKeluar += nominal;
    }
    const tren = Array.from(trenMap.values());

    // Rekonstruksi persediaan FIFO hanya valid untuk periode setelah sistem FIFO aktif.
    // Periode sebelum PERIODE_MULAI_FIFO tidak memiliki catatan lapisan pemakaian historis.
    const isFifoAktif = periodeKey >= PERIODE_MULAI_FIFO;
    let persediaan: { nilai: number; qty: number; jumlahBarang: number; aktif: boolean } | null = null;
    if (isFifoAktif) {
      const persediaanMap = await persediaanPada(end);
      let persediaanNilai = 0;
      let persediaanQty = 0;
      for (const p of persediaanMap.values()) {
        persediaanNilai += p.nilai;
        persediaanQty += p.qty;
      }
      persediaan = {
        nilai: persediaanNilai,
        qty: persediaanQty,
        jumlahBarang: persediaanMap.size,
        aktif: true,
      };
    }

    return NextResponse.json({
      success: true,
      periode: { year, month, label: start.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) },
      summary: { totalNominalMasuk, totalNominalKeluar, totalQtyMasuk, totalQtyKeluar },
      persediaan,
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
