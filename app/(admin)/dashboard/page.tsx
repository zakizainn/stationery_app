"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_TONE } from "@/lib/status";
import { CheckCircle } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingRegion, Skeleton } from "@/components/ui/Skeleton";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border-l-4 border-brand-600 p-6 sm:p-8 rounded-lg text-white shadow-xs">
        <div>
          <span className="inline-block px-3 py-1 bg-white/10 rounded-md text-xs font-semibold text-brand-200 mb-3 border border-white/10">
            Admin Stationery
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Stationery</h1>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed max-w-3xl">
            Proses dan serah terimakan pesanan barang stationery berikut dibawah ini (Order Rutin langsung & Order Baru disetujui atasan).
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link
            href="/items"
            className="bg-white text-brand-900 font-bold px-4 py-2.5 rounded-md text-xs hover:bg-brand-50 transition-all shadow-xs"
          >
            Kelola Barang
          </Link>
          <Link
            href="/restock"
            className="bg-white/10 text-white font-semibold px-4 py-2.5 rounded-md text-xs hover:bg-white/20 transition-all border border-white/20"
          >
            Restock
          </Link>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Antrean Pesanan Disetujui</h2>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200">
              {requests.length} Pesanan
            </span>
          </div>
        </div>

        {loading ? (
          <LoadingRegion label="Memuat antrean pesanan..." className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-5 rounded-md border border-slate-200 bg-white flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-9 w-32" />
              </div>
            ))}
          </LoadingRegion>
        ) : requests.length === 0 ? (
          <EmptyState icon={CheckCircle} judul="Tidak ada pengajuan yang membutuhkan pemrosesan saat ini." />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-md border border-slate-200 border-l-[3px] border-l-amber-400 hover:bg-slate-50/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">Pesanan #{req.noPengajuan}</span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {req.tipe === "rutin" ? "Order Rutin" : "Order Baru"}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      req.status === "diproses"
                        ? STATUS_TONE.proses
                        : STATUS_TONE.sukses
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
                      <span key={it.id} className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-xs font-medium">
                        {it.item?.nama} ({it.qtyDiajukan} {it.item?.satuan})
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => openProcessModal(req)}
                  className="bg-brand-700 hover:bg-brand-800 text-white font-bold text-xs px-4 py-2.5 rounded-md shadow-xs transition-all cursor-pointer shrink-0"
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
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Pemrosesan Pesanan #{activeReq.noPengajuan}</h2>
                <span className="text-xs text-slate-500">
                  Pemohon: {activeReq.user?.nama} ({activeReq.departemen?.nama})
                </span>
              </div>
              <button
                onClick={() => setActiveReq(null)}
                className="text-slate-500 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-900">
                💡 <strong>Fitur Penyesuaian Stok (Counter Offer):</strong> Anda dapat mengedit jumlah barang yang benar-benar disetujui untuk dikeluarkan bila stok gudang terbatas.
              </div>

              {/* Items List inside Modal */}
              <div className="space-y-3">
                {activeReq.items?.map((it: any) => {
                  const currentAdj = itemAdjustments[it.id] || { qtyDisetujui: it.qtyDiajukan, catatanAdmin: "" };
                  const itemStok = it.item?.stok || 0;

                  return (
                    <div key={it.id} className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{it.item?.nama}</h4>
                          <div className="text-xs text-slate-500">
                            Stok Gudang: <strong className="text-slate-800">{itemStok} {it.item?.satuan}</strong>
                          </div>
                          {it.penggunaan && (
                            <div className="text-xs text-slate-500 italic mt-0.5">Tujuan: "{it.penggunaan}"</div>
                          )}
                        </div>

                        <div className="text-right text-xs">
                          <span className="text-slate-500 font-medium">Diajukan:</span>
                          <div className="font-bold text-slate-800">{it.qtyDiajukan} {it.item?.satuan}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-bold text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-medium text-slate-800"
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
                  className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-md cursor-pointer transition-colors"
                >
                  Tandai &quot;Sedang Diproses&quot;
                </button>
                <button
                  onClick={() => handleUpdateStatus("selesai")}
                  className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-bold text-xs py-2.5 rounded-md cursor-pointer shadow-xs transition-colors"
                >
                  Selesaikan & Kurangi Stok Gudang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
