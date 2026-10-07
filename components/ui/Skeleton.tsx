// Placeholder loading yang meniru bentuk konten asli, menggantikan teks
// "Memuat data...". Animasi pulse dimatikan untuk pengguna yang memilih
// "kurangi gerakan".

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-slate-200/70 animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

// Pembungkus agar pembaca layar tahu bagian ini sedang dimuat.
export function LoadingRegion({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// Baris tabel/daftar generik untuk halaman admin (kolom pertama pendek, kolom
// terakhir pendek, kolom tengah mengisi sisa lebar).
export function TableSkeleton({
  label,
  rows = 5,
  cols = 5,
}: {
  label: string;
  rows?: number;
  cols?: number;
}) {
  return (
    <LoadingRegion label={label} className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 ${c === 0 ? "w-24" : c === cols - 1 ? "w-20" : "flex-1"}`}
            />
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}
