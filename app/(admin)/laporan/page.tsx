"use client";

import { useEffect, useState, Fragment } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface HargaBreakdown {
  harga: number;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface PerItemRow {
  itemId: number;
  nama: string;
  kategori: string;
  satuan: string;
  hargaMin: number;
  hargaMax: number;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
  breakdown: HargaBreakdown[];
}

interface PerDeptRow {
  departemen: string;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface PerKategoriRow {
  kategori: string;
  label: string;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface DetailTransaksiRow {
  id: number;
  tanggal: string;
  tipe: "masuk" | "keluar";
  itemNama: string;
  kategori: string;
  satuan: string;
  qty: number;
  harga: number;
  nominal: number;
  noPengajuan: string | null;
  departemen: string | null;
  pemohon: string | null;
}

interface TrenRow {
  year: number;
  month: number;
  label: string;
  nominalMasuk: number;
  nominalKeluar: number;
}

interface LaporanData {
  periode: { year: number; month: number; label: string };
  summary: { totalNominalMasuk: number; totalNominalKeluar: number; totalQtyMasuk: number; totalQtyKeluar: number };
  perItem: PerItemRow[];
  perDepartemen: PerDeptRow[];
  perKategori: PerKategoriRow[];
  detailTransaksi: DetailTransaksiRow[];
  tren: TrenRow[];
}

// Warna khusus buat chart (beda dari brand-700 yang dipakai di tabel/card) --
// brand-700 (#a3000d) dan rose-700 (#be123c) sama-sama merah tua, gampang
// ketuker kalau ditaruh bersebelahan sebagai bar/garis. Biru vs rose jauh
// lebih kebeda, terutama buat legend & bar yang berdampingan.
const COLOR_MASUK = "#2563eb"; // blue-600
const COLOR_KELUAR = "#be123c"; // rose-700, tetap konsisten sama kartu "Amount Out"

function rupiahSingkat(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-md px-3 py-2 text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {rupiah(p.value)}
        </p>
      ))}
    </div>
  );
}

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function tanggalPendek(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function LaporanPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState<LaporanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailTipeFilter, setDetailTipeFilter] = useState<"semua" | "masuk" | "keluar">("semua");
  const [view, setView] = useState<"tabel" | "grafik">("tabel");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/laporan?month=${month}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [month]);

  const net = data ? data.summary.totalNominalMasuk - data.summary.totalNominalKeluar : 0;

  const filteredDetail = (data?.detailTransaksi ?? []).filter((row) => {
    if (detailTipeFilter !== "semua" && row.tipe !== detailTipeFilter) return false;
    if (!detailSearch.trim()) return true;
    const q = detailSearch.trim().toLowerCase();
    return (
      row.itemNama.toLowerCase().includes(q) ||
      (row.noPengajuan?.toLowerCase().includes(q) ?? false) ||
      (row.departemen?.toLowerCase().includes(q) ?? false) ||
      (row.pemohon?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-md border border-slate-200/80 shadow-xs print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Laporan Amount In / Amount Out</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pembelian (restock) dan pemakaian barang stationery secara periodik, lengkap dengan nominal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md p-0.5 text-xs font-bold print:hidden">
            <button
              type="button"
              onClick={() => setView("tabel")}
              className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                view === "tabel" ? "bg-white text-brand-700 shadow-xs" : "text-slate-500"
              }`}
            >
              📋 Tabel
            </button>
            <button
              type="button"
              onClick={() => setView("grafik")}
              className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                view === "grafik" ? "bg-white text-brand-700 shadow-xs" : "text-slate-500"
              }`}
            >
              📈 Grafik
            </button>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-bold text-slate-700"
          />
          <a
            href={`/api/laporan/export?month=${month}`}
            className="bg-brand-700 hover:bg-brand-800 text-white font-bold px-4 py-2 rounded-md text-xs transition-all shadow-sm shrink-0 cursor-pointer inline-flex items-center"
          >
            📊 Export Excel
          </a>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Memuat laporan...</div>
      ) : !data ? (
        <div className="py-12 text-center text-xs text-slate-500">Gagal memuat laporan.</div>
      ) : (
        <>
          <p className="text-xs text-slate-400 -mt-2">Periode: {data.periode.label}</p>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-md border border-brand-100 shadow-xs">
              <div className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                Amount In (Restock/Pembelian)
              </div>
              <div className="text-2xl font-black text-brand-700 mt-1">{rupiah(data.summary.totalNominalMasuk)}</div>
              <div className="text-[11px] text-slate-400 mt-1">{data.summary.totalQtyMasuk} unit masuk</div>
            </div>

            <div className="bg-white p-5 rounded-md border border-rose-100 shadow-xs">
              <div className="text-xs font-bold text-rose-600 uppercase tracking-wider">Amount Out (Pemakaian)</div>
              <div className="text-2xl font-black text-rose-700 mt-1">{rupiah(data.summary.totalNominalKeluar)}</div>
              <div className="text-[11px] text-slate-400 mt-1">{data.summary.totalQtyKeluar} unit keluar</div>
            </div>

            <div className="bg-white p-5 rounded-md border border-slate-200/80 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selisih (In − Out)</div>
              <div className={`text-2xl font-black mt-1 ${net >= 0 ? "text-slate-900" : "text-rose-700"}`}>
                {rupiah(net)}
              </div>
            </div>
          </div>

          {view === "grafik" ? (
            <>
              {/* Tren 6 Bulan Terakhir */}
              <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Tren Amount In / Out — 6 Bulan Terakhir
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Independen dari filter bulan di atas, selalu menampilkan 6 bulan hingga periode yang dipilih.
                  </p>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.tren} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={rupiahSingkat} width={48} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="nominalMasuk" name="Amount In" stroke={COLOR_MASUK} strokeWidth={2} dot={{ r: 3 }} />
                      <Line
                        type="monotone"
                        dataKey="nominalKeluar"
                        name="Amount Out"
                        stroke={COLOR_KELUAR}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Komposisi per Kategori */}
              <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Komposisi Nominal per Kategori
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.perKategori} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={rupiahSingkat} width={48} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="nominalMasuk" name="Amount In" fill={COLOR_MASUK} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="nominalKeluar" name="Amount Out" fill={COLOR_KELUAR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Barang Paling Banyak Keluar */}
              <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Top 8 Barang Paling Banyak Keluar
                </h2>
                {data.perItem.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">Tidak ada transaksi keluar pada periode ini.</div>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.perItem.slice(0, 8)}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={rupiahSingkat} />
                        <YAxis
                          type="category"
                          dataKey="nama"
                          tick={{ fontSize: 11 }}
                          stroke="#94a3b8"
                          width={140}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="nominalKeluar" name="Nominal Keluar" fill={COLOR_KELUAR} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Pemakaian per Departemen */}
              <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Pemakaian per Departemen
                </h2>
                {data.perDepartemen.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">Belum ada pemakaian pada periode ini.</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.perDepartemen} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="departemen" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={rupiahSingkat} width={48} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="nominalKeluar" name="Nominal Keluar" fill={COLOR_KELUAR} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
          {/* Per Kategori */}
          <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Rekap per Kategori</h2>

            {data.perKategori.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Tidak ada transaksi stok pada periode ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Qty Masuk</th>
                      <th className="py-3 px-4">Nominal Masuk</th>
                      <th className="py-3 px-4">Qty Keluar</th>
                      <th className="py-3 px-4">Nominal Keluar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {data.perKategori.map((k) => (
                      <tr key={k.kategori} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-900">{k.label}</td>
                        <td className="py-3 px-4 text-brand-700">{k.qtyMasuk}</td>
                        <td className="py-3 px-4 text-brand-700">{rupiah(k.nominalMasuk)}</td>
                        <td className="py-3 px-4 text-rose-700">{k.qtyKeluar}</td>
                        <td className="py-3 px-4 text-rose-700">{rupiah(k.nominalKeluar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per Item */}
          <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Detail Amount In / Out per Barang
            </h2>

            {data.perItem.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Tidak ada transaksi stok pada periode ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Nama Barang</th>
                      <th className="py-3 px-4">Harga Satuan</th>
                      <th className="py-3 px-4">Qty Masuk</th>
                      <th className="py-3 px-4">Nominal Masuk</th>
                      <th className="py-3 px-4">Qty Keluar</th>
                      <th className="py-3 px-4">Nominal Keluar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {data.perItem.map((it) => (
                      <Fragment key={it.itemId}>
                        <tr className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-bold text-slate-900">{it.nama}</td>
                          <td className="py-3 px-4">
                            {it.hargaMin === it.hargaMax ? (
                              rupiah(it.hargaMin)
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span>
                                  {rupiah(it.hargaMin)} – {rupiah(it.hargaMax)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemId(expandedItemId === it.itemId ? null : it.itemId)}
                                  title="Klik untuk lihat rincian tiap harga"
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  Berubah {expandedItemId === it.itemId ? "▲" : "▼"}
                                </button>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-brand-700">
                            {it.qtyMasuk} {it.satuan}
                          </td>
                          <td className="py-3 px-4 text-brand-700">{rupiah(it.nominalMasuk)}</td>
                          <td className="py-3 px-4 text-rose-700">
                            {it.qtyKeluar} {it.satuan}
                          </td>
                          <td className="py-3 px-4 text-rose-700">{rupiah(it.nominalKeluar)}</td>
                        </tr>
                        {expandedItemId === it.itemId && (
                          <tr>
                            <td colSpan={6} className="bg-amber-50/50 px-4 py-3">
                              <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-2">
                                Rincian per harga — {it.nama}
                              </p>
                              <table className="w-full text-[11px]">
                                <thead className="text-slate-400 font-bold uppercase">
                                  <tr>
                                    <th className="text-left py-1.5 px-2">Harga</th>
                                    <th className="text-left py-1.5 px-2">Qty Masuk</th>
                                    <th className="text-left py-1.5 px-2">Nominal Masuk</th>
                                    <th className="text-left py-1.5 px-2">Qty Keluar</th>
                                    <th className="text-left py-1.5 px-2">Nominal Keluar</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {it.breakdown.map((b) => (
                                    <tr key={b.harga} className="border-t border-amber-100">
                                      <td className="py-1.5 px-2 font-bold text-slate-800">{rupiah(b.harga)}</td>
                                      <td className="py-1.5 px-2 text-brand-700">
                                        {b.qtyMasuk > 0 ? `${b.qtyMasuk} ${it.satuan}` : "-"}
                                      </td>
                                      <td className="py-1.5 px-2 text-brand-700">
                                        {b.qtyMasuk > 0 ? rupiah(b.nominalMasuk) : "-"}
                                      </td>
                                      <td className="py-1.5 px-2 text-rose-700">
                                        {b.qtyKeluar > 0 ? `${b.qtyKeluar} ${it.satuan}` : "-"}
                                      </td>
                                      <td className="py-1.5 px-2 text-rose-700">
                                        {b.qtyKeluar > 0 ? rupiah(b.nominalKeluar) : "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per Departemen */}
          <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Rekapitulasi Pemakaian per Departemen
            </h2>
            <p className="text-[11px] text-slate-400 -mt-2">
              Hanya mencakup transaksi keluar (restock/pembelian tidak terikat departemen tertentu).
            </p>

            {data.perDepartemen.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada pemakaian pada periode ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Departemen</th>
                      <th className="py-3 px-4">Total Qty Diambil</th>
                      <th className="py-3 px-4">Total Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {data.perDepartemen.map((d) => (
                      <tr key={d.departemen} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-900">{d.departemen}</td>
                        <td className="py-3 px-4">{d.qtyKeluar} unit</td>
                        <td className="py-3 px-4 font-extrabold text-rose-700">{rupiah(d.nominalKeluar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Transaksi */}
          <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Detail Transaksi</h2>
                <p className="text-[11px] text-slate-400 mt-1">
                  Riwayat tiap transaksi stok pada periode ini, lengkap dengan pengajuan & pemohon (khusus barang keluar).
                </p>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <select
                  value={detailTipeFilter}
                  onChange={(e) => setDetailTipeFilter(e.target.value as "semua" | "masuk" | "keluar")}
                  className="bg-slate-50 border border-slate-200 rounded-md px-2 py-2 text-xs font-bold text-slate-700"
                >
                  <option value="semua">Semua Tipe</option>
                  <option value="masuk">Masuk</option>
                  <option value="keluar">Keluar</option>
                </select>
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Cari barang, no. pengajuan, departemen, pemohon..."
                  className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-700 w-64"
                />
              </div>
            </div>

            {filteredDetail.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {data.detailTransaksi.length === 0
                  ? "Tidak ada transaksi stok pada periode ini."
                  : "Tidak ada transaksi yang cocok dengan pencarian."}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto print:max-h-none print:overflow-visible">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 sticky top-0 print:static">
                    <tr>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Tipe</th>
                      <th className="py-3 px-4">Barang</th>
                      <th className="py-3 px-4">Qty</th>
                      <th className="py-3 px-4">Nominal</th>
                      <th className="py-3 px-4">No. Pengajuan</th>
                      <th className="py-3 px-4">Departemen</th>
                      <th className="py-3 px-4">Pemohon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredDetail.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">{tanggalPendek(row.tanggal)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              row.tipe === "masuk" ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {row.tipe}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.itemNama}</td>
                        <td className="py-3 px-4">
                          {row.qty} {row.satuan}
                        </td>
                        <td className={`py-3 px-4 font-bold ${row.tipe === "masuk" ? "text-brand-700" : "text-rose-700"}`}>
                          {rupiah(row.nominal)}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{row.noPengajuan ?? "-"}</td>
                        <td className="py-3 px-4 text-slate-500">{row.departemen ?? "-"}</td>
                        <td className="py-3 px-4 text-slate-500">{row.pemohon ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
