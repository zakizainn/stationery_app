"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Item {
  id: number;
  nama: string;
  kategori: string;
  satuan: string;
  stok: number;
  stokMinimum: number;
  bisaDitukar: boolean;
  jenisKertas?: string;
  fotoUrl?: string;
}

export default function KatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selectedKategori, setSelectedKategori] = useState<string>("semua");
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected item modal for adding to cart
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [qty, setQty] = useState(1);
  const [penggunaan, setPenggunaan] = useState("");
  const [itemLamaId, setItemLamaId] = useState<string>("");

  useEffect(() => {
    fetchItems();
    updateCartCount();
  }, []);

  const updateCartCount = () => {
    try {
      const saved = localStorage.getItem("stationery_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCartCount(parsed.length);
      } else {
        setCartCount(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchItems = () => {
    setLoading(true);
    let url = "/api/items?";
    if (search) url += `q=${encodeURIComponent(search)}&`;
    if (selectedKategori !== "semua") url += `kategori=${selectedKategori}&`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setItems(data.data);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedKategori]);

  const handleAddToCart = () => {
    if (!activeItem) return;
    if (activeItem.stok <= 0) {
      showToast("Stok barang ini sedang habis.");
      return;
    }

    try {
      const saved = localStorage.getItem("stationery_cart");
      let cart = saved ? JSON.parse(saved) : [];

      // Check if already in cart
      const existingIdx = cart.findIndex((i: any) => i.itemId === activeItem.id);

      const cartItemObj = {
        itemId: activeItem.id,
        nama: activeItem.nama,
        qty: qty,
        satuan: activeItem.satuan,
        kategori: activeItem.kategori,
        bisaDitukar: activeItem.bisaDitukar,
        penggunaan: activeItem.kategori === "kertas" ? penggunaan : undefined,
        itemLamaId: activeItem.bisaDitukar && itemLamaId ? Number(itemLamaId) : undefined,
      };

      if (existingIdx >= 0) {
        // Barang sudah ada di keranjang -- tambahkan qty ke yang sudah ada,
        // jangan timpa (sebelumnya ini overwrite dan bikin qty lama hilang).
        cart[existingIdx] = {
          ...cartItemObj,
          qty: cart[existingIdx].qty + qty,
        };
      } else {
        cart.push(cartItemObj);
      }

      localStorage.setItem("stationery_cart", JSON.stringify(cart));
      updateCartCount();
      showToast(`"${activeItem.nama}" ditambahkan ke keranjang!`);
      setActiveItem(null);
      setQty(1);
      setPenggunaan("");
      setItemLamaId("");
    } catch (e) {
      console.error(e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 animate-fade-in border border-slate-700">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Katalog Barang Stationery</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pilih kebutuhan ATK dan masukkan ke dalam keranjang pengajuan Anda.
          </p>
        </div>

        <Link
          href="/keranjang"
          className="relative inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all text-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          Lihat Keranjang
          {cartCount > 0 && (
            <span className="ml-1 bg-white text-emerald-800 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black shadow-xs">
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      {/* Search & Filter Section */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama barang... (misal: Pulpen, Kertas HVS)"
            className="w-full bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 pl-10 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "semua", label: "Semua Barang" },
            { id: "barang_umum", label: "Barang Umum" },
            { id: "kertas", label: "Kertas" },
            { id: "checksheet", label: "Checksheet" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedKategori(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedKategori === cat.id
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Memuat data barang...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Tidak ada barang yang sesuai pencarian atau filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => {
            const isLowStock = item.stok > 0 && item.stok <= item.stokMinimum;
            const isOutOfStock = item.stok <= 0;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {item.kategori.replace("_", " ")}
                    </span>
                    {item.jenisKertas && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                        {item.jenisKertas}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors">
                    {item.nama}
                  </h3>

                  <div className="mt-3 flex items-center gap-2">
                    {isOutOfStock ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                        Stok Habis (0 {item.satuan})
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                        Stok Menipis ({item.stok} {item.satuan})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        Tersedia ({item.stok} {item.satuan})
                      </span>
                    )}
                  </div>

                  {item.bisaDitukar && (
                    <div className="mt-2 text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-200/60 inline-flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Bisa tukar barang lama
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Satuan: {item.satuan}</span>
                  <button
                    onClick={() => {
                      setActiveItem(item);
                      setQty(1);
                      setPenggunaan("");
                      // Wajib tukar = tukar dengan barang yang sama (pulpen lama ->
                      // pulpen baru), bukan pilih bebas barang lain.
                      setItemLamaId(item.bisaDitukar ? String(item.id) : "");
                    }}
                    disabled={isOutOfStock}
                    className="bg-slate-900 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    + Keranjang
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add to Cart */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="font-extrabold text-slate-900 text-base">Tambah ke Keranjang</h2>
              <button
                onClick={() => setActiveItem(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {activeItem.kategori.replace("_", " ")}
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">{activeItem.nama}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stok saat ini: <strong className="text-slate-800">{activeItem.stok} {activeItem.satuan}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jumlah Pengajuan ({activeItem.satuan})
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={activeItem.stok}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 font-bold text-sm text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(activeItem.stok, q + 1))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {activeItem.kategori === "kertas" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tujuan Penggunaan (Wajib untuk Kertas)
                  </label>
                  <input
                    type="text"
                    value={penggunaan}
                    onChange={(e) => setPenggunaan(e.target.value)}
                    placeholder="Contoh: Cetak laporan audit bulanan QA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {activeItem.bisaDitukar && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                  <label className="block text-xs font-bold text-purple-900 uppercase tracking-wider mb-1">
                    Penukaran Barang Lama (Wajib)
                  </label>
                  <p className="text-[11px] text-purple-700">
                    Item ini wajib ditukar dengan <strong>{activeItem.nama}</strong> lama milik kamu saat
                    pengambilan barang baru — bukan barang lain.
                  </p>
                </div>
              )}

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveItem(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Simpan ke Keranjang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
