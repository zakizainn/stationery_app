"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CaretUpDown,
  DownloadSimple,
  Printer,
  Warning,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { getKategoriLabel } from "@/lib/kategori";

/* ------------------------------------------------------------------ */
/* Tipe data (sama dengan respons /api/laporan)                        */
/* ------------------------------------------------------------------ */

interface HargaBreakdown {
  harga: number;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface PerItemRow {
  itemId: number;
  nama: string;
  kategori: string;
  satuan: string;
  hargaMin: number;
  hargaMax: number;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
  breakdown: HargaBreakdown[];
}

interface PerDeptRow {
  departemen: string;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface PerKategoriRow {
  kategori: string;
  label: string;
  qtyMasuk: number;
  nominalMasuk: number;
  qtyKeluar: number;
  nominalKeluar: number;
}

interface DetailTransaksiRow {
  id: number;
  tanggal: string;
  tipe: "masuk" | "keluar";
  itemNama: string;
  kategori: string;
  satuan: string;
  qty: number;
  harga: number;
  nominal: number;
  noPengajuan: string | null;
  departemen: string | null;
  pemohon: string | null;
}

interface TrenRow {
  year: number;
  month: number;
  label: string;
  nominalMasuk: number;
  nominalKeluar: number;
}

interface LaporanData {
  periode: { year: number; month: number; label: string };
  summary: { totalNominalMasuk: number; totalNominalKeluar: number; totalQtyMasuk: number; totalQtyKeluar: number };
  perItem: PerItemRow[];
  perDepartemen: PerDeptRow[];
  perKategori: PerKategoriRow[];
  detailTransaksi: DetailTransaksiRow[];
  tren: TrenRow[];
}

type TabId = "ringkasan" | "barang" | "departemen" | "transaksi";
type SortKey = "nama" | "qtyMasuk" | "nominalMasuk" | "qtyKeluar" | "nominalKeluar";
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/* Konstanta & helper                                                  */
/* ------------------------------------------------------------------ */

// Satu pasang warna untuk "masuk" dan "keluar", dipakai SAMA di kartu, tabel,
// badge, dan grafik. Biru = barang masuk (pembelian), merah brand = barang
// keluar (pemakaian) -- sebelumnya keduanya merah sehingga sulit dibedakan.
const COLOR_MASUK = "#2563eb"; // blue-600
const COLOR_KELUAR = "#c50010"; // brand-600
const TEXT_MASUK = "text-blue-700";
const TEXT_KELUAR = "text-brand-700";

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const PAGE_SIZE = 25;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";
const FOCUS_DARK = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

const TH = "py-2.5 px-4 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-200 whitespace-nowrap";
const TD = "py-3 px-4";

function rupiah(n: number) {
  return (n < 0 ? "−" : "") + "Rp " + Math.abs(n).toLocaleString("id-ID");
}

function angka(n: number) {
  return n.toLocaleString("id-ID");
}

// Format singkat untuk sumbu grafik: 1,2 jt / 450 rb. Tanpa ".0" yang mubazir.
function rupiahSingkat(n: number) {
  const abs = Math.abs(n);
  const fmt = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${fmt(n / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} jt`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} rb`;
  return String(n);
}

function potong(teks: string, maks: number) {
  return teks.length > maks ? teks.slice(0, maks - 1) + "…" : teks;
}

function tanggalPendek(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(value: string, delta: number) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Ikon kecil (Phosphor, satu keluarga dengan sidebar)                 */
/* ------------------------------------------------------------------ */

function Icon({ ikon: Ikon, className = "h-4 w-4" }: { ikon: PhosphorIcon; className?: string }) {
  return <Ikon className={className} aria-hidden="true" />;
}

const IKON = {
  left: CaretLeft,
  right: CaretRight,
  download: DownloadSimple,
  printer: Printer,
  up: CaretUp,
  down: CaretDown,
  alert: Warning,
};

function SortIcon({ state }: { state: SortDir | null }) {
  const Ikon = state === "asc" ? CaretUp : state === "desc" ? CaretDown : CaretUpDown;
  return <Ikon className={`h-3 w-3 ${state ? "text-slate-700" : "text-slate-300"}`} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Komponen dasar                                                      */
/* ------------------------------------------------------------------ */

function Card({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 print:break-inside-avoid ${className}`}>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-bold text-slate-800">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium tabular-nums">
          {p.name}: {rupiah(p.value)}
        </p>
      ))}
    </div>
  );
}

// Batang kecil di dalam sel tabel: porsi sebuah angka terhadap totalnya.
function ShareBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mt-1 flex items-center justify-end gap-2" aria-label={`${pct} persen dari total`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

function Dash() {
  return <span className="text-slate-300">-</span>;
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "right",
  dot,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  dot?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md font-semibold hover:text-slate-900 ${FOCUS} ${
          active ? "text-slate-900" : ""
        }`}
      >
        {dot && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
        <SortIcon state={active ? sortDir : null} />
      </button>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* Pemilih periode                                                     */
/* ------------------------------------------------------------------ */

function PeriodSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const nowValue = currentMonthValue();
  const [nowYear, nowMonth] = nowValue.split("-").map(Number);
  const [year, mon] = month.split("-").map(Number);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = nowYear; y >= nowYear - 4; y--) list.push(y);
    if (!list.includes(year)) list.push(year);
    return list.sort((a, b) => b - a);
  }, [nowYear, year]);

  const clamp = (y: number, m: number) => {
    const v = `${y}-${String(y === nowYear ? Math.min(m, nowMonth) : m).padStart(2, "0")}`;
    return v;
  };

  const selectCls = `cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 [&>option]:text-slate-900 ${FOCUS_DARK}`;
  const stepCls = `flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10 ${FOCUS_DARK}`;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pilih periode laporan">
      <button type="button" className={stepCls} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Bulan sebelumnya">
        <Icon ikon={IKON.left} />
      </button>
      <select aria-label="Bulan" value={mon} onChange={(e) => onChange(clamp(year, Number(e.target.value)))} className={selectCls}>
        {NAMA_BULAN.map((nama, i) => (
          <option key={nama} value={i + 1} disabled={year === nowYear && i + 1 > nowMonth}>
            {nama}
          </option>
        ))}
      </select>
      <select aria-label="Tahun" value={year} onChange={(e) => onChange(clamp(Number(e.target.value), mon))} className={selectCls}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={stepCls}
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={month >= nowValue}
        aria-label="Bulan berikutnya"
      >
        <Icon ikon={IKON.right} />
      </button>
      {month !== nowValue && (
        <button
          type="button"
          onClick={() => onChange(nowValue)}
          className={`cursor-pointer rounded-md px-2 py-2 text-xs font-semibold text-brand-200 underline-offset-4 hover:text-white hover:underline ${FOCUS_DARK}`}
        >
          Bulan ini
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kartu KPI                                                           */
/* ------------------------------------------------------------------ */

// Perbandingan dengan bulan lalu. Sengaja netral (abu-abu, tanpa hijau/merah):
// pemakaian naik belum tentu buruk, dan pembelian naik belum tentu baik.
function Delta({ current, previous, prevLabel }: { current: number; previous: number; prevLabel: string }) {
  if (previous === 0) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        {current === 0 ? `Tidak ada transaksi di ${prevLabel}` : `Belum ada pembanding di ${prevLabel}`}
      </p>
    );
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) {
    return <p className="mt-2 text-xs text-slate-500">Sama dengan {prevLabel}</p>;
  }
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
      <Icon ikon={pct > 0 ? IKON.up : IKON.down} className="h-3.5 w-3.5 text-slate-600" />
      <span className="font-semibold tabular-nums text-slate-700">{Math.abs(Math.round(pct))}%</span>
      <span>dibanding {prevLabel}</span>
    </p>
  );
}

function KpiCard({
  title,
  value,
  sub,
  accent,
  children,
}: {
  title: string;
  value: string;
  sub?: string;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200/80 border-l-[3px] bg-white p-5 shadow-xs print:break-inside-avoid" style={{ borderLeftColor: accent }}>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  );
}

function SplitBar({ masuk, keluar }: { masuk: number; keluar: number }) {
  const total = masuk + keluar;
  const pctMasuk = total > 0 ? (masuk / total) * 100 : 0;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Masuk ${Math.round(pctMasuk)} persen, keluar ${Math.round(100 - pctMasuk)} persen dari total pergerakan`}>
        {total > 0 && (
          <>
            <div style={{ width: `${pctMasuk}%`, background: COLOR_MASUK }} />
            <div style={{ width: `${100 - pctMasuk}%`, background: COLOR_KELUAR }} />
          </>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>Masuk {Math.round(pctMasuk)}%</span>
        <span>Keluar {total > 0 ? Math.round(100 - pctMasuk) : 0}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab: Ringkasan                                                      */
/* ------------------------------------------------------------------ */

function TabRingkasan({ data }: { data: LaporanData }) {
  const trenKosong = data.tren.every((t) => t.nominalMasuk === 0 && t.nominalKeluar === 0);
  const totalMasuk = data.summary.totalNominalMasuk;
  const totalKeluar = data.summary.totalNominalKeluar;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          title="Tren 6 bulan terakhir"
          hint="Selalu menampilkan 6 bulan sampai periode yang dipilih."
          className="lg:col-span-3"
        >
          {trenKosong ? (
            <EmptyState title="Belum ada transaksi dalam 6 bulan ini" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.tren} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={rupiahSingkat} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="nominalMasuk" name="Amount In" stroke={COLOR_MASUK} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line
                    type="monotone"
                    dataKey="nominalKeluar"
                    name="Amount Out"
                    stroke={COLOR_KELUAR}
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Nominal per kategori" className="lg:col-span-2">
          {data.perKategori.length === 0 ? (
            <EmptyState title="Belum ada transaksi di periode ini" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.perKategori} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={rupiahSingkat} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "#475569" }}
                    stroke="#cbd5e1"
                    width={120}
                    tickFormatter={(v: string) => potong(v, 18)}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="nominalMasuk" name="Amount In" fill={COLOR_MASUK} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="nominalKeluar" name="Amount Out" fill={COLOR_KELUAR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card title="Rekap per kategori" hint="Persentase menunjukkan porsi tiap kategori terhadap total bulan ini.">
        {data.perKategori.length === 0 ? (
          <EmptyState
            title="Belum ada transaksi di periode ini"
            hint="Transaksi muncul setelah ada restock atau pesanan yang diselesaikan."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Kategori</th>
                  <th scope="col" className={`${TH} text-right`}>Qty masuk</th>
                  <th scope="col" className={`${TH} text-right`}>Nominal masuk</th>
                  <th scope="col" className={`${TH} text-right`}>Qty keluar</th>
                  <th scope="col" className={`${TH} text-right`}>Nominal keluar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {data.perKategori.map((k) => (
                  <tr key={k.kategori} className="hover:bg-slate-50/70">
                    <td className={`${TD} font-semibold text-slate-900`}>{k.label}</td>
                    <td className={`${TD} text-right tabular-nums`}>{k.qtyMasuk > 0 ? angka(k.qtyMasuk) : <Dash />}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {k.nominalMasuk > 0 ? (
                        <>
                          <span className={`font-semibold ${TEXT_MASUK}`}>{rupiah(k.nominalMasuk)}</span>
                          <ShareBar value={k.nominalMasuk} total={totalMasuk} color={COLOR_MASUK} />
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{k.qtyKeluar > 0 ? angka(k.qtyKeluar) : <Dash />}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {k.nominalKeluar > 0 ? (
                        <>
                          <span className={`font-semibold ${TEXT_KELUAR}`}>{rupiah(k.nominalKeluar)}</span>
                          <ShareBar value={k.nominalKeluar} total={totalKeluar} color={COLOR_KELUAR} />
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                  <td className={TD}>Total</td>
                  <td className={`${TD} text-right tabular-nums`}>{angka(data.summary.totalQtyMasuk)}</td>
                  <td className={`${TD} text-right tabular-nums ${TEXT_MASUK}`}>{rupiah(totalMasuk)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{angka(data.summary.totalQtyKeluar)}</td>
                  <td className={`${TD} text-right tabular-nums ${TEXT_KELUAR}`}>{rupiah(totalKeluar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab: Per barang                                                     */
/* ------------------------------------------------------------------ */

function TabBarang({ data }: { data: LaporanData }) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("semua");
  const [sortKey, setSortKey] = useState<SortKey>("nominalKeluar");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const kategoriOptions = useMemo(
    () => Array.from(new Set(data.perItem.map((it) => it.kategori))),
    [data.perItem]
  );

  const topKeluar = useMemo(
    () =>
      data.perItem
        .filter((it) => it.nominalKeluar > 0)
        .sort((a, b) => b.nominalKeluar - a.nominalKeluar)
        .slice(0, 8),
    [data.perItem]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = data.perItem.filter((it) => {
      if (kategori !== "semua" && it.kategori !== kategori) return false;
      return !needle || it.nama.toLowerCase().includes(needle);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) =>
      sortKey === "nama" ? a.nama.localeCompare(b.nama, "id") * dir : (a[sortKey] - b[sortKey]) * dir
    );
  }, [data.perItem, q, kategori, sortKey, sortDir]);

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, it) => ({
          qtyMasuk: acc.qtyMasuk + it.qtyMasuk,
          nominalMasuk: acc.nominalMasuk + it.nominalMasuk,
          qtyKeluar: acc.qtyKeluar + it.qtyKeluar,
          nominalKeluar: acc.nominalKeluar + it.nominalKeluar,
        }),
        { qtyMasuk: 0, nominalMasuk: 0, qtyKeluar: 0, nominalKeluar: 0 }
      ),
    [rows]
  );

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "nama" ? "asc" : "desc");
    }
  };

  if (data.perItem.length === 0) {
    return (
      <Card title="Per barang">
        <EmptyState
          title="Belum ada transaksi di periode ini"
          hint="Transaksi muncul setelah ada restock atau pesanan yang diselesaikan."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="8 barang dengan nominal pemakaian terbesar" hint="Diurutkan berdasarkan nominal keluar, bukan jumlah unit.">
        {topKeluar.length === 0 ? (
          <EmptyState title="Belum ada barang keluar di periode ini" hint="Periode ini hanya berisi restock." />
        ) : (
          <div style={{ height: Math.max(180, topKeluar.length * 40 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topKeluar} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={rupiahSingkat} />
                <YAxis
                  type="category"
                  dataKey="nama"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  stroke="#cbd5e1"
                  width={170}
                  tickFormatter={(v: string) => potong(v, 26)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="nominalKeluar" name="Amount Out" fill={COLOR_KELUAR} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card
        title="Amount In / Out per barang"
        hint="Klik judul kolom untuk mengurutkan. Jika harga barang berubah di tengah bulan, tombol Harga berubah menampilkan rincian per harga."
        actions={
          <>
            <select
              aria-label="Filter kategori"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              className={`cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 ${FOCUS}`}
            >
              <option value="semua">Semua kategori</option>
              {kategoriOptions.map((k) => (
                <option key={k} value={k}>
                  {getKategoriLabel(k)}
                </option>
              ))}
            </select>
            <input
              type="search"
              aria-label="Cari barang"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama barang"
              className={`w-48 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 ${FOCUS}`}
            />
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="Tidak ada barang yang cocok" hint="Ubah kata kunci atau pilih Semua kategori." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr>
                  <SortTh label="Barang" k="nama" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="left" />
                  <th scope="col" className={`${TH} text-right`}>Harga satuan</th>
                  <SortTh label="Qty masuk" k="qtyMasuk" sortKey={sortKey} sortDir={sortDir} onSort={onSort} dot={COLOR_MASUK} />
                  <SortTh label="Nominal masuk" k="nominalMasuk" sortKey={sortKey} sortDir={sortDir} onSort={onSort} dot={COLOR_MASUK} />
                  <SortTh label="Qty keluar" k="qtyKeluar" sortKey={sortKey} sortDir={sortDir} onSort={onSort} dot={COLOR_KELUAR} />
                  <SortTh label="Nominal keluar" k="nominalKeluar" sortKey={sortKey} sortDir={sortDir} onSort={onSort} dot={COLOR_KELUAR} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rows.map((it) => {
                  const berubah = it.hargaMin !== it.hargaMax;
                  const terbuka = expandedId === it.itemId;
                  return (
                    <Fragment key={it.itemId}>
                      <tr className="hover:bg-slate-50/70">
                        <td className={TD}>
                          <div className="font-semibold text-slate-900">{it.nama}</div>
                          <div className="text-xs text-slate-500">{getKategoriLabel(it.kategori)}</div>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {berubah ? (
                            <div className="flex flex-col items-end gap-1">
                              <span>
                                {rupiah(it.hargaMin)} - {rupiah(it.hargaMax)}
                              </span>
                              <button
                                type="button"
                                aria-expanded={terbuka}
                                onClick={() => setExpandedId(terbuka ? null : it.itemId)}
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 print:hidden ${FOCUS}`}
                              >
                                Harga berubah
                                <Icon ikon={terbuka ? IKON.up : IKON.down} className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            rupiah(it.hargaMin)
                          )}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {it.qtyMasuk > 0 ? `${angka(it.qtyMasuk)} ${it.satuan}` : <Dash />}
                        </td>
                        <td className={`${TD} text-right font-semibold tabular-nums ${TEXT_MASUK}`}>
                          {it.nominalMasuk > 0 ? rupiah(it.nominalMasuk) : <Dash />}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {it.qtyKeluar > 0 ? `${angka(it.qtyKeluar)} ${it.satuan}` : <Dash />}
                        </td>
                        <td className={`${TD} text-right font-semibold tabular-nums ${TEXT_KELUAR}`}>
                          {it.nominalKeluar > 0 ? rupiah(it.nominalKeluar) : <Dash />}
                        </td>
                      </tr>
                      {terbuka && (
                        <tr>
                          <td colSpan={6} className="bg-amber-50/60 px-4 py-3">
                            <p className="mb-2 text-xs font-semibold text-amber-900">Rincian per harga: {it.nama}</p>
                            <table className="w-full text-xs">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-semibold">Harga</th>
                                  <th className="px-2 py-1.5 text-right font-semibold">Qty masuk</th>
                                  <th className="px-2 py-1.5 text-right font-semibold">Nominal masuk</th>
                                  <th className="px-2 py-1.5 text-right font-semibold">Qty keluar</th>
                                  <th className="px-2 py-1.5 text-right font-semibold">Nominal keluar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {it.breakdown.map((b) => (
                                  <tr key={b.harga} className="border-t border-amber-100 tabular-nums">
                                    <td className="px-2 py-1.5 font-semibold text-slate-800">{rupiah(b.harga)}</td>
                                    <td className="px-2 py-1.5 text-right">{b.qtyMasuk > 0 ? `${angka(b.qtyMasuk)} ${it.satuan}` : <Dash />}</td>
                                    <td className={`px-2 py-1.5 text-right ${TEXT_MASUK}`}>{b.qtyMasuk > 0 ? rupiah(b.nominalMasuk) : <Dash />}</td>
                                    <td className="px-2 py-1.5 text-right">{b.qtyKeluar > 0 ? `${angka(b.qtyKeluar)} ${it.satuan}` : <Dash />}</td>
                                    <td className={`px-2 py-1.5 text-right ${TEXT_KELUAR}`}>{b.qtyKeluar > 0 ? rupiah(b.nominalKeluar) : <Dash />}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                  <td className={TD}>
                    Total ({rows.length} barang{rows.length !== data.perItem.length ? `, dari ${data.perItem.length}` : ""})
                  </td>
                  <td className={TD} />
                  <td className={`${TD} text-right tabular-nums`}>{angka(total.qtyMasuk)}</td>
                  <td className={`${TD} text-right tabular-nums ${TEXT_MASUK}`}>{rupiah(total.nominalMasuk)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{angka(total.qtyKeluar)}</td>
                  <td className={`${TD} text-right tabular-nums ${TEXT_KELUAR}`}>{rupiah(total.nominalKeluar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab: Per departemen                                                 */
/* ------------------------------------------------------------------ */

function TabDepartemen({ data }: { data: LaporanData }) {
  const totalKeluar = data.summary.totalNominalKeluar;
  const topDept = data.perDepartemen.slice(0, 10);
  const totalQty = data.perDepartemen.reduce((s, d) => s + d.qtyKeluar, 0);
  const totalNominal = data.perDepartemen.reduce((s, d) => s + d.nominalKeluar, 0);

  if (data.perDepartemen.length === 0) {
    return (
      <Card title="Pemakaian per departemen">
        <EmptyState
          title="Belum ada pemakaian di periode ini"
          hint="Data departemen hanya berasal dari pesanan yang sudah diselesaikan."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="Pemakaian per departemen"
        hint={
          data.perDepartemen.length > 10
            ? "Grafik menampilkan 10 departemen terbesar. Tabel di bawah memuat semuanya."
            : "Hanya transaksi keluar. Restock tidak terikat departemen tertentu."
        }
      >
        <div style={{ height: Math.max(200, topDept.length * 44 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topDept} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={rupiahSingkat} />
              <YAxis
                type="category"
                dataKey="departemen"
                tick={{ fontSize: 12, fill: "#475569" }}
                stroke="#cbd5e1"
                width={150}
                tickFormatter={(v: string) => potong(v, 22)}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="nominalKeluar" name="Amount Out" fill={COLOR_KELUAR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Rekap per departemen">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>Departemen</th>
                <th scope="col" className={`${TH} text-right`}>Qty diambil</th>
                <th scope="col" className={`${TH} text-right`}>Nominal keluar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.perDepartemen.map((d) => (
                <tr key={d.departemen} className="hover:bg-slate-50/70">
                  <td className={`${TD} font-semibold text-slate-900`}>{d.departemen}</td>
                  <td className={`${TD} text-right tabular-nums`}>{angka(d.qtyKeluar)} unit</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    <span className={`font-semibold ${TEXT_KELUAR}`}>{rupiah(d.nominalKeluar)}</span>
                    <ShareBar value={d.nominalKeluar} total={totalKeluar} color={COLOR_KELUAR} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                <td className={TD}>Total</td>
                <td className={`${TD} text-right tabular-nums`}>{angka(totalQty)} unit</td>
                <td className={`${TD} text-right tabular-nums ${TEXT_KELUAR}`}>{rupiah(totalNominal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab: Transaksi                                                      */
/* ------------------------------------------------------------------ */

function TabTransaksi({ data, showAll }: { data: LaporanData; showAll: boolean }) {
  const [tipe, setTipe] = useState<"semua" | "masuk" | "keluar">("semua");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.detailTransaksi.filter((row) => {
      if (tipe !== "semua" && row.tipe !== tipe) return false;
      if (!needle) return true;
      return (
        row.itemNama.toLowerCase().includes(needle) ||
        (row.noPengajuan?.toLowerCase().includes(needle) ?? false) ||
        (row.departemen?.toLowerCase().includes(needle) ?? false) ||
        (row.pemohon?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [data.detailTransaksi, tipe, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const from = (current - 1) * PAGE_SIZE;
  const rows = showAll ? filtered : filtered.slice(from, from + PAGE_SIZE);

  const sumMasuk = filtered.filter((r) => r.tipe === "masuk").reduce((s, r) => s + r.nominal, 0);
  const sumKeluar = filtered.filter((r) => r.tipe === "keluar").reduce((s, r) => s + r.nominal, 0);

  const segCls = (aktif: boolean) =>
    `cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${FOCUS} ${
      aktif ? "bg-white text-brand-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
    }`;

  return (
    <Card
      title="Detail transaksi"
      hint="Setiap pergerakan stok pada periode ini. Pengajuan dan pemohon hanya terisi untuk barang keluar."
      actions={
        <>
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Filter tipe transaksi">
            {(["semua", "masuk", "keluar"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tipe === t}
                onClick={() => {
                  setTipe(t);
                  setPage(1);
                }}
                className={segCls(tipe === t)}
              >
                {t === "semua" ? "Semua" : t === "masuk" ? "Masuk" : "Keluar"}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Cari transaksi"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari barang, pengajuan, departemen, pemohon"
            className={`w-72 max-w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 ${FOCUS}`}
          />
        </>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          title={data.detailTransaksi.length === 0 ? "Belum ada transaksi di periode ini" : "Tidak ada transaksi yang cocok"}
          hint={data.detailTransaksi.length === 0 ? "Transaksi muncul setelah ada restock atau pesanan yang diselesaikan." : "Ubah kata kunci atau pilih tipe Semua."}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Tanggal</th>
                  <th scope="col" className={TH}>Tipe</th>
                  <th scope="col" className={TH}>Barang</th>
                  <th scope="col" className={`${TH} text-right`}>Qty</th>
                  <th scope="col" className={`${TH} text-right`}>Harga</th>
                  <th scope="col" className={`${TH} text-right`}>Nominal</th>
                  <th scope="col" className={TH}>No. pengajuan</th>
                  <th scope="col" className={TH}>Departemen</th>
                  <th scope="col" className={TH}>Pemohon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className={`${TD} whitespace-nowrap text-slate-500`}>{tanggalPendek(row.tanggal)}</td>
                    <td className={TD}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          row.tipe === "masuk"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-brand-200 bg-brand-50 text-brand-700"
                        }`}
                      >
                        {row.tipe === "masuk" ? "Masuk" : "Keluar"}
                      </span>
                    </td>
                    <td className={`${TD} font-semibold text-slate-900`}>{row.itemNama}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {angka(row.qty)} {row.satuan}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-slate-500`}>{rupiah(row.harga)}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums ${row.tipe === "masuk" ? TEXT_MASUK : TEXT_KELUAR}`}>
                      {rupiah(row.nominal)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-slate-500`}>{row.noPengajuan ?? <Dash />}</td>
                    <td className={`${TD} text-slate-500`}>{row.departemen ?? <Dash />}</td>
                    <td className={`${TD} text-slate-500`}>{row.pemohon ?? <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <p>
                {showAll
                  ? `${angka(filtered.length)} transaksi`
                  : `Menampilkan ${angka(from + 1)}-${angka(Math.min(from + PAGE_SIZE, filtered.length))} dari ${angka(filtered.length)} transaksi`}
              </p>
              <p className="text-xs text-slate-500">
                Total hasil ini:{" "}
                <span className={`font-semibold tabular-nums ${TEXT_MASUK}`}>masuk {rupiah(sumMasuk)}</span>
                {", "}
                <span className={`font-semibold tabular-nums ${TEXT_KELUAR}`}>keluar {rupiah(sumKeluar)}</span>
              </p>
            </div>
            {!showAll && totalPages > 1 && (
              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setPage(current - 1)}
                  disabled={current <= 1}
                  className={`cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
                >
                  Sebelumnya
                </button>
                <span className="px-1 text-xs tabular-nums text-slate-500">
                  Halaman {current} dari {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(current + 1)}
                  disabled={current >= totalPages}
                  className={`cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
                >
                  Berikutnya
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton & error                                                    */
/* ------------------------------------------------------------------ */

function LaporanSkeleton() {
  const pulse = "animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none";
  return (
    <div className="space-y-4" role="status" aria-label="Memuat laporan">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${pulse} h-32`} />
        ))}
      </div>
      <div className={`${pulse} h-10 w-full max-w-md`} />
      <div className={`${pulse} h-80`} />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-6 py-10 text-center" role="alert">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-rose-700 shadow-xs">
        <Icon ikon={IKON.alert} className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-rose-900">Laporan tidak bisa dimuat</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-rose-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-4 cursor-pointer rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 ${FOCUS}`}
      >
        Coba lagi
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

interface FetchResult {
  key: string;
  data: LaporanData | null;
  error: string | null;
}

export default function LaporanPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<FetchResult>({ key: "", data: null, error: null });
  const [tab, setTab] = useState<TabId>("ringkasan");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [printedAt, setPrintedAt] = useState("");

  // "Loading" diturunkan dari key permintaan, bukan di-set manual di dalam
  // effect: selama key hasil belum sama dengan key permintaan terbaru, data
  // lama (kalau ada) tetap tampil redup -- layar tidak berkedip tiap ganti bulan.
  const requestKey = `${month}#${reloadKey}`;
  const loading = result.key !== requestKey;
  const data = result.data;

  useEffect(() => {
    // Batalkan permintaan lama kalau periode berganti sebelum respons datang,
    // supaya respons lambat tidak menimpa data periode yang baru dipilih.
    const controller = new AbortController();
    fetch(`/api/laporan?month=${month}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Server mengembalikan status ${res.status}.`);
        }
        setResult({ key: requestKey, data: json as LaporanData, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          data: null,
          error: err instanceof Error ? err.message : "Koneksi ke server gagal. Periksa jaringan lalu coba lagi.",
        });
      });
    return () => controller.abort();
  }, [month, requestKey]);

  useEffect(() => {
    const selesai = () => setPrintAll(false);
    window.addEventListener("afterprint", selesai);
    return () => window.removeEventListener("afterprint", selesai);
  }, []);

  const handlePrint = () => {
    // Saat dicetak, semua tab dirender sekaligus supaya laporan tercetak utuh,
    // bukan hanya tab yang sedang terbuka.
    setPrintedAt(new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }));
    setPrintAll(true);
    setTimeout(() => window.print(), 600);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/laporan/export?month=${month}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Server mengembalikan status ${res.status}.`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match?.[1] ?? `laporan-stationery-${month}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Gagal mengunduh file Excel.");
    } finally {
      setExporting(false);
    }
  };

  const prev = data && data.tren.length >= 2 ? data.tren[data.tren.length - 2] : null;
  const net = data ? data.summary.totalNominalMasuk - data.summary.totalNominalKeluar : 0;
  const prevNet = prev ? prev.nominalMasuk - prev.nominalKeluar : 0;
  const jumlahMasuk = data ? data.detailTransaksi.filter((r) => r.tipe === "masuk").length : 0;
  const jumlahKeluar = data ? data.detailTransaksi.length - jumlahMasuk : 0;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "ringkasan", label: "Ringkasan" },
    { id: "barang", label: "Per barang", count: data?.perItem.length },
    { id: "departemen", label: "Per departemen", count: data?.perDepartemen.length },
    { id: "transaksi", label: "Transaksi", count: data?.detailTransaksi.length },
  ];

  const tampil = (id: TabId) => printAll || tab === id;

  const aksiCls = `inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70 ${FOCUS_DARK}`;

  return (
    <div className="space-y-5">
      {/* Kop khusus cetak */}
      <div className="hidden border-b-2 border-slate-900 pb-3 print:block">
        <h1 className="text-xl font-bold text-slate-900">Laporan Amount In / Out Stationery</h1>
        <p className="mt-1 text-sm text-slate-700">
          Periode {data?.periode.label ?? month} &nbsp;|&nbsp; PT Jatim Autocomp Indonesia &nbsp;|&nbsp; Dicetak {printedAt}
        </p>
      </div>

      {/* Banner */}
      <div className="flex flex-col gap-5 rounded-lg border-l-4 border-brand-600 bg-slate-900 p-6 text-white shadow-xs print:hidden lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Amount In / Out</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            Pembelian (restock) dan pemakaian barang stationery per bulan, lengkap dengan nominal.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <PeriodSwitcher month={month} onChange={setMonth} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className={`${aksiCls} bg-white text-brand-900 hover:bg-brand-50`}
            >
              <Icon ikon={IKON.download} />
              {exporting ? "Menyiapkan file..." : "Unduh Excel"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!data || loading}
              className={`${aksiCls} border border-white/20 bg-white/10 text-white hover:bg-white/20`}
            >
              <Icon ikon={IKON.printer} />
              Cetak
            </button>
          </div>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 print:hidden"
        >
          <p>
            <span className="font-bold">File Excel gagal diunduh.</span> {exportError}
          </p>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className={`shrink-0 cursor-pointer rounded-md text-xs font-semibold text-rose-800 underline underline-offset-2 ${FOCUS}`}
          >
            Tutup
          </button>
        </div>
      )}

      {!data && loading ? (
        <LaporanSkeleton />
      ) : !data ? (
        <ErrorState message={result.error ?? "Terjadi kesalahan yang tidak diketahui."} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <div
          aria-busy={loading}
          className={`space-y-5 transition-opacity motion-reduce:transition-none ${loading ? "pointer-events-none opacity-50" : ""}`}
        >
          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Amount In (restock)"
              value={rupiah(data.summary.totalNominalMasuk)}
              sub={`${angka(data.summary.totalQtyMasuk)} unit masuk`}
              accent={COLOR_MASUK}
            >
              {prev && <Delta current={data.summary.totalNominalMasuk} previous={prev.nominalMasuk} prevLabel={prev.label} />}
            </KpiCard>

            <KpiCard
              title="Amount Out (pemakaian)"
              value={rupiah(data.summary.totalNominalKeluar)}
              sub={`${angka(data.summary.totalQtyKeluar)} unit keluar`}
              accent={COLOR_KELUAR}
            >
              {prev && <Delta current={data.summary.totalNominalKeluar} previous={prev.nominalKeluar} prevLabel={prev.label} />}
            </KpiCard>

            <KpiCard
              title="Selisih (In − Out)"
              value={rupiah(net)}
              sub={
                data.summary.totalNominalMasuk === 0 && data.summary.totalNominalKeluar === 0
                  ? "Belum ada transaksi"
                  : net >= 0
                  ? "Pembelian lebih besar dari pemakaian"
                  : "Pemakaian lebih besar dari pembelian"
              }
              accent="#0f172a"
            >
              <SplitBar masuk={data.summary.totalNominalMasuk} keluar={data.summary.totalNominalKeluar} />
              {prev && <Delta current={net} previous={prevNet} prevLabel={prev.label} />}
            </KpiCard>

            <KpiCard
              title="Jumlah transaksi"
              value={angka(data.detailTransaksi.length)}
              sub={`${angka(jumlahMasuk)} restock, ${angka(jumlahKeluar)} pemakaian`}
              accent="#94a3b8"
            />
          </div>

          {/* Tab */}
          <div role="tablist" aria-label="Bagian laporan" className="flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
            {tabs.map((t) => {
              const aktif = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={aktif}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px flex shrink-0 cursor-pointer items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${FOCUS} ${
                    aktif
                      ? "border-brand-600 text-slate-900"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        aktif ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {angka(t.count)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel. key={periode} mereset filter/urutan/halaman tiap ganti bulan. */}
          <div className="space-y-5">
            {tampil("ringkasan") && (
              <div role="tabpanel" id="panel-ringkasan" aria-labelledby="tab-ringkasan">
                <TabRingkasan key={data.periode.label} data={data} />
              </div>
            )}
            {tampil("barang") && (
              <div role="tabpanel" id="panel-barang" aria-labelledby="tab-barang">
                <TabBarang key={data.periode.label} data={data} />
              </div>
            )}
            {tampil("departemen") && (
              <div role="tabpanel" id="panel-departemen" aria-labelledby="tab-departemen">
                <TabDepartemen key={data.periode.label} data={data} />
              </div>
            )}
            {tampil("transaksi") && (
              <div role="tabpanel" id="panel-transaksi" aria-labelledby="tab-transaksi">
                <TabTransaksi key={data.periode.label} data={data} showAll={printAll} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
