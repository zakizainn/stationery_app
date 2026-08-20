"use client";

import { useEffect, useState } from "react";

export default function LaporanPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch("/api/requests"), fetch("/api/items?all=1")])
      .then(async ([resReq, resItem]) => {
        const dataReq = await resReq.json();
        const dataItem = await resItem.json();
        if (dataReq.success) setRequests(dataReq.data);
        if (dataItem.success) setItems(dataItem.data);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // Compute analytics
  const totalCompletedRequests = requests.filter((r) => r.status === "selesai").length;

  // Usage per department summary
  const deptSummary: Record<string, { nama: string; totalRequests: number; itemsCount: number }> = {};
  requests.forEach((r) => {
    const deptNama = r.departemen?.nama || "Umum";
    if (!deptSummary[deptNama]) {
      deptSummary[deptNama] = { nama: deptNama, totalRequests: 0, itemsCount: 0 };
    }
    deptSummary[deptNama].totalRequests += 1;
    deptSummary[deptNama].itemsCount += r.items?.length || 0;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Laporan & Rekapitulasi Penggunaan ATK</h1>
          <p className="text-xs text-slate-500 mt-1">
            Ringkasan pemakaian alat tulis kantor per departemen dan analisis persediaan barang.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shrink-0 self-start sm:self-auto cursor-pointer"
        >
          🖨 Cetak / Export PDF
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pengajuan Masuk</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{loading ? "..." : requests.length}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Pengajuan Selesai (Diserahkan)</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{loading ? "..." : totalCompletedRequests}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-xs">
          <div className="text-xs font-bold text-purple-600 uppercase tracking-wider">Total Item Barang Master</div>
          <div className="text-2xl font-black text-purple-700 mt-1">{loading ? "..." : items.length}</div>
        </div>
      </div>

      {/* Report Tables */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
          Rekapitulasi Pengajuan Per Departemen
        </h2>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Memuat laporan...</div>
        ) : Object.keys(deptSummary).length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">Belum ada data pengajuan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Nama Departemen</th>
                  <th className="py-3 px-4">Jumlah Transaksi Pengajuan</th>
                  <th className="py-3 px-4">Total Item Barang Diminta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {Object.values(deptSummary).map((d) => (
                  <tr key={d.nama} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-900">{d.nama}</td>
                    <td className="py-3 px-4">{d.totalRequests} pengajuan</td>
                    <td className="py-3 px-4 font-extrabold text-emerald-700">{d.itemsCount} item</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
