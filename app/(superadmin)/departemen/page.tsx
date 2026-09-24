"use client";

import { useEffect, useState } from "react";

interface Departemen {
  id: number;
  kode: string;
  nama: string;
  _count?: { users: number; requests: number };
}

export default function DepartemenManagementPage() {
  const [departemens, setDepartemens] = useState<Departemen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Departemen | null>(null);

  // Form State
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");

  const fetchDepartemens = () => {
    setLoading(true);
    fetch("/api/departemen")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDepartemens(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDepartemens();
  }, []);

  const openCreateModal = () => {
    setEditingDept(null);
    setKode("");
    setNama("");
    setModalOpen(true);
  };

  const openEditModal = (d: Departemen) => {
    setEditingDept(d);
    setKode(d.kode);
    setNama(d.nama);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let res;
      if (editingDept) {
        res = await fetch(`/api/departemen/${editingDept.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kode, nama }),
        });
      } else {
        res = await fetch("/api/departemen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kode, nama }),
        });
      }

      const data = await res.json();
      if (data.success) {
        setModalOpen(false);
        fetchDepartemens();
      } else {
        alert(data.error || "Gagal menyimpan departemen.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus departemen ini?")) return;

    try {
      const res = await fetch(`/api/departemen/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        fetchDepartemens();
      } else {
        alert(data.error || "Gagal menghapus departemen.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Manajemen Departemen PT JAI</h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola data struktur organisasi departemen (QA, STAT, HR, Production, dll.).
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-md shadow-sm transition-all text-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          + Tambah Departemen Baru
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Memuat data departemen...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Kode</th>
                  <th className="py-3.5 px-4">Nama Departemen</th>
                  <th className="py-3.5 px-4">Jumlah Pengguna</th>
                  <th className="py-3.5 px-4">Jumlah Pengajuan</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {departemens.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{d.kode}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{d.nama}</td>
                    <td className="py-3.5 px-4">{d._count?.users || 0} user</td>
                    <td className="py-3.5 px-4">{d._count?.requests || 0} pengajuan</td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button onClick={() => openEditModal(d)} className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(d.id)} className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer">
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <form onSubmit={handleSave} className="bg-white rounded-lg p-6 w-full max-w-md shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base">
                {editingDept ? "Edit Departemen" : "Tambah Departemen Baru"}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Kode Departemen
              </label>
              <input
                type="text"
                required
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                placeholder="Contoh: HRD, QA, PROD"
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-bold text-slate-800 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Departemen
              </label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Human Resource Development"
                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="pt-4 flex gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-md cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-md shadow-sm cursor-pointer"
              >
                Simpan Departemen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
