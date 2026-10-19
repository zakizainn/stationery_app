"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsClockwise, Check } from "@phosphor-icons/react";
import { STATUS_TONE } from "@/lib/status";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import RestockMassal from "@/components/admin/RestockMassal";
import { hariIniWIB } from "@/lib/waktu";

// Cara membaca satu baris log movement: label, warna badge, tanda (+/-), dan asal.
const TIPE_TAMPIL: Record<string, { label: string; kelas: string; tanda: "+" | "-" }> = {
  masuk: { label: "masuk", kelas: "bg-blue-50 text-blue-700 border border-blue-200", tanda: "+" },
  keluar: { label: "keluar", kelas: "bg-rose-50 text-rose-800 border border-rose-200", tanda: "-" },
  penyesuaian_plus: { label: "penyesuaian", kelas: "bg-amber-50 text-amber-800 border border-amber-200", tanda: "+" },
  penyesuaian_minus: { label: "penyesuaian", kelas: "bg-amber-50 text-amber-800 border border-amber-200", tanda: "-" },
};

const SUMBER_LABEL: Record<string, string> = {
  restock: "Restock supplier",
  restock_massal: "Restock massal",
  impor: "Impor Excel Master Item",
  edit_manual: "Edit stok di Master Item",
  stok_awal: "Stok awal barang baru",
  baseline: "Stok awal periode",
  sto: "Stock opname",
};

export default function RestockPage() {
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [qty, setQty] = useState<number>(10);
  const [hargaBeli, setHargaBeli] = useState<string>("");
  const [tanggal, setTanggal] = useState<string>("");
  const [catatan, setCatatan] = useState<string>("");
  const [mode, setMode] = useState<"satu" | "massal">("satu");
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
          harga: hargaBeli !== "" ? Number(hargaBeli) : undefined,
          tanggal: tanggal || undefined,
          catatan: catatan.trim() || undefined,
        }),
      });

      const data = await res.json();
      setSubmitting(false);

      if (data.success) {
        setMsg(data.message || "Restock berhasil!");
        setSelectedItemId("");
        setItemSearch("");
        setQty(10);
        setHargaBeli("");
        setTanggal("");
        setCatatan("");
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
      <div className="bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900">Restock & Pergerakan Stok (Stock Movement)</h1>
        <p className="text-xs text-slate-500 mt-1">
          Catat penambahan stok barang masuk dari supplier dan lihat riwayat pergerakan stok keluar/masuk.
        </p>
      </div>

      <div role="tablist" aria-label="Cara mencatat restock" className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-xs">
        {([
          ["satu", "Satu barang"],
          ["massal", "Banyak barang (massal)"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`cursor-pointer rounded px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              mode === id ? "bg-brand-700 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "massal" && <RestockMassal items={items} onSelesai={fetchData} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Restock Form (satu barang) */}
        {mode === "satu" && (
        <div className="space-y-4">
          <form onSubmit={handleRestockSubmit} className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm pb-3 border-b border-slate-100">
              Form Restock (Barang Masuk)
            </h3>

            {msg && (
              <div className={`p-3 rounded-md border text-xs font-bold flex items-center gap-2 ${STATUS_TONE.sukses}`}>
                <Check size={14} className="shrink-0" aria-hidden="true" />
                {msg}
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
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />

              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-md">
                  {filteredItems.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">Tidak ada barang yang cocok.</div>
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
                        className="w-full text-left px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-brand-50 cursor-pointer border-b border-slate-50 last:border-0"
                      >
                        {i.nama}{" "}
                        <span className="text-slate-500 font-normal">
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
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Harga Beli Satuan <span className="font-normal normal-case text-slate-500">(opsional, kosong = pakai harga master{selectedItem ? `: Rp ${selectedItem.harga.toLocaleString("id-ID")}` : ""})</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={hargaBeli}
                  onChange={(e) => setHargaBeli(e.target.value)}
                  placeholder={selectedItem ? String(selectedItem.harga) : "Sesuai harga master"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md py-2.5 pl-9 pr-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Membentuk lapisan stok FIFO baru di harga ini tanpa mengubah harga master.
              </p>
              {(() => {
                if (!selectedItem || selectedItem.harga <= 0 || !hargaBeli) return null;
                const hNum = Number(hargaBeli);
                if (isNaN(hNum) || hNum <= 0) return null;
                const isJanggal = hNum > selectedItem.harga * 3 || hNum < selectedItem.harga * 0.3;
                if (!isJanggal) return null;
                return (
                  <div className="mt-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <span className="font-bold text-amber-700">⚠️ Peringatan:</span>
                    <span>
                      Harga beli (<strong>Rp {hNum.toLocaleString("id-ID")}</strong>) menyimpang jauh dari harga master (
                      <strong>Rp {selectedItem.harga.toLocaleString("id-ID")}</strong>). Pastikan angka sudah sesuai faktur/nota.
                    </span>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Tanggal Barang Datang <span className="font-normal normal-case text-slate-500">(kosong = sekarang)</span>
              </label>
              <input
                type="date"
                value={tanggal}
                max={hariIniWIB()}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Catatan <span className="font-normal normal-case text-slate-500">(opsional)</span>
              </label>
              <input
                type="text"
                maxLength={200}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Pemasok / no. PO"
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-700 hover:bg-brand-800 text-white font-bold py-3 rounded-md shadow-xs transition-all text-xs disabled:opacity-60 cursor-pointer"
            >
              {submitting ? "Menyimpan Restock..." : "Tambah Stok Barang"}
            </button>
          </form>
        </div>
        )}

        {/* Movements History */}
        <div className={`${mode === "satu" ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4`}>
          <h3 className="font-extrabold text-slate-900 text-sm pb-3 border-b border-slate-100">
            Riwayat Transaksi Stok (Log Movement)
          </h3>

          {loading ? (
            <TableSkeleton label="Memuat log pergerakan stok..." rows={6} cols={5} />
          ) : movements.length === 0 ? (
            <EmptyState icon={ArrowsClockwise} judul="Belum ada catatan pergerakan stok." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
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
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(m.tanggal).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase ${(TIPE_TAMPIL[m.tipe] ?? TIPE_TAMPIL.keluar).kelas}`}>
                          {(TIPE_TAMPIL[m.tipe] ?? TIPE_TAMPIL.keluar).label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">{m.item?.nama}</td>
                      <td className="py-3 px-3 font-extrabold">
                        {(TIPE_TAMPIL[m.tipe] ?? TIPE_TAMPIL.keluar).tanda}{m.qty} {m.item?.satuan}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {m.refRequest ? (
                          <span>Ref Pengajuan #{m.refRequest.id} ({m.refRequest.departemen?.kode})</span>
                        ) : (
                          <span className="italic text-slate-500">{SUMBER_LABEL[m.sumber] ?? "Restock Supplier"}</span>
                        )}
                        {m.catatan && <span className="block text-slate-600 not-italic">{m.catatan}</span>}
                        {m.dibuatOleh?.nama && <span className="block text-slate-500">oleh {m.dibuatOleh.nama}</span>}
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
