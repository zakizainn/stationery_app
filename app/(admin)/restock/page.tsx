"use client";

import { useEffect, useRef, useState } from "react";

export default function RestockPage() {
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [qty, setQty] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Dropdown pilih barang yang bisa dicari (combobox) — native <select> susah
  // dicari kalau daftar barangnya ratusan.
  const [itemSearch, setItemSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => String(i.id) === selectedItemId);
  const filteredItems = items.filter((i) =>
    i.nama.toLowerCase().includes(itemSearch.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setItemSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resItems, resMovements] = await Promise.all([
        fetch("/api/items?all=1"),
        fetch("/api/restock"),
      ]);

      const dataItems = await resItems.json();
      const dataMovements = await resMovements.json();

      if (dataItems.success) setItems(dataItems.data);
      if (dataMovements.success) setMovements(dataMovements.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || qty <= 0) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: Number(selectedItemId),
          qty: Number(qty),
        }),
      });

      const data = await res.json();
      setSubmitting(false);

      if (data.success) {
        setMsg(data.message || "Restock berhasil!");
        setSelectedItemId("");
        setItemSearch("");
        setQty(10);
        fetchData();
      } else {
        alert(data.error || "Gagal melakukan restock.");
      }
    } catch (err) {
      setSubmitting(false);
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900">Restock & Pergerakan Stok (Stock Movement)</h1>
        <p className="text-xs text-slate-500 mt-1">
          Catat penambahan stok barang masuk dari supplier dan lihat riwayat pergerakan stok keluar/masuk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Restock Form */}
        <div className="space-y-4">
          <form onSubmit={handleRestockSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm pb-3 border-b border-slate-100">
              Form Restock (Barang Masuk)
            </h3>

            {msg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                ✓ {msg}
              </div>
            )}

            <div ref={comboboxRef} className="relative">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Pilih Barang Stationery
              </label>
              <input
                type="text"
                required={!selectedItemId}
                placeholder="Ketik untuk cari nama barang..."
                value={dropdownOpen ? itemSearch : selectedItem ? `${selectedItem.nama} (Stok Saat Ini: ${selectedItem.stok} ${selectedItem.satuan})` : ""}
                onFocus={() => {
                  setDropdownOpen(true);
                  setItemSearch("");
                }}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setSelectedItemId("");
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                  {filteredItems.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">Tidak ada barang yang cocok.</div>
                  ) : (
                    filteredItems.map((i) => (
                      <button
                        type="button"
                        key={i.id}
                        onClick={() => {
                          setSelectedItemId(String(i.id));
                          setItemSearch("");
                          setDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-emerald-50 cursor-pointer border-b border-slate-50 last:border-0"
                      >
                        {i.nama}{" "}
                        <span className="text-slate-400 font-normal">
                          (Stok Saat Ini: {i.stok} {i.satuan})
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Jumlah Masuk (Restock Qty)
              </label>
              <input
                type="number"
                min="1"
                required
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl shadow-md transition-all text-xs disabled:opacity-60 cursor-pointer"
            >
              {submitting ? "Menyimpan Restock..." : "Tambah Stok Barang"}
            </button>
          </form>
        </div>

        {/* Movements History */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h3 className="font-extrabold text-slate-900 text-sm pb-3 border-b border-slate-100">
            Riwayat Transaksi Stok (Log Movement)
          </h3>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Memuat log pergerakan stok...</div>
          ) : movements.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">Belum ada catatan pergerakan stok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-3">Waktu</th>
                    <th className="py-3 px-3">Tipe</th>
                    <th className="py-3 px-3">Barang</th>
                    <th className="py-3 px-3">Jumlah</th>
                    <th className="py-3 px-3">Referensi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 text-slate-400">
                        {new Date(m.tanggal).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          m.tipe === "masuk"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-rose-50 text-rose-800 border border-rose-200"
                        }`}>
                          {m.tipe}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">{m.item?.nama}</td>
                      <td className="py-3 px-3 font-extrabold">
                        {m.tipe === "masuk" ? "+" : "-"}{m.qty} {m.item?.satuan}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {m.refRequest ? (
                          <span>Ref Pengajuan #{m.refRequest.id} ({m.refRequest.departemen?.kode})</span>
                        ) : (
                          <span className="italic text-slate-400">Restock Supplier</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
