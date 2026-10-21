"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { labelPeriode, periodeSekarangWIB } from "@/lib/waktu";

interface BarisPratinjau {
  rowNum: number;
  nama: string;
  itemId?: number;
  itemNama?: string;
  satuan?: string;
  stokSistem?: number;
  stokAwal?: number;
  harga?: number | null;
  hargaLapisan?: number | null;
  mutasiBerjalan?: number;
  stokSesudah?: number;
  selisih?: number;
  status: "ok" | "error";
  pesan?: string;
}

interface Pratinjau {
  periode: string;
  baris: BarisPratinjau[];
  ringkasan: { valid: number; error: number; dilewati: number; berubah: number; sama: number };
}

interface StatusPeriode {
  periode: string;
  jumlahBarang: number;
  totalBarangAktif: number;
  terakhirDiperbarui: string | null;
}

type Filter = "semua" | "berubah" | "bermasalah";

const FOKUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function tandaSelisih(n: number) {
  return n > 0 ? `+${n.toLocaleString("id-ID")}` : n < 0 ? `−${Math.abs(n).toLocaleString("id-ID")}` : "0";
}

export default function StokAwalPage() {
  const sekarang = periodeSekarangWIB();
  const [periode, setPeriode] = useState(sekarang);
  const [status, setStatus] = useState<StatusPeriode | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [filter, setFilter] = useState<Filter>("semua");
  const [membaca, setMembaca] = useState(false);
  const [menerapkan, setMenerapkan] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "sukses" | "error"; teks: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tahunNow, bulanNow] = sekarang.split("-").map(Number);
  const [tahun, bulan] = periode.split("-").map(Number);
  const daftarTahun = [tahunNow, tahunNow - 1];

  const ubahPeriode = (t: number, b: number) => {
    // Periode tidak boleh di masa depan.
    const bb = t === tahunNow ? Math.min(b, bulanNow) : b;
    setPeriode(`${t}-${String(bb).padStart(2, "0")}`);
    setPratinjau(null);
    setPesan(null);
  };

  const muatStatus = useCallback(async (p: string) => {
    try {
      const res = await fetch(`/stationaryapps/api/stok-awal?periode=${p}`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      /* status hanya informasi tambahan; abaikan kalau gagal */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muatStatus(periode);
  }, [periode, muatStatus]);

  async function unggah(file: File) {
    setMembaca(true);
    setPesan(null);
    setPratinjau(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("periode", periode);
      const res = await fetch("/stationaryapps/api/stok-awal/impor", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) {
        setPesan({ jenis: "error", teks: json.error || "Gagal membaca file." });
        return;
      }
      setPratinjau(json.data);
      setFilter("semua");
    } catch {
      setPesan({ jenis: "error", teks: "Koneksi ke server gagal. Coba lagi." });
    } finally {
      setMembaca(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function terapkan() {
    if (!pratinjau || menerapkan) return;
    const valid = pratinjau.baris.filter((b) => b.status === "ok");
    if (valid.length === 0) return;
    const { berubah, error } = pratinjau.ringkasan;
    const konfirmasi =
      `Terapkan stok awal ${labelPeriode(pratinjau.periode)} untuk ${valid.length} barang?\n\n` +
      `• ${berubah} barang stok sistemnya akan DIUBAH\n` +
      (error > 0 ? `• ${error} baris bermasalah TIDAK akan diterapkan\n` : "") +
      `\nPerubahan dicatat sebagai penyesuaian stok dan tidak dihitung sebagai pembelian/pemakaian.`;
    if (!confirm(konfirmasi)) return;

    setMenerapkan(true);
    setPesan(null);
    try {
      const res = await fetch("/stationaryapps/api/stok-awal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periode: pratinjau.periode,
          baris: valid.map((b) => ({ itemId: b.itemId, qty: b.stokAwal, harga: b.harga ?? null })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPesan({ jenis: "sukses", teks: json.message });
        setPratinjau(null);
        void muatStatus(periode);
      } else {
        setPesan({ jenis: "error", teks: json.error || "Gagal menerapkan stok awal." });
      }
    } catch {
      setPesan({ jenis: "error", teks: "Koneksi ke server gagal. Tidak ada data yang berubah, coba lagi." });
    } finally {
      setMenerapkan(false);
    }
  }

  const tampil = useMemo(() => {
    if (!pratinjau) return [];
    return pratinjau.baris.filter((b) => {
      if (filter === "berubah") return b.status === "ok" && (b.selisih ?? 0) !== 0;
      if (filter === "bermasalah") return b.status === "error";
      return true;
    });
  }, [pratinjau, filter]);

  const selectCls = `bg-white border border-slate-200 rounded-md px-3 py-2.5 text-xs font-bold text-slate-800 cursor-pointer ${FOKUS}`;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-md border border-slate-200/80 shadow-xs">
        <h1 className="text-xl font-extrabold text-slate-900">Stok Awal Periode</h1>
        <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
          Selaraskan stok di aplikasi dengan hasil hitung fisik pada awal sebuah periode. Selisihnya dicatat sebagai
          penyesuaian stok (bukan pembelian atau pemakaian), dan angka ini menjadi titik awal kartu stok bulan tersebut.
        </p>
        <p className="mt-3 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900">
          Isi dengan stok pada <span className="font-extrabold">tanggal 1 bulan yang dipilih (awal bulan)</span>, bukan
          stok hari ini. Transaksi sejak tanggal 1 (restock, pemakaian) ditambahkan otomatis di kolom &quot;Mutasi bulan
          ini&quot;, jadi mengisi stok hari ini akan menghitung transaksi itu dua kali.
        </p>
      </div>

      <section className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-5" aria-label="Pilih periode">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="sa-bulan" className="block text-xs font-bold text-slate-700 mb-1.5">Bulan</label>
            <select id="sa-bulan" value={bulan} onChange={(e) => ubahPeriode(tahun, Number(e.target.value))} className={selectCls}>
              {NAMA_BULAN.map((n, i) => (
                <option key={n} value={i + 1} disabled={tahun === tahunNow && i + 1 > bulanNow}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sa-tahun" className="block text-xs font-bold text-slate-700 mb-1.5">Tahun</label>
            <select id="sa-tahun" value={tahun} onChange={(e) => ubahPeriode(Number(e.target.value), bulan)} className={selectCls}>
              {daftarTahun.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <p className="text-xs text-slate-600 pb-2.5" role="status">
            {status && status.periode === periode ? (
              status.jumlahBarang > 0 ? (
                <>
                  Stok awal {labelPeriode(periode)} sudah tersimpan untuk{" "}
                  <span className="font-bold text-slate-900">{status.jumlahBarang}</span> dari {status.totalBarangAktif} barang aktif
                  {status.terakhirDiperbarui && <> (diperbarui {new Date(status.terakhirDiperbarui).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })})</>}.
                </>
              ) : (
                <>Belum ada stok awal tersimpan untuk {labelPeriode(periode)}.</>
              )
            ) : null}
          </p>
        </div>

        <ol className="space-y-3 text-xs text-slate-700">
          <li className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">1.</span>
            <a
              href={`/stationaryapps/api/stok-awal?periode=${periode}&template=1`}
              className={`inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-800 hover:bg-slate-50 ${FOKUS}`}
            >
              <DownloadSimple size={14} aria-hidden="true" />
              Unduh template
            </a>
            <span className="text-slate-600">
              Isi kolom STOK_AWAL dengan stok fisik pada tanggal 1 periode, dan kolom HARGA (opsional) untuk harga lapisan baru. Baris yang dikosongkan tidak diubah.
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">2.</span>
            <input
              ref={fileRef}
              id="sa-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void unggah(f);
              }}
            />
            <label
              htmlFor="sa-file"
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-800 hover:bg-slate-50 ${FOKUS} focus-within:ring-2`}
            >
              <UploadSimple size={14} aria-hidden="true" />
              {membaca ? "Membaca file..." : "Unggah file untuk pratinjau"}
            </label>
            <span className="text-slate-600">Belum ada yang berubah sampai Anda menekan Terapkan.</span>
          </li>
        </ol>
      </section>

      {pesan && (
        <p
          role={pesan.jenis === "error" ? "alert" : "status"}
          className={`rounded-md border px-4 py-3 text-xs font-bold ${
            pesan.jenis === "sukses" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-brand-200 bg-brand-50 text-brand-900"
          }`}
        >
          {pesan.teks}
        </p>
      )}

      {pratinjau && (
        <section className="bg-white rounded-md border border-slate-200/80 p-6 shadow-xs space-y-5" aria-label="Pratinjau stok awal">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Pratinjau stok awal {labelPeriode(pratinjau.periode)}</h2>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter baris">
              {([
                ["semua", `Semua (${pratinjau.baris.length})`],
                ["berubah", `Berubah (${pratinjau.ringkasan.berubah})`],
                ["bermasalah", `Bermasalah (${pratinjau.ringkasan.error})`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${FOKUS} ${
                    filter === id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            <span className="font-bold text-slate-900">{pratinjau.ringkasan.berubah}</span> barang akan diubah,{" "}
            <span className="font-bold text-slate-900">{pratinjau.ringkasan.sama}</span> sudah sama,{" "}
            <span className={`font-bold ${pratinjau.ringkasan.error ? "text-brand-700" : "text-slate-900"}`}>{pratinjau.ringkasan.error}</span> bermasalah,{" "}
            {pratinjau.ringkasan.dilewati} dilewati (STOK_AWAL kosong).
          </p>

          {tampil.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-xs font-semibold text-slate-600">
              Tidak ada baris untuk filter ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th scope="col" className="py-2.5 px-3">Excel</th>
                    <th scope="col" className="py-2.5 px-3">Barang</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Stok sistem</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Stok awal</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Harga lapisan</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Mutasi bulan ini</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Stok hasil</th>
                    <th scope="col" className="py-2.5 px-3 text-right">Selisih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tampil.map((b) => (
                    <tr key={b.rowNum} className={b.status === "error" ? "bg-brand-50/40" : ""}>
                      <td className="py-2.5 px-3 text-slate-500 align-top">Baris {b.rowNum}</td>
                      <td className="py-2.5 px-3 align-top">
                        <span className="font-bold text-slate-900">{b.itemNama ?? (b.nama || "(tanpa nama)")}</span>
                        {b.status === "error" && <span className="mt-0.5 block font-semibold text-brand-800">{b.pesan}</span>}
                      </td>
                      {b.status === "ok" || b.stokSistem !== undefined ? (
                        <>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 align-top">{b.stokSistem?.toLocaleString("id-ID")} {b.satuan}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 align-top">{b.stokAwal?.toLocaleString("id-ID")}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-teal-800 font-semibold align-top">
                            {b.hargaLapisan !== undefined && b.hargaLapisan !== null
                              ? `Rp ${b.hargaLapisan.toLocaleString("id-ID")}`
                              : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 align-top">{tandaSelisih(b.mutasiBerjalan ?? 0)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 align-top">{b.stokSesudah?.toLocaleString("id-ID")}</td>
                          <td
                            className={`py-2.5 px-3 text-right tabular-nums font-extrabold align-top ${
                              (b.selisih ?? 0) > 0 ? "text-blue-700" : (b.selisih ?? 0) < 0 ? "text-brand-700" : "text-slate-500"
                            }`}
                          >
                            {tandaSelisih(b.selisih ?? 0)}
                          </td>
                        </>
                      ) : (
                        <td colSpan={6} />
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600">
              Stok hasil = stok awal + mutasi (masuk − keluar ± penyesuaian) sejak tanggal 1 {labelPeriode(pratinjau.periode)}.
            </p>
            <button
              type="button"
              onClick={terapkan}
              disabled={menerapkan || pratinjau.ringkasan.valid === 0}
              className={`cursor-pointer rounded-md bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOKUS}`}
            >
              {menerapkan ? "Menerapkan..." : `Terapkan stok awal (${pratinjau.ringkasan.valid} barang)`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
