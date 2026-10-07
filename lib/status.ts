export interface StatusBadge {
  label: string;
  style: string;
}

// Satu-satunya tempat warna status didefinisikan. Merah brand sengaja TIDAK
// dipakai untuk status (merah brand = aksi utama & menu aktif), supaya
// "tersedia/disetujui" tidak terbaca mirip "ditolak/habis". Ungu dihapus:
// "selesai" memakai netral karena itu keadaan akhir, bukan peringatan.
export const STATUS_TONE = {
  menunggu: "bg-amber-50 text-amber-800 border-amber-200",
  proses: "bg-blue-50 text-blue-800 border-blue-200",
  sukses: "bg-emerald-50 text-emerald-800 border-emerald-200",
  bahaya: "bg-rose-50 text-rose-800 border-rose-200",
  selesai: "bg-slate-100 text-slate-700 border-slate-300",
  netral: "bg-slate-100 text-slate-700 border-slate-200",
} as const;

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
      return { label: "Menunggu Diproses Admin", style: STATUS_TONE.proses };
    }
  } else {
    // order_baru
    if (status === "pending") {
      if (!level1 || level1.status === "pending") {
        return {
          label: "Menunggu Approval Atasan Departemen",
          style: STATUS_TONE.menunggu,
        };
      }
      if (level1.status === "approved" && (!level2 || level2.status === "pending")) {
        return {
          label: "Menunggu Approval Superadmin",
          style: STATUS_TONE.menunggu,
        };
      }
    }

    if (status === "rejected") {
      const rejectedAt = approvals.find((a) => a.status === "rejected");
      if (rejectedAt?.level === 1) {
        return { label: "Ditolak Atasan Departemen", style: STATUS_TONE.bahaya };
      }
      if (rejectedAt?.level === 2) {
        return { label: "Ditolak Superadmin", style: STATUS_TONE.bahaya };
      }
    }

    if (status === "approved") {
      return {
        label: "Disetujui, Siap Diproses Admin",
        style: STATUS_TONE.sukses,
      };
    }
  }

  const FALLBACK: Record<string, StatusBadge> = {
    pending: { label: "Menunggu Approval", style: STATUS_TONE.menunggu },
    approved: { label: "Disetujui", style: STATUS_TONE.sukses },
    rejected: { label: "Ditolak", style: STATUS_TONE.bahaya },
    diproses: { label: "Sedang Diproses", style: STATUS_TONE.proses },
    selesai: { label: "Selesai / Diambil", style: STATUS_TONE.selesai },
  };

  return FALLBACK[status] || { label: status, style: STATUS_TONE.netral };
}
