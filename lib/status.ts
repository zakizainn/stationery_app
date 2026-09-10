export interface StatusBadge {
  label: string;
  style: string;
}

interface ApprovalLike {
  level: number;
  status: "pending" | "approved" | "rejected" | string;
}

interface RequestLike {
  status: string;
  tipe: string;
  approvals?: ApprovalLike[];
}

// Satu sumber kebenaran untuk label status pengajuan, dipakai di Riwayat &
// Beranda staf (dan bisa dipakai ulang di halaman lain yang menampilkan
// status pengajuan).
//
// Kenapa perlu logic khusus, bukan cuma map 1:1 dari field `status`:
// - Order Baru punya 2 tahap approval (level 1 = Atasan Departemen, level 2 =
//   Superadmin), tapi field `Request.status` di database TETAP "pending"
//   sepanjang kedua tahap itu -- baru berubah jadi "approved" setelah level 2
//   selesai. Kalau ditampilkan mentah, staf tidak bisa tahu pengajuannya
//   sudah lolos atasan & sedang menunggu superadmin, atau masih di atasan.
//   Fungsi ini membaca array `approvals` untuk menampilkan tahap yang benar.
// - Order Rutin tidak melalui approval siapa pun -- status "approved" di
//   sana cuma berarti "masuk antrean Admin Stationery", beda arti dengan
//   "approved" pada Order Baru (artinya lolos kedua approval).
// - Saat ditolak, kita tunjukkan di level mana ditolaknya (Atasan Departemen
//   atau Superadmin) supaya jelas siapa yang menolak & catatan siapa yang
//   relevan untuk dibaca.
export function getStatusBadge(request: RequestLike): StatusBadge {
  const { status, tipe } = request;
  const approvals = request.approvals ?? [];
  const level1 = approvals.find((a) => a.level === 1);
  const level2 = approvals.find((a) => a.level === 2);

  if (tipe === "rutin") {
    if (status === "approved") {
      return { label: "Menunggu Diproses Admin", style: "bg-blue-50 text-blue-700 border-blue-200" };
    }
  } else {
    // order_baru
    if (status === "pending") {
      if (!level1 || level1.status === "pending") {
        return {
          label: "Menunggu Approval Atasan Departemen",
          style: "bg-amber-50 text-amber-700 border-amber-200",
        };
      }
      if (level1.status === "approved" && (!level2 || level2.status === "pending")) {
        return {
          label: "Menunggu Approval Superadmin",
          style: "bg-amber-50 text-amber-700 border-amber-200",
        };
      }
    }

    if (status === "rejected") {
      const rejectedAt = approvals.find((a) => a.status === "rejected");
      if (rejectedAt?.level === 1) {
        return { label: "Ditolak Atasan Departemen", style: "bg-rose-50 text-rose-700 border-rose-200" };
      }
      if (rejectedAt?.level === 2) {
        return { label: "Ditolak Superadmin", style: "bg-rose-50 text-rose-700 border-rose-200" };
      }
    }

    if (status === "approved") {
      return {
        label: "Disetujui — Siap Diproses Admin",
        style: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
  }

  const FALLBACK: Record<string, StatusBadge> = {
    pending: { label: "Menunggu Approval", style: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "Disetujui", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "Ditolak", style: "bg-rose-50 text-rose-700 border-rose-200" },
    diproses: { label: "Sedang Diproses", style: "bg-blue-50 text-blue-700 border-blue-200" },
    selesai: { label: "Selesai / Diambil", style: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  return FALLBACK[status] || { label: status, style: "bg-slate-100 text-slate-700 border-slate-200" };
}
