"use client";

import { useEffect, useState } from "react";

interface Item {
  id: number;
  nama: string;
  kategori: string;
  satuan: string;
  stok: number;
  stokBuffer: number;
  stokMinimum: number;
  harga: number;
  bisaDitukar: boolean;
  jenisKertas?: string;
  fotoUrl?: string;
}

export default function MasterItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Import Excel
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    summary: { totalRows: number; created: number; restocked: number; errorCount: number };
    errors: string[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  // Search & pagination — 240+ item hasil impor Excel butuh ini biar tidak
  // perlu scroll panjang untuk cari & edit satu item.
  const [search, setSearch] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState<string>("semua");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Form State
  const [nama, setNama] = useState("");
  const [kategori, setKategori] = useState<string>("barang_umum");
  const [satuan, setSatuan] = useState("pcs");
  const [stok, setStok] = useState(0);
  const [stokMinimum, setStokMinimum] = useState(5);
  const [stokBuffer, setStokBuffer] = useState(0);
  const [harga, setHarga] = useState(0);
  const [bisaDitukar, setBisaDitukar] = useState(false);
  const [jenisKertas, setJenisKertas] = useState("A4");

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    setPage(1); // reset ke halaman 1 setiap kali search/filter berubah
  }, [search, kategoriFilter]);

  const filteredItems = items.filter((it) => {
    const matchSearch = it.nama.toLowerCase().includes(search.toLowerCase());
    const matchKategori = kategoriFilter === "semua" || it.kategori === kategoriFilter;
    return matchSearch && matchKategori;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchItems = () => {
    setLoading(true);
    // Halaman ini paginate & search di sisi client (lihat filteredItems/pagedItems
    // di bawah), jadi butuh daftar lengkap -- bypass default limit API dengan all=1.
    fetch("/api/items?all=1")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setItems(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/items/import", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        fetchItems(); // refresh daftar & stok terbaru
        if (data.errors.length === 0) {
          // Tidak ada yang perlu ditinjau -- tutup popup otomatis supaya admin
          // tidak bingung menunggu dan tidak klik "Upload & Proses" berkali-kali
          // (yang sebelumnya bisa bikin stok ke-restock dobel).
          setToast(
            `Import berhasil: ${data.summary.created} item baru dibuat, ${data.summary.restocked} item di-restock.`
          );
          closeImportModal();
        } else {
          // Ada baris bermasalah -- tetap tampilkan supaya admin bisa tinjau/perbaiki.
          setImportResult({ summary: data.summary, errors: data.errors });
        }
      } else {
        setImportResult({
          summary: { totalRows: 0, created: 0, restocked: 0, errorCount: 1 },
          errors: [data.error || "Gagal memproses file."],
        });
      }
    } catch (e) {
      setImportResult({
        summary: { totalRows: 0, created: 0, restocked: 0, errorCount: 1 },
        errors: [e instanceof Error ? e.message : "Gagal upload file."],
      });
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportResult(null);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setNama("");
    setKategori("barang_umum");
    setSatuan("pcs");
    setStok(0);
    setStokMinimum(5);
    setStokBuffer(0);
    setHarga(0);
    setBisaDitukar(false);
    setJenisKertas("A4");
    setModalOpen(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setNama(item.nama);
    setKategori(item.kategori);
    setSatuan(item.satuan);
    setStok(item.stok);
    setStokMinimum(item.stokMinimum);
    setStokBuffer(item.stokBuffer ?? 0);
    setHarga(item.harga ?? 0);
    setBisaDitukar(item.bisaDitukar);
    setJenisKertas(item.jenisKertas || "A4");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      nama,
      kategori,
      satuan,
      stok: Number(stok),
      stokMinimum: Number(stokMinimum),
      stokBuffer: Number(stokBuffer),
      harga: Number(harga),
      bisaDitukar,
      jenisKertas: kategori === "kertas" ? jenisKertas : null,
    };

    try {
      let res;
      if (editingItem) {
        res = await fetch(`/api/items/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        setModalOpen(false);
        fetchItems();
      } else {
        alert(data.error || "Gagal menyimpan item.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus barang ini?")) return;

    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        fetchItems();
      } else {
        alert(data.error || "Gagal menghapus item.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notifikasi hasil import (muncul setelah popup auto-tertutup) */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-emerald-700 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg max-w-xs animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Master Data Barang Stationery</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tambah, edit, dan atur ambang batas stok minimum untuk inventaris stationery PT Jatim Autocomp Indonesia.
          </p>
        </div>

        <div className="flex gap-2 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setImportModalOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-2.5 rounded-xl shadow-xs border border-slate-200 transition-all text-xs cursor-pointer"
          >
            ⬆ Import Excel
          </button>
          <button
            onClick={openCreateModal}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all text-xs cursor-pointer"
          >
            + Tambah Barang Baru
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama barang..."
          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={kategoriFilter}
          onChange={(e) => setKategoriFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-800"
        >
          <option value="semua">Semua kategori</option>
          <option value="barang_umum">Barang Umum</option>
          <option value="kertas">Kertas</option>
          <option value="checksheet">Checksheet</option>
        </select>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Memuat data barang...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            {items.length === 0 ? "Belum ada barang di database." : "Tidak ada barang yang cocok dengan pencarian."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Nama Barang</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4">Stok Saat Ini</th>
                  <th className="py-3.5 px-4">Stok Min</th>
                  <th className="py-3.5 px-4">Fitur Tukar</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {pagedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-all">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {item.nama}
                      {item.jenisKertas && (
                        <span className="ml-2 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {item.jenisKertas}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 uppercase text-[11px] font-bold text-slate-500">
                      {item.kategori.replace("_", " ")}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {item.stok} {item.satuan}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{item.stokMinimum} {item.satuan}</td>
                    <td className="py-3.5 px-4">
                      {item.bisaDitukar ? (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          Ya (Wajib Tukar)
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredItems.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredItems.length)} dari{" "}
              {filteredItems.length} barang
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sebelumnya
              </button>
              <span className="font-bold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Add/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base">
                {editingItem ? "Edit Barang Stationery" : "Tambah Barang Baru"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nama Barang
              </label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Pulpen Pilot Hitam 0.5"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Kategori
                </label>
                <select
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="barang_umum">Barang Umum</option>
                  <option value="kertas">Kertas</option>
                  <option value="checksheet">Checksheet</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Satuan
                </label>
                <input
                  type="text"
                  required
                  value={satuan}
                  onChange={(e) => setSatuan(e.target.value)}
                  placeholder="pcs, rim, pack, lembar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                />
              </div>
            </div>

            {kategori === "kertas" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Jenis Kertas
                </label>
                <select
                  value={jenisKertas}
                  onChange={(e) => setJenisKertas(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="A5">A5</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Stok Awal / Saat Ini
                </label>
                <input
                  type="number"
                  min="0"
                  value={stok}
                  onChange={(e) => setStok(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Stok Minimum (Alert)
                </label>
                <input
                  type="number"
                  min="0"
                  value={stokMinimum}
                  onChange={(e) => setStokMinimum(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Harga Satuan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={harga}
                  onChange={(e) => setHarga(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">Dipakai untuk hitung nominal di halaman Laporan.</p>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Stok Buffer (Bayangan)
                </label>
                <input
                  type="number"
                  min="0"
                  value={stokBuffer}
                  onChange={(e) => setStokBuffer(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Disembunyikan dari staf — mereka melihat stok gudang dikurangi angka ini. Admin tetap
                  melihat stok gudang asli.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="bisaDitukar"
                checked={bisaDitukar}
                onChange={(e) => setBisaDitukar(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <label htmlFor="bisaDitukar" className="text-xs font-semibold text-slate-700">
                Wajib Tukar Barang Lama Saat Pengajuan
              </label>
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
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-md cursor-pointer"
              >
                Simpan Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Import Excel */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base">Import dari Excel</h2>
              <button onClick={closeImportModal} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Untuk item yang sudah ada (dicocokkan lewat nama), kolom{" "}
              <strong className="text-slate-700">STOK_MASUK</strong> otomatis ditambahkan ke stok saat ini
              (restock), field lain hanya diperbarui kalau diisi. Item dengan nama baru akan dibuat otomatis.
            </p>

            <a
              href="/api/items/import"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              ⬇ Unduh data seluruh item (untuk diedit/restock massal)
            </a>

            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null);
                  setImportResult(null);
                }}
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-xs file:font-bold file:cursor-pointer cursor-pointer"
              />
            </div>

            {importResult && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <p className="font-bold text-slate-800">
                  {importResult.summary.totalRows} baris diproses — {importResult.summary.created} item baru
                  dibuat, {importResult.summary.restocked} item di-restock.
                </p>
                {importResult.errors.length > 0 && (
                  <div className="text-rose-700 space-y-0.5 max-h-32 overflow-y-auto">
                    {importResult.errors.map((err, idx) => (
                      <p key={idx}>⚠ {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={closeImportModal}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={!importFile || importing}
                onClick={handleImport}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? "Memproses..." : "Upload & Proses"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
