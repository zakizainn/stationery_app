"use client";

import { useMemo, useRef, useState } from "react";
import { DownloadSimple, Plus, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import { hariIniWIB } from "@/lib/waktu";

export interface ItemRestock {
  id: number;
  nama: string;
  satuan: string;
  stok: number;
}

interface Baris {
  key: number;
  itemId: number | null;
  nama: string;
  qty: string;
  harga: string;
  /** Pesan dari server (pratinjau Excel) -- baris ini tidak akan disimpan. */
  pesanServer?: string;
}

interface BarisPratinjau {
  rowNum: number;
  nama: string;
  itemId?: number;
  itemNama?: string;
  qty?: number;
  harga: number | null;
  status: "ok" | "error";
  pesan?: string;
}

const FOKUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
const INPUT = `w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-semibold text-slate-800 ${FOKUS}`;

function normal(s: string) {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

export default function RestockMassal({
  items,
  onSelesai,
}: {
  items: ItemRestock[];
  onSelesai: () => void;
}) {
  const [tanggal, setTanggal] = useState(hariIniWIB());
  const [catatan, setCatatan] = useState("");
  const [baris, setBaris] = useState<Baris[]>([]);
  const [membaca, setMembaca] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "sukses" | "error"; teks: string } | null>(null);
  const [ringkasan, setRingkasan] = useState<string | null>(null);
  const kunci = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const peta = useMemo(() => new Map(items.map((i) => [normal(i.nama), i])), [items]);
  const petaId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Pesan masalah tiap baris diturunkan saat render, bukan disimpan di state,
  // jadi selalu sinkron dengan isi kolom.
  function masalah(b: Baris): string | null {
    if (b.pesanServer) return b.pesanServer;
    if (!b.itemId) return "Pilih barang dari daftar.";
    const q = Number(b.qty);
    if (b.qty.trim() === "" || !Number.isInteger(q) || q <= 0) return "Jumlah harus bilangan bulat lebih dari 0.";
    if (b.harga.trim() !== "") {
      const h = Number(b.harga);
      if (!Number.isInteger(h) || h < 0) return "Harga harus bilangan bulat 0 atau lebih.";
    }
    return null;
  }

  const valid = baris.filter((b) => !masalah(b));
  const bermasalah = baris.length - valid.length;
  const totalQty = valid.reduce((s, b) => s + Number(b.qty), 0);

  function tambahBaris() {
    setBaris((prev) => [...prev, { key: kunci.current++, itemId: null, nama: "", qty: "", harga: "" }]);
  }

  function ubahBaris(key: number, perubahan: Partial<Baris>) {
    setBaris((prev) => prev.map((b) => (b.key === key ? { ...b, ...perubahan } : b)));
  }

  function ubahNama(key: number, nama: string) {
    const ketemu = peta.get(normal(nama));
    ubahBaris(key, { nama, itemId: ketemu?.id ?? null, pesanServer: undefined });
  }

  async function unggah(file: File) {
    setMembaca(true);
    setPesan(null);
    setRingkasan(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/stationaryapps/api/restock/massal/impor", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) {
        setPesan({ jenis: "error", teks: json.error || "Gagal membaca file." });
        return;
      }
      const dari: BarisPratinjau[] = json.data.baris;
      const hasil: Baris[] = dari.map((r) => ({
        key: kunci.current++,
        itemId: r.status === "ok" ? (r.itemId ?? null) : null,
        nama: r.status === "ok" ? (r.itemNama ?? r.nama) : r.nama,
        qty: r.qty !== undefined ? String(r.qty) : "",
        harga: r.harga !== null && r.harga !== undefined ? String(r.harga) : "",
        pesanServer: r.status === "error" ? `Baris ${r.rowNum} di Excel: ${r.pesan}` : undefined,
      }));
      setBaris(hasil);
      const r = json.data.ringkasan;
      setRingkasan(
        `${r.valid} baris siap disimpan, ${r.error} bermasalah, ${r.dilewati} dilewati (QTY kosong). Periksa tabel di bawah lalu klik Simpan.`
      );
    } catch {
      setPesan({ jenis: "error", teks: "Koneksi ke server gagal. Coba lagi." });
    } finally {
      setMembaca(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function simpan() {
    if (valid.length === 0 || menyimpan) return;
    if (bermasalah > 0 && !confirm(`${bermasalah} baris bermasalah TIDAK akan disimpan. Lanjutkan menyimpan ${valid.length} baris yang valid?`)) {
      return;
    }
    setMenyimpan(true);
    setPesan(null);
    try {
      const res = await fetch("/stationaryapps/api/restock/massal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal,
          catatan: catatan.trim() || undefined,
          baris: valid.map((b) => ({
            itemId: b.itemId,
            qty: Number(b.qty),
            harga: b.harga.trim() === "" ? null : Number(b.harga),
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPesan({ jenis: "sukses", teks: json.message });
        setBaris([]);
        setRingkasan(null);
        setCatatan("");
        onSelesai();
      } else {
        setPesan({ jenis: "error", teks: json.error || "Gagal menyimpan restock." });
      }
    } catch {
      setPesan({ jenis: "error", teks: "Koneksi ke server gagal. Tidak ada data yang tersimpan, coba lagi." });
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <section className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-5" aria-label="Restock massal">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Restock banyak barang sekaligus</h2>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Unggah Excel (satu baris per barang yang datang) atau tambah baris manual. Semua baris disimpan dalam satu
            transaksi: berhasil semua atau tidak ada yang tersimpan.
          </p>
        </div>
        <a
          href="/stationaryapps/api/restock/massal/impor"
          className={`inline-flex items-center gap-2 text-xs font-bold text-brand-700 hover:text-brand-800 underline underline-offset-4 shrink-0 ${FOKUS} rounded`}
        >
          <DownloadSimple size={14} aria-hidden="true" />
          Unduh template
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="rm-tanggal" className="block text-xs font-bold text-slate-700 mb-1.5">
            Tanggal barang datang
          </label>
          <input
            id="rm-tanggal"
            type="date"
            value={tanggal}
            max={hariIniWIB()}
            onChange={(e) => setTanggal(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="rm-catatan" className="block text-xs font-bold text-slate-700 mb-1.5">
            Catatan (pemasok, no. PO, surat jalan) <span className="font-normal text-slate-500">opsional</span>
          </label>
          <input
            id="rm-catatan"
            type="text"
            maxLength={200}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Contoh: Pemasok Sukses Mandiri, PO-2026-114"
            className={INPUT}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          id="rm-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void unggah(f);
          }}
        />
        <label
          htmlFor="rm-file"
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 ${FOKUS} focus-within:ring-2`}
        >
          <UploadSimple size={14} aria-hidden="true" />
          {membaca ? "Membaca file..." : "Unggah Excel"}
        </label>
        <button
          type="button"
          onClick={tambahBaris}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 ${FOKUS}`}
        >
          <Plus size={14} aria-hidden="true" />
          Tambah baris manual
        </button>
      </div>

      {ringkasan && <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">{ringkasan}</p>}
      {pesan && (
        <p
          role={pesan.jenis === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-xs font-bold ${
            pesan.jenis === "sukses" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-brand-200 bg-brand-50 text-brand-900"
          }`}
        >
          {pesan.teks}
        </p>
      )}

      {baris.length > 0 && (
        <>
          <datalist id="rm-daftar-barang">
            {items.map((i) => (
              <option key={i.id} value={i.nama} />
            ))}
          </datalist>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th scope="col" className="py-2.5 px-3 w-10">No</th>
                  <th scope="col" className="py-2.5 px-3">Barang</th>
                  <th scope="col" className="py-2.5 px-3 text-right w-28">Stok saat ini</th>
                  <th scope="col" className="py-2.5 px-3 w-28">Jumlah masuk</th>
                  <th scope="col" className="py-2.5 px-3 w-36">Harga beli (opsional)</th>
                  <th scope="col" className="py-2.5 px-3 w-10"><span className="sr-only">Hapus</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {baris.map((b, idx) => {
                  const m = masalah(b);
                  const item = b.itemId ? petaId.get(b.itemId) : undefined;
                  return (
                    <tr key={b.key} className={m ? "bg-brand-50/40" : ""}>
                      <td className="py-2 px-3 text-slate-500 align-top">{idx + 1}</td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          list="rm-daftar-barang"
                          aria-label={`Barang baris ${idx + 1}`}
                          value={b.nama}
                          onChange={(e) => ubahNama(b.key, e.target.value)}
                          placeholder="Ketik nama barang"
                          className={INPUT}
                        />
                        {m && (
                          <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-brand-800">
                            <Warning size={13} className="mt-px shrink-0" aria-hidden="true" />
                            {m}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600 align-top pt-4">
                        {item ? `${item.stok} ${item.satuan}` : "–"}
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          aria-label={`Jumlah masuk baris ${idx + 1}`}
                          value={b.qty}
                          onChange={(e) => ubahBaris(b.key, { qty: e.target.value, pesanServer: undefined })}
                          className={INPUT}
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          aria-label={`Harga beli baris ${idx + 1}`}
                          value={b.harga}
                          onChange={(e) => ubahBaris(b.key, { harga: e.target.value })}
                          placeholder="harga master"
                          className={INPUT}
                        />
                      </td>
                      <td className="py-2 px-3 align-top pt-2.5">
                        <button
                          type="button"
                          onClick={() => setBaris((prev) => prev.filter((x) => x.key !== b.key))}
                          aria-label={`Hapus baris ${idx + 1}`}
                          className={`cursor-pointer rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700 ${FOKUS}`}
                        >
                          <Trash size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">{valid.length}</span> baris valid, total{" "}
              <span className="font-bold text-slate-900">{totalQty.toLocaleString("id-ID")}</span> unit
              {bermasalah > 0 && (
                <span className="font-bold text-brand-700"> · {bermasalah} baris bermasalah tidak akan disimpan</span>
              )}
            </p>
            <button
              type="button"
              onClick={simpan}
              disabled={menyimpan || valid.length === 0}
              className={`cursor-pointer rounded-md bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOKUS}`}
            >
              {menyimpan ? "Menyimpan..." : `Simpan ${valid.length} baris`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
