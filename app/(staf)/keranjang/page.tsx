"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getKategoriLabel } from "@/lib/kategori";
import { ShoppingCart, Trash } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";

interface CartItem {
  itemId: number;
  nama: string;
  qty: number;
  satuan: string;
  kategori: string;
  bisaDitukar?: boolean;
  penggunaan?: string;
  itemLamaId?: number;
}

export default function KeranjangPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tipe, setTipe] = useState<"rutin" | "order_baru">("rutin");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    try {
      const saved = localStorage.getItem("stationery_cart");
      if (saved) {
        setCart(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateQuantity = (itemId: number, delta: number) => {
    const updated = cart.map((item) => {
      if (item.itemId === itemId) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    });
    setCart(updated);
    localStorage.setItem("stationery_cart", JSON.stringify(updated));
  };

  const removeItem = (itemId: number) => {
    const updated = cart.filter((item) => item.itemId !== itemId);
    setCart(updated);
    localStorage.setItem("stationery_cart", JSON.stringify(updated));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (cart.length === 0) {
      setError("Keranjang Anda masih kosong.");
      return;
    }

    // Check if paper items have usage rationale
    const paperWithoutUsage = cart.find(
      (item) => item.kategori === "kertas" && (!item.penggunaan || item.penggunaan.trim() === "")
    );
    if (paperWithoutUsage) {
      setError(`Tujuan penggunaan wajib diisi untuk barang kategori Kertas (${paperWithoutUsage.nama}).`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipe,
          catatan,
          items: cart,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok || !data.success) {
        setError(data.error || "Gagal mengirim pengajuan.");
        return;
      }

      // Clear local cart
      localStorage.removeItem("stationery_cart");
      router.push("/riwayat");
    } catch (err: any) {
      setLoading(false);
      setError(err.message || "Terjadi kesalahan koneksi.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Keranjang Pengajuan</h1>
          <p className="text-xs text-slate-500 mt-1">
            Periksa kembali item barang yang ingin diajukan. Order Rutin langsung diteruskan ke Admin Stationery, sedangkan Order Baru membutuhkan persetujuan Atasan Departemen.
          </p>
        </div>

        <Link
          href="/katalog"
          className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-md transition-all text-xs shrink-0 self-start sm:self-auto"
        >
          ← Tambah Barang Lain
        </Link>
      </div>

      {cart.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          judul="Keranjang Anda Masih Kosong"
          deskripsi="Anda belum menambahkan barang stationery ke dalam keranjang."
          aksi={{ label: "Buka Katalog Barang", href: "/katalog" }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart items list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-md border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Daftar Barang ({cart.length} Item)
                </span>
                <button
                  onClick={() => {
                    localStorage.removeItem("stationery_cart");
                    setCart([]);
                  }}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Kosongkan Keranjang
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {cart.map((item) => (
                  <div key={item.itemId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {getKategoriLabel(item.kategori)}
                        </span>
                        {item.itemLamaId && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            Tukar Barang
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-1">{item.nama}</h4>

                      {item.penggunaan && (
                        <p className="text-xs text-slate-500 mt-1 italic">
                          Tujuan: &quot;{item.penggunaan}&quot;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      {/* Quantity adjuster */}
                      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.itemId, -1)}
                          className="w-7 h-7 rounded-lg bg-white shadow-xs font-bold text-slate-700 flex items-center justify-center hover:bg-slate-50"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-xs text-slate-800">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.itemId, 1)}
                          className="w-7 h-7 rounded-lg bg-white shadow-xs font-bold text-slate-700 flex items-center justify-center hover:bg-slate-50"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-xs font-bold text-slate-600 w-12">
                        {item.satuan}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeItem(item.itemId)}
                        className="text-slate-500 hover:text-rose-600 transition-colors p-1"
                        title="Hapus barang"
                      >
                        <Trash size={20} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Request Form & Summary */}
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-sm pb-3 border-b border-slate-100">
                Detail Pengajuan
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Tipe Permintaan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipe("rutin")}
                    className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                      tipe === "rutin"
                        ? "bg-brand-50 border-brand-500 text-brand-900 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                  >
                    <div className="text-xs">Rutin</div>
                    <div className="text-xs opacity-75 font-normal">Langsung ke Admin Stationery (Tanpa Approval Atasan)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipe("order_baru")}
                    className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                      tipe === "order_baru"
                        ? "bg-brand-50 border-brand-500 text-brand-900 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                  >
                    <div className="text-xs">Order Baru</div>
                    <div className="text-xs opacity-75 font-normal">Perlu Approval Atasan Departemen</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan Pengajuan (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Tambahkan catatan khusus untuk Atasan Departemen atau Admin..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {error && (
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white font-bold py-3 rounded-md shadow-xs shadow-brand-700/20 transition-all text-xs disabled:opacity-60 cursor-pointer"
              >
                {loading ? "Mengirim Pengajuan..." : "Kirim Pengajuan Sekarang"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
