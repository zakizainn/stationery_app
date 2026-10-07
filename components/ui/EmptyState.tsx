import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";

interface EmptyStateProps {
  icon: Icon;
  judul: string;
  deskripsi?: string;
  aksi?: { label: string; href: string };
}

// Satu bentuk "kosong" untuk seluruh aplikasi: ikon, judul, penjelasan singkat,
// dan (kalau ada) satu langkah berikutnya.
export function EmptyState({ icon: Ikon, judul, deskripsi, aksi }: EmptyStateProps) {
  return (
    <div className="py-16 px-6 text-center bg-white rounded-md border border-dashed border-slate-300">
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
        <Ikon size={24} aria-hidden="true" />
      </div>
      <h3 className="font-bold text-slate-800 text-sm">{judul}</h3>
      {deskripsi && <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">{deskripsi}</p>}
      {aksi && (
        <Link
          href={aksi.href}
          className="inline-block mt-4 bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white font-bold text-xs px-5 py-2.5 rounded-md shadow-xs transition-all"
        >
          {aksi.label}
        </Link>
      )}
    </div>
  );
}
