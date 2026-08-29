"use client";

import { useEffect, useState } from "react";

interface PerItemRow {
  itemId: number;
  nama: string;
  kategori: string;
  satuan: string;
  harga: number;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface PerDeptRow {
  departemen: string;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface LaporanData {
  periode: { year: number; month: number; label: string };
  summary: { totalNominalMasuk: number; totalNominalKeluar: number; totalQtyMasuk: number; totalQtyKeluar: number };
  perItem: PerItemRow[];
  perDepartemen: PerDeptRow[];
}

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function LaporanPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState<LaporanData | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Laporan Amount In / Amount Out</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pembelian (restock) dan pemakaian barang stationery secara periodik, lengkap dengan nominal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
          />
          <a
            href={`/api/laporan/export?month=${month}`}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shrink-0 cursor-pointer inline-flex items-center"
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
            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
              <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                Amount In (Restock/Pembelian)
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-1">{rupiah(data.summary.totalNominalMasuk)}</div>
              <div className="text-[11px] text-slate-400 mt-1">{data.summary.totalQtyMasuk} unit masuk</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-xs">
              <div className="text-xs font-bold text-rose-600 uppercase tracking-wider">Amount Out (Pemakaian)</div>
              <div className="text-2xl font-black text-rose-700 mt-1">{rupiah(data.summary.totalNominalKeluar)}</div>
              <div className="text-[11px] text-slate-400 mt-1">{data.summary.totalQtyKeluar} unit keluar</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selisih (In − Out)</div>
              <div className={`text-2xl font-black mt-1 ${net >= 0 ? "text-slate-900" : "text-rose-700"}`}>
                {rupiah(net)}
              </div>
            </div>
          </div>

          {/* Per Item */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
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
                      <tr key={it.itemId} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-900">{it.nama}</td>
                        <td className="py-3 px-4">{rupiah(it.harga)}</td>
                        <td className="py-3 px-4 text-emerald-700">
                          {it.qtyMasuk} {it.satuan}
                        </td>
                        <td className="py-3 px-4 text-emerald-700">{rupiah(it.nominalMasuk)}</td>
                        <td className="py-3 px-4 text-rose-700">
                          {it.qtyKeluar} {it.satuan}
                        </td>
                        <td className="py-3 px-4 text-rose-700">{rupiah(it.nominalKeluar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per Departemen */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
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
        </>
      )}
    </div>
  );
}
