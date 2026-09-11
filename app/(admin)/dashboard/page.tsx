"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active processing request modal
  const [activeReq, setActiveReq] = useState<any | null>(null);
  const [itemAdjustments, setItemAdjustments] = useState<Record<number, { qtyDisetujui: number; catatanAdmin: string }>>({});

  useEffect(() => {
    fetchApprovedRequests();
  }, []);

  const fetchApprovedRequests = () => {
    setLoading(true);
    fetch("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // Filter requests that are approved or diproses
          const dispatchQueue = data.data.filter(
            (r: any) => r.status === "approved" || r.status === "diproses"
          );
          setRequests(dispatchQueue);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const openProcessModal = (req: any) => {
    setActiveReq(req);
    const initialMap: Record<number, { qtyDisetujui: number; catatanAdmin: string }> = {};
    req.items?.forEach((it: any) => {
      initialMap[it.id] = {
        qtyDisetujui: it.qtyDisetujui !== null ? it.qtyDisetujui : it.qtyDiajukan,
        catatanAdmin: it.catatanAdmin || "",
      };
    });
    setItemAdjustments(initialMap);
  };

  const handleUpdateStatus = async (targetStatus: "diproses" | "selesai") => {
    if (!activeReq) return;

    const payloadItems = activeReq.items.map((it: any) => ({
      requestItemId: it.id,
      qtyDiajukan: it.qtyDiajukan,
      qtyDisetujui: itemAdjustments[it.id]?.qtyDisetujui ?? it.qtyDiajukan,
      catatanAdmin: itemAdjustments[it.id]?.catatanAdmin || null,
    }));

    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activeReq.id,
          status: targetStatus,
          items: payloadItems,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActiveReq(null);
        fetchApprovedRequests();
      } else {
        alert(data.error || "Gagal mengubah status pengajuan.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-900 via-amber-800 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <span className="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-amber-200 mb-2 border border-white/10">
            Admin Stationery
          </span>
          <h1 className="text-xl font-extrabold tracking-tight">Dashboard Stationery</h1>
          <p className="text-xs text-amber-100/80 mt-1">
            Proses dan serah terimakan pesanan barang stationery berikut dibawah ini (Order Rutin langsung & Order Baru disetujui atasan).
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link
            href="/items"
            className="bg-white text-amber-900 font-bold px-4 py-2 rounded-xl text-xs hover:bg-amber-50 transition-all"
          >
            Kelola Barang
          </Link>
          <Link
            href="/restock"
            className="bg-amber-700/80 text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-amber-700 transition-all border border-amber-600"
          >
            Restock
          </Link>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Antrean Pesanan Disetujui</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-xs">
              {requests.length} Pesanan
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Memuat antrean pesanan...</div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-xs text-slate-500 font-medium">Tidak ada pengajuan yang membutuhkan pemrosesan saat ini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">Pesanan #{req.id}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                      {req.tipe === "rutin" ? "Order Rutin" : "Order Baru"}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      req.status === "diproses"
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}>
                      {req.status === "diproses"
                        ? "Sedang Diproses"
                        : req.tipe === "rutin"
                        ? "Siap Diproses (Rutin)"
                        : "Disetujui Atasan"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    Pemohon: <strong>{req.user?.nama}</strong> · Departemen <strong>{req.departemen?.nama}</strong>
                  </div>

                  <div className="text-xs text-slate-500 flex flex-wrap gap-2 pt-1">
                    {req.items?.map((it: any) => (
                      <span key={it.id} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        {it.item?.nama} ({it.qtyDiajukan} {it.item?.satuan})
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => openProcessModal(req)}
                  className="bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                >
                  Proses & Penyesuaian Qty →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Counter Offer / Process */}
      {activeReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">Pemrosesan Pesanan #{activeReq.id}</h2>
                <span className="text-xs text-slate-500">
                  Pemohon: {activeReq.user?.nama} ({activeReq.departemen?.nama})
                </span>
              </div>
              <button
                onClick={() => setActiveReq(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                💡 <strong>Fitur Penyesuaian Stok (Counter Offer):</strong> Anda dapat mengedit jumlah barang yang benar-benar disetujui untuk dikeluarkan bila stok gudang terbatas.
              </div>

              {/* Items List inside Modal */}
              <div className="space-y-3">
                {activeReq.items?.map((it: any) => {
                  const currentAdj = itemAdjustments[it.id] || { qtyDisetujui: it.qtyDiajukan, catatanAdmin: "" };
                  const itemStok = it.item?.stok || 0;

                  return (
                    <div key={it.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{it.item?.nama}</h4>
                          <div className="text-xs text-slate-500">
                            Stok Gudang: <strong className="text-slate-800">{itemStok} {it.item?.satuan}</strong>
                          </div>
                          {it.penggunaan && (
                            <div className="text-[11px] text-slate-500 italic mt-0.5">Tujuan: "{it.penggunaan}"</div>
                          )}
                        </div>

                        <div className="text-right text-xs">
                          <span className="text-slate-400 font-medium">Diajukan:</span>
                          <div className="font-bold text-slate-800">{it.qtyDiajukan} {it.item?.satuan}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Jumlah Disetujui (Admin)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={itemStok}
                            value={currentAdj.qtyDisetujui}
                            onChange={(e) => {
                              // Klem di client untuk UX (tombol Selesaikan bukan
                              // <button type="submit"> di dalam <form>, jadi
                              // atribut HTML `max` saja tidak mencegah input
                              // lebih besar dari stok) -- validasi sesungguhnya
                              // tetap dilakukan di server (POST /api/process).
                              const val = Math.min(itemStok, Math.max(0, parseInt(e.target.value) || 0));
                              setItemAdjustments((prev) => ({
                                ...prev,
                                [it.id]: { ...prev[it.id], qtyDisetujui: val },
                              }));
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Catatan Admin (Bila Ada Penyesuaian)
                          </label>
                          <input
                            type="text"
                            placeholder="Alasan penyesuaian..."
                            value={currentAdj.catatanAdmin}
                            onChange={(e) => {
                              const val = e.target.value;
                              setItemAdjustments((prev) => ({
                                ...prev,
                                [it.id]: { ...prev[it.id], catatanAdmin: val },
                              }));
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Action buttons */}
              <div className="pt-4 flex flex-col sm:flex-row gap-2 border-t border-slate-100">
                <button
                  onClick={() => handleUpdateStatus("diproses")}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md cursor-pointer"
                >
                  Tandai &quot;Sedang Diproses&quot;
                </button>
                <button
                  onClick={() => handleUpdateStatus("selesai")}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-md cursor-pointer"
                >
                  Selesaikan & Kurangi Stok Gudang ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
