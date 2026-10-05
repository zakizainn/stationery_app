"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getKategoriLabel } from "@/lib/kategori";

export default function ApprovalPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingReq, setRejectingReq] = useState<any | null>(null);
  const [catatanReject, setCatatanReject] = useState("");
  const [approvingReq, setApprovingReq] = useState<any | null>(null);
  const [submittingApprove, setSubmittingApprove] = useState(false);

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
      if (action === "approve") setSubmittingApprove(true);
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, catatan }),
      });
      const data = await res.json();

      if (data.success) {
        setRejectingReq(null);
        setCatatanReject("");
        setApprovingReq(null);
        fetchPendingRequests();
      } else {
        alert(data.error || "Gagal memproses approval.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingApprove(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Pusat Persetujuan (Approval Center)</h1>
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
              {requests.length} Menunggu
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Peninjauan & persetujuan pengajuan Order Baru dari staf departemen {session?.user.departemenNama}. Order Rutin otomatis langsung diteruskan ke Admin Stationery.
          </p>
        </div>
      </div>

      {/* List Pending Requests */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Memuat pengajuan pending...</div>
      ) : requests.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-md border border-dashed border-slate-200 p-8 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Tidak Ada Antrean Approval</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-sm mx-auto">
            Semua pengajuan stationery dari staf departemen telah diproses.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-md border border-slate-200/80 border-l-[3px] border-l-amber-400 p-5 space-y-4 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Lebar mengikuti isi (bukan kotak tetap) supaya nomor seperti
                      "002/X/2026" tidak meluber menimpa nama pemohon. */}
                  <div className="shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-bold tabular-nums text-slate-700">
                    #{req.noPengajuan}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {req.user?.nama} <span className="text-slate-400 font-normal">({req.user?.nik})</span>
                    </h3>
                    <div className="text-xs text-slate-500">
                      Departemen {req.departemen?.nama} · {new Date(req.tanggal).toLocaleString("id-ID")}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Tipe: {req.tipe === "rutin" ? "Order Rutin" : "Order Baru"}
                  </span>
                </div>
              </div>

              {req.catatan && (
                <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs">
                  <span className="font-bold text-amber-900">Catatan Staf:</span>
                  <p className="text-amber-800 mt-0.5">{req.catatan}</p>
                </div>
              )}

              {/* Requested Items */}
              <div>
                <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">
                  Item Barang Yang Diajukan
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden text-xs">
                  {req.items?.map((it: any) => (
                    <div key={it.id} className="p-3 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{it.item?.nama}</span>
                        {it.item?.kategori && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 align-middle">
                            {getKategoriLabel(it.item.kategori)}
                          </span>
                        )}

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
                  className="bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs px-4 py-2.5 rounded-md border border-rose-200 transition-all cursor-pointer"
                >
                  Tolak Pengajuan
                </button>

                <button
                  onClick={() => setApprovingReq(req)}
                  className="bg-brand-700 hover:bg-brand-800 text-white font-bold text-xs px-5 py-2.5 rounded-md shadow-sm transition-all cursor-pointer"
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h2 className="font-bold text-slate-900 text-base mb-1">
              Tolak Pengajuan #{rejectingReq.noPengajuan}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Masukkan alasan penolakan untuk diinformasikan kepada {rejectingReq.user?.nama}.
            </p>

            <textarea
              rows={3}
              value={catatanReject}
              onChange={(e) => setCatatanReject(e.target.value)}
              placeholder="Contoh: Stok sedang dialokasikan untuk kebutuhan proyek darurat..."
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRejectingReq(null);
                  setCatatanReject("");
                }}
                className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-md cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => handleAction(rejectingReq.id, "reject", catatanReject)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-md cursor-pointer shadow-sm"
              >
                Konfirmasi Penolakan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Approve Confirmation Modal */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-lg p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h2 className="font-bold text-slate-900 text-base mb-1">
              Setujui Pengajuan #{approvingReq.noPengajuan}?
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Anda akan menyetujui pengajuan dari {approvingReq.user?.nama} ({approvingReq.user?.nik}). Pastikan barang dan jumlahnya sudah sesuai — tindakan ini tidak bisa dibatalkan setelah disetujui.
            </p>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden text-xs mb-4">
              {approvingReq.items?.map((it: any) => (
                <div
                  key={it.id}
                  className="p-3 bg-slate-50/50 flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-slate-800">{it.item?.nama}</span>
                  <span className="font-bold text-slate-900">
                    {it.qtyDiajukan} {it.item?.satuan}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setApprovingReq(null)}
                disabled={submittingApprove}
                className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-md cursor-pointer disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={() => handleAction(approvingReq.id, "approve")}
                disabled={submittingApprove}
                className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-bold text-xs py-2.5 rounded-md cursor-pointer shadow-sm disabled:opacity-60"
              >
                {submittingApprove ? "Memproses..." : "Ya, Setujui"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
