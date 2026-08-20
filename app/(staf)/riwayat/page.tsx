"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function RiwayatPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("semua");
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = () => {
    setLoading(true);
    fetch("/api/requests")
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

  const STATUS_BADGE: Record<string, { label: string; style: string }> = {
    pending: { label: "Menunggu Approval", style: "bg-amber-50 text-amber-800 border-amber-200" },
    approved: { label: "Disetujui", style: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    rejected: { label: "Ditolak", style: "bg-rose-50 text-rose-800 border-rose-200" },
    diproses: { label: "Sedang Diproses", style: "bg-blue-50 text-blue-800 border-blue-200" },
    selesai: { label: "Selesai / Diambil", style: "bg-purple-50 text-purple-800 border-purple-200" },
  };

  // Order rutin tidak melalui approval siapa pun — status "approved" di sini
  // cuma berarti "masuk antrian admin", bukan "disetujui atasan/superadmin".
  // Label khusus supaya tidak menyesatkan staf yang mengajukan order rutin.
  function getStatusBadge(r: { status: string; tipe: string }) {
    if (r.tipe === "rutin" && r.status === "approved") {
      return { label: "Menunggu Diproses Admin", style: "bg-blue-50 text-blue-800 border-blue-200" };
    }
    return STATUS_BADGE[r.status] || { label: r.status, style: "bg-slate-100 text-slate-700" };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Riwayat Pengajuan Stationery</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau status approval atasan dan proses pemenuhan barang oleh Admin Stationery.
          </p>
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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

      {/* Request Table / List */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Memuat riwayat pengajuan...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Tidak ada pengajuan dengan status ini.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const badge = getStatusBadge(req);
            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-slate-900 text-sm">#{req.id}</span>
                    <span className="text-xs font-medium text-slate-500">
                      {new Date(req.tanggal).toLocaleDateString("id-ID", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                      {req.tipe}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    Pemohon: <strong>{req.user?.nama}</strong> ({req.departemen?.nama})
                  </div>

                  <div className="text-xs text-slate-500 flex flex-wrap gap-2 pt-1">
                    {req.items?.map((it: any) => (
                      <span key={it.id} className="bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded text-[11px]">
                        {it.item?.nama} ({it.qtyDiajukan} {it.item?.satuan})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.style}`}>
                    {badge.label}
                  </span>

                  <button
                    onClick={() => setSelectedReq(req)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    Detail
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Detail Request */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">Detail Pengajuan #{selectedReq.id}</h2>
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
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
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
                  <p className="font-bold text-emerald-700 capitalize">{selectedReq.status}</p>
                </div>
              </div>

              {selectedReq.catatan && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">Catatan Pemohon:</span>
                  <p className="text-amber-800 mt-0.5">{selectedReq.catatan}</p>
                </div>
              )}

              {/* Items Breakdown Table */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Rincian Barang</h4>
                <div className="border border-slate-200/80 rounded-xl overflow-hidden text-xs">
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
                          <td className="p-2.5 font-bold text-emerald-700">
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
                      <div key={app.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{app.approver?.nama} (Level {app.level})</span>
                          <span className={app.status === "approved" ? "text-emerald-700" : "text-rose-700"}>
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
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Batalkan Pengajuan Ini
                  </button>
                )}

                <button
                  onClick={() => setSelectedReq(null)}
                  className="ml-auto bg-slate-900 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all cursor-pointer"
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
