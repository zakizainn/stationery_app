"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function ApprovalPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingReq, setRejectingReq] = useState<any | null>(null);
  const [catatanReject, setCatatanReject] = useState("");

  useEffect(() => {
    if (session?.user?.role) {
      fetchPendingRequests();
    }
  }, [session?.user?.role]);

  const fetchPendingRequests = () => {
    setLoading(true);
    fetch("/api/requests?status=pending")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const role = session?.user?.role;
          // Hanya pengajuan 'order_baru' yang memerlukan approval berjenjang.
          // Atasan departemen: belum ada approval level 1.
          // Superadmin: level 1 sudah approved, level 2 belum ada.
          const relevant = data.data.filter((r: any) => {
            if (r.tipe !== "order_baru") return false;
            const level1 = r.approvals?.find((a: any) => a.level === 1);
            const level2 = r.approvals?.find((a: any) => a.level === 2);
            if (role === "atasan_departemen") return !level1;
            if (role === "superadmin") return level1?.status === "approved" && !level2;
            return false;
          });
          setRequests(relevant);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleAction = async (requestId: number, action: "approve" | "reject", catatan?: string) => {
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, catatan }),
      });
      const data = await res.json();

      if (data.success) {
        setRejectingReq(null);
        setCatatanReject("");
        fetchPendingRequests();
      } else {
        alert(data.error || "Gagal memproses approval.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900">Pusat Persetujuan (Approval Center)</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold">
              {requests.length} Menunggu
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Peninjauan & persetujuan pengajuan Order Baru dari staf departemen {session?.user.departemenNama}. Order Rutin otomatis langsung diteruskan ke Admin Stationery.
          </p>
        </div>
      </div>

      {/* List Pending Requests */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Memuat pengajuan pending...</div>
      ) : requests.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 p-8">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Tidak Ada Antrean Approval</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Semua pengajuan stationery dari staf departemen telah diproses.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-extrabold flex items-center justify-center text-sm">
                    #{req.id}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {req.user?.nama} <span className="text-slate-400 font-normal">({req.user?.nik})</span>
                    </h3>
                    <div className="text-xs text-slate-500">
                      Departemen {req.departemen?.nama} · {new Date(req.tanggal).toLocaleString("id-ID")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase bg-slate-100 text-slate-700">
                    Tipe: {req.tipe}
                  </span>
                </div>
              </div>

              {req.catatan && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">Catatan Staf:</span>
                  <p className="text-amber-800 mt-0.5">{req.catatan}</p>
                </div>
              )}

              {/* Requested Items */}
              <div>
                <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">
                  Item Barang Yang Diajukan
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden text-xs">
                  {req.items?.map((it: any) => (
                    <div key={it.id} className="p-3 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{it.item?.nama}</span>
                        <span className="ml-2 text-[10px] uppercase font-bold text-slate-400">
                          ({it.item?.kategori})
                        </span>

                        {it.penggunaan && (
                          <div className="text-slate-500 italic mt-0.5">Tujuan: "{it.penggunaan}"</div>
                        )}
                        {it.itemLama && (
                          <div className="text-purple-700 font-semibold mt-0.5">
                            Menukar dengan: {it.itemLama.nama}
                          </div>
                        )}
                      </div>

                      <div className="font-bold text-slate-900 text-sm">
                        {it.qtyDiajukan} {it.item?.satuan}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  onClick={() => setRejectingReq(req)}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-4 py-2 rounded-xl border border-rose-200 transition-all cursor-pointer"
                >
                  Tolak Pengajuan
                </button>

                <button
                  onClick={() => handleAction(req.id, "approve")}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
                >
                  Setujui Pengajuan ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h2 className="font-extrabold text-slate-900 text-base mb-1">
              Tolak Pengajuan #{rejectingReq.id}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Masukkan alasan penolakan untuk diinformasikan kepada {rejectingReq.user?.nama}.
            </p>

            <textarea
              rows={3}
              value={catatanReject}
              onChange={(e) => setCatatanReject(e.target.value)}
              placeholder="Contoh: Stok sedang dialokasikan untuk kebutuhan proyek darurat..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectingReq(null);
                  setCatatanReject("");
                }}
                className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => handleAction(rejectingReq.id, "reject", catatanReject)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer shadow-md"
              >
                Konfirmasi Penolakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
