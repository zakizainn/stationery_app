"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getStatusBadge } from "@/lib/status";

export default function BerandaPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/requests")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRequests(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const totalPengajuan = requests.length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved" || r.status === "diproses").length;
  const selesaiCount = requests.filter((r) => r.status === "selesai").length;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-lg bg-slate-900 border-l-4 border-brand-600 p-6 sm:p-8 text-white shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block px-3 py-1 bg-white/10 rounded text-xs font-semibold text-brand-200 mb-3 border border-white/10">
            Departemen {session?.user.departemenNama}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Selamat Datang, {session?.user.name || "Staf"}
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Kelola pengajuan alat tulis kantor (ATK) departemen Anda dengan mudah. Pilih barang di Katalog, ajukan melalui Keranjang, dan pantau status persetujuan secara real-time.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/katalog"
              className="inline-flex items-center gap-2 bg-white text-brand-900 font-bold px-5 py-2.5 rounded-md shadow-sm hover:bg-brand-50 transition-all text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Buka Katalog Barang
            </Link>
            <Link
              href="/riwayat"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-md border border-white/20 transition-all text-xs"
            >
              Lihat Riwayat Pengajuan
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-md border border-slate-200/80 shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Pengajuan</div>
          <div className="text-2xl font-black text-slate-900 mt-2">{loading ? "..." : totalPengajuan}</div>
          <div className="text-[11px] text-slate-400 mt-1">Keseluruhan pengajuan</div>
        </div>

        <div className="bg-white p-5 rounded-md border border-amber-100 shadow-xs">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">Menunggu Approval</div>
          <div className="text-2xl font-black text-amber-700 mt-2">{loading ? "..." : pendingCount}</div>
          <div className="text-[11px] text-amber-600/80 mt-1">Perlu approval atasan/superadmin</div>
        </div>

        <div className="bg-white p-5 rounded-md border border-brand-100 shadow-xs">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-wider">Dalam Antrian / Diproses</div>
          <div className="text-2xl font-black text-brand-700 mt-2">{loading ? "..." : approvedCount}</div>
          <div className="text-[11px] text-brand-600/80 mt-1">Siap diproses admin</div>
        </div>

        <div className="bg-white p-5 rounded-md border border-purple-100 shadow-xs">
          <div className="text-xs font-bold text-purple-600 uppercase tracking-wider">Selesai / Diambil</div>
          <div className="text-2xl font-black text-purple-700 mt-2">{loading ? "..." : selesaiCount}</div>
          <div className="text-[11px] text-purple-600/80 mt-1">Barang telah diserahterimakan</div>
        </div>
      </div>

      {/* Recent Requests Table */}
      <div className="bg-white rounded-md border border-slate-200/80 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Pengajuan Terbaru Anda</h2>
            <p className="text-xs text-slate-500">Daftar pengajuan terkini di departemen Anda</p>
          </div>
          <Link href="/riwayat" className="text-xs font-bold text-brand-700 hover:text-brand-800">
            Lihat Semua →
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Memuat data pengajuan...</div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-md border border-dashed border-slate-200">
            <p className="text-xs text-slate-500 font-medium">Belum ada pengajuan stationery.</p>
            <Link
              href="/katalog"
              className="inline-block mt-2 text-xs font-bold text-brand-700 hover:underline"
            >
              Mulai buat pengajuan baru →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-2">ID</th>
                  <th className="py-3 px-2">Tanggal</th>
                  <th className="py-3 px-2">Tipe</th>
                  <th className="py-3 px-2">Jumlah Item</th>
                  <th className="py-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {requests.slice(0, 5).map((req) => {
                  const badge = getStatusBadge(req);
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="py-3 px-2 font-bold text-slate-900">#{req.noPengajuan}</td>
                      <td className="py-3 px-2 text-slate-500">
                        {new Date(req.tanggal).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-2 capitalize">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                          {req.tipe}
                        </span>
                      </td>
                      <td className="py-3 px-2">{req.items?.length || 0} barang</td>
                      <td className="py-3 px-2">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.style}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
