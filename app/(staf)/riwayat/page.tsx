"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getStatusBadge } from "@/lib/status";

export default function RiwayatPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("semua");
  const [filterMonth, setFilterMonth] = useState<string>(""); // "" = semua bulan
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth]);

  const fetchRequests = () => {
    setLoading(true);
    const url = filterMonth ? `/api/requests?month=${filterMonth}` : "/api/requests";
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRequests(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleCancelRequest = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan pengajuan ini?")) return;

    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        alert("Pengajuan berhasil dibatalkan.");
        setSelectedReq(null);
        fetchRequests();
      } else {
        alert(data.error || "Gagal membatalkan pengajuan.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (filterStatus === "semua") return true;
    return r.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Riwayat Pengajuan Stationery</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau status approval atasan dan proses pemenuhan barang oleh Admin Stationery.
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          {/* Filter Bulan */}
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700"
            />
            {filterMonth && (
              <button
                onClick={() => setFilterMonth("")}
                className="text-xs text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
              >
                Reset bulan
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "semua", label: "Semua" },
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Disetujui" },
              { id: "diproses", label: "Diproses" },
              { id: "selesai", label: "Selesai" },
              { id: "rejected", label: "Ditolak" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  filterStatus === st.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Request Table */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Memuat riwayat pengajuan...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-md border border-dashed border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Tidak ada pengajuan dengan status ini.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2.5 px-4 font-bold">No. Pengajuan</th>
                <th className="py-2.5 px-4 font-bold">Tanggal</th>
                <th className="py-2.5 px-4 font-bold">Tipe</th>
                <th className="py-2.5 px-4 font-bold">Barang</th>
                <th className="py-2.5 px-4 font-bold">Status</th>
                <th className="py-2.5 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req, idx) => {
                const badge = getStatusBadge(req);
                const items = req.items ?? [];
                return (
                  <tr key={req.id} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">#{req.noPengajuan}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {new Date(req.tanggal).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                        {req.tipe}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[240px]">
                      {items.length === 0
                        ? "-"
                        : items.length === 1
                        ? `${items[0].item?.nama} (${items[0].qtyDiajukan} ${items[0].item?.satuan})`
                        : `${items[0].item?.nama} +${items.length - 1} lainnya`}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded text-[11px] font-bold border ${badge.style}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedReq(req)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-1.5 rounded-md transition-all cursor-pointer"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Detail Request */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-lg p-6 w-full max-w-xl shadow-sm border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">Detail Pengajuan #{selectedReq.noPengajuan}</h2>
                <span className="text-xs text-slate-400">Tipe: {selectedReq.tipe}</span>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Info summary */}
              <div className="bg-slate-50 p-4 rounded-md border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Pemohon</span>
                  <p className="font-bold text-slate-800">{selectedReq.user?.nama}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Departemen</span>
                  <p className="font-bold text-slate-800">{selectedReq.departemen?.nama}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Tanggal Pengajuan</span>
                  <p className="font-bold text-slate-800">
                    {new Date(selectedReq.tanggal).toLocaleString("id-ID")}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Status</span>
                  <p className="mt-0.5">
                    {(() => {
                      const badge = getStatusBadge(selectedReq);
                      return (
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.style}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                  </p>
                </div>
              </div>

              {selectedReq.catatan && (
                <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">Catatan Pemohon:</span>
                  <p className="text-amber-800 mt-0.5">{selectedReq.catatan}</p>
                </div>
              )}

              {/* Items Breakdown Table */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Rincian Barang</h4>
                <div className="border border-slate-200/80 rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Nama Barang</th>
                        <th className="p-2.5">Diajukan</th>
                        <th className="p-2.5">Disetujui (Admin)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {selectedReq.items?.map((it: any) => (
                        <tr key={it.id}>
                          <td className="p-2.5 font-medium">
                            {it.item?.nama}
                            {it.penggunaan && (
                              <div className="text-[10px] text-slate-500 italic">&quot;{it.penggunaan}&quot;</div>
                            )}
                          </td>
                          <td className="p-2.5 font-bold">{it.qtyDiajukan} {it.item?.satuan}</td>
                          <td className="p-2.5 font-bold text-brand-700">
                            {it.qtyDisetujui !== null ? `${it.qtyDisetujui} ${it.item?.satuan}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Approvals Log */}
              {selectedReq.approvals && selectedReq.approvals.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Riwayat Approval</h4>
                  <div className="space-y-2">
                    {selectedReq.approvals.map((app: any) => (
                      <div key={app.id} className="p-3 bg-slate-50 rounded-md border border-slate-200/80 text-xs">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{app.approver?.nama} (Level {app.level})</span>
                          <span className={app.status === "approved" ? "text-brand-700" : "text-rose-700"}>
                            {app.status.toUpperCase()}
                          </span>
                        </div>
                        {app.catatan && (
                          <div className="text-slate-600 mt-1 italic">&quot;{app.catatan}&quot;</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 flex justify-between gap-2 border-t border-slate-100">
                {selectedReq.status === "pending" && (
                  <button
                    onClick={() => handleCancelRequest(selectedReq.id)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-4 py-2 rounded-md transition-all cursor-pointer"
                  >
                    Batalkan Pengajuan Ini
                  </button>
                )}

                <button
                  onClick={() => setSelectedReq(null)}
                  className="ml-auto bg-slate-900 text-white font-bold text-xs px-5 py-2 rounded-md transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
