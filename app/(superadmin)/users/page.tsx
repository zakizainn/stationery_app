"use client";

import { useEffect, useState } from "react";

interface User {
  id: number;
  nik: string;
  nama: string;
  role: string;
  aktif: boolean;
  departemenId: number;
  departemen?: { nama: string; kode: string };
}

interface Departemen {
  id: number;
  nama: string;
  kode: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [departemens, setDepartemens] = useState<Departemen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form
  const [nik, setNik] = useState("");
  const [nama, setNama] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staf");
  const [departemenId, setDepartemenId] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resUsers, resDepts] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/departemen"),
      ]);
      const dataUsers = await resUsers.json();
      const dataDepts = await resDepts.json();

      if (dataUsers.success) setUsers(dataUsers.data);
      if (dataDepts.success) {
        setDepartemens(dataDepts.data);
        if (dataDepts.data.length > 0) setDepartemenId(String(dataDepts.data[0].id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setNik("");
    setNama("");
    setPassword("");
    setRole("staf");
    if (departemens.length > 0) setDepartemenId(String(departemens[0].id));
    setModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setNik(u.nik);
    setNama(u.nama);
    setPassword("");
    setRole(u.role);
    setDepartemenId(String(u.departemenId));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let res;
      if (editingUser) {
        res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama,
            role,
            departemenId: Number(departemenId),
            newPassword: password || undefined,
          }),
        });
      } else {
        res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nik,
            nama,
            password,
            role,
            departemenId: Number(departemenId),
          }),
        });
      }

      const data = await res.json();
      if (data.success) {
        setModalOpen(false);
        fetchData();
      } else {
        alert(data.error || "Gagal menyimpan user.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menonaktifkan pengguna ini? Akun tidak akan bisa login lagi.")) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Gagal menonaktifkan user.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif: true }),
      });
      const data = await res.json();

      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Gagal mengaktifkan kembali user.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const ROLE_BADGES: Record<string, string> = {
    staf: "bg-emerald-50 text-emerald-800 border-emerald-200",
    atasan_departemen: "bg-blue-50 text-blue-800 border-blue-200",
    admin_stationery: "bg-amber-50 text-amber-900 border-amber-200",
    superadmin: "bg-purple-50 text-purple-800 border-purple-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Manajemen Pengguna (Users)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola akun internal PT JAI, penugasan role, dan departemen karyawan.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all text-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          + Tambah Pengguna Baru
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Memuat data pengguna...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">NIK</th>
                  <th className="py-3.5 px-4">Nama Pengguna</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Departemen</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className={`hover:bg-slate-50/80 ${!u.aktif ? "opacity-60" : ""}`}>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{u.nik}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{u.nama}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_BADGES[u.role] || "bg-slate-100"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-600">{u.departemen?.nama} ({u.departemen?.kode})</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        u.aktif ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {u.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button onClick={() => openEditModal(u)} className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer">
                        Edit
                      </button>
                      {u.aktif ? (
                        <button onClick={() => handleDelete(u.id)} className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer">
                          Nonaktifkan
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(u.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 cursor-pointer">
                          Aktifkan
                        </button>
                      )}
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
          <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base">
                {editingUser ? `Edit User (${editingUser.nik})` : "Tambah User Baru"}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            {!editingUser && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  NIK (Nomor Induk Karyawan)
                </label>
                <input
                  type="text"
                  required
                  value={nik}
                  onChange={(e) => setNik(e.target.value)}
                  placeholder="Contoh: 22072"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Ahmad Subagyo"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                {editingUser ? "Password Baru (Biarkan kosong jika tidak diubah)" : "Password Internal"}
              </label>
              <input
                type="password"
                required={!editingUser}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Role Hak Akses
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  <option value="staf">Staf</option>
                  <option value="atasan_departemen">Atasan Departemen</option>
                  <option value="admin_stationery">Admin Stationery</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Departemen
                </label>
                <select
                  value={departemenId}
                  onChange={(e) => setDepartemenId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {departemens.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nama} ({d.kode})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 flex gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-md cursor-pointer"
              >
                Simpan User
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
