import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

const ALLOWED_ROLES = ["admin_stationery", "superadmin"];

function normalizeKategori(raw: unknown): "barang_umum" | "kertas" | "checksheet" | "catridge_toner_tinta" | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["barang_umum", "atk", "umum"].includes(s)) return "barang_umum";
  if (["kertas", "paper", "paper_other", "paper_&_other"].includes(s)) return "kertas";
  if (["checksheet", "check_sheet"].includes(s)) return "checksheet";
  if (["catridge_toner_tinta", "catridge", "toner", "tinta", "catridge#toner#tinta"].includes(s))
    return "catridge_toner_tinta";
  return null;
}

function normalizeBoolean(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return ["ya", "yes", "true", "1", "y"].includes(s);
}

// GET: unduh Excel berisi seluruh item yang sudah ada di database (siap diisi
// STOK_MASUK untuk restock massal, atau field lain untuk update massal).
// Kalau database masih kosong, unduh template kosong dengan 3 baris contoh.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const headers = [
    "NAMA",
    "KATEGORI",
    "SATUAN",
    "STOK_MASUK",
    "STOK_MINIMUM",
    "HARGA",
    "JENIS_KERTAS",
    "BISA_DITUKAR",
  ];

  const KATEGORI_LABEL: Record<string, string> = {
    barang_umum: "ATK",
    kertas: "Kertas & Lainnya",
    checksheet: "Checksheet",
    catridge_toner_tinta: "Catridge/Toner/Tinta",
  };

  const existingItems = await db.item.findMany({ orderBy: { nama: "asc" } });

  const rows =
    existingItems.length > 0
      ? existingItems.map((it) => [
          it.nama,
          KATEGORI_LABEL[it.kategori] ?? it.kategori,
          it.satuan,
          0, // STOK_MASUK sengaja dikosongkan (0) -- admin tinggal isi qty restock, bukan stok total
          it.stokMinimum,
          it.harga,
          it.jenisKertas ?? "",
          it.bisaDitukar ? "Ya" : "Tidak",
        ])
      : [
          ["Pulpen Hitam", "Barang Umum", "pcs", 20, 10, 3500, "", "Ya"],
          ["Kertas HVS A4", "Kertas", "rim", 5, 5, 45000, "A4", "Tidak"],
          ["Checksheet QC", "Checksheet", "lembar", 50, 20, 6000, "", "Tidak"],
        ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, existingItems.length > 0 ? "Data Item" : "Import Item");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = existingItems.length > 0 ? "data-item-stationery.xlsx" : "template-import-item.xlsx";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// POST: proses file Excel yang diupload admin.
// - Item dengan NAMA yang sudah ada (case-insensitive): STOK_MASUK ditambahkan
//   ke stok saat ini (restock) + dicatat di stock_movement; field lain
//   (kategori/satuan/stokMinimum/jenisKertas/bisaDitukar) hanya di-update
//   kalau kolomnya diisi di Excel.
// - Item baru: dibuat dengan stok awal = STOK_MASUK (boleh 0), field lain wajib.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "File Excel tidak ditemukan." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "File Excel kosong atau format tidak sesuai." }, { status: 400 });
    }

    let created = 0;
    let restocked = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2: baris 1 = header di Excel
      const nama = String(row["NAMA"] ?? "").trim();

      if (!nama) {
        errors.push(`Baris ${rowNum}: NAMA kosong, dilewati.`);
        continue;
      }

      const stokMasuk = Number(row["STOK_MASUK"]) || 0;
      const existing = await db.item.findFirst({
        where: { nama: { equals: nama, mode: "insensitive" } },
      });

      if (existing) {
        const updateData: Record<string, unknown> = {};
        const kategori = normalizeKategori(row["KATEGORI"]);
        if (kategori) updateData.kategori = kategori;
        if (String(row["SATUAN"] ?? "").trim()) updateData.satuan = String(row["SATUAN"]).trim();
        if (row["STOK_MINIMUM"] !== "" && row["STOK_MINIMUM"] != null) {
          updateData.stokMinimum = Number(row["STOK_MINIMUM"]) || 0;
        }
        if (String(row["JENIS_KERTAS"] ?? "").trim()) updateData.jenisKertas = String(row["JENIS_KERTAS"]).trim();
        if (String(row["BISA_DITUKAR"] ?? "").trim()) updateData.bisaDitukar = normalizeBoolean(row["BISA_DITUKAR"]);
        if (row["HARGA"] !== "" && row["HARGA"] != null) updateData.harga = Number(row["HARGA"]) || 0;
        if (stokMasuk > 0) updateData.stok = { increment: stokMasuk };

        await db.item.update({ where: { id: existing.id }, data: updateData });

        // Catat ke audit log kalau baris ini benar-benar mengubah harga item.
        if (updateData.harga !== undefined && updateData.harga !== existing.harga) {
          await db.hargaHistory.create({
            data: {
              itemId: existing.id,
              hargaLama: existing.harga,
              hargaBaru: updateData.harga as number,
              diubahOlehId: parseInt(session.user.id),
            },
          });
        }

        if (stokMasuk > 0) {
          const hargaSnapshot =
            row["HARGA"] !== "" && row["HARGA"] != null ? Number(row["HARGA"]) || 0 : existing.harga;
          await db.stockMovement.create({
            data: { itemId: existing.id, tipe: "masuk", qty: stokMasuk, hargaSaatTransaksi: hargaSnapshot },
          });
          restocked++;
        }
      } else {
        const kategori = normalizeKategori(row["KATEGORI"]);
        const satuan = String(row["SATUAN"] ?? "").trim();
        if (!kategori || !satuan) {
          errors.push(`Baris ${rowNum} ("${nama}"): item baru wajib isi KATEGORI dan SATUAN yang valid.`);
          continue;
        }
        const hargaBaru = Number(row["HARGA"]) || 0;
        const newItem = await db.item.create({
          data: {
            nama,
            kategori,
            satuan,
            stok: stokMasuk,
            stokMinimum: Number(row["STOK_MINIMUM"]) || 0,
            harga: hargaBaru,
            jenisKertas: kategori === "kertas" ? String(row["JENIS_KERTAS"] ?? "").trim() || null : null,
            bisaDitukar: normalizeBoolean(row["BISA_DITUKAR"]),
          },
        });
        if (stokMasuk > 0) {
          await db.stockMovement.create({
            data: { itemId: newItem.id, tipe: "masuk", qty: stokMasuk, hargaSaatTransaksi: hargaBaru },
          });
        }
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: { totalRows: rows.length, created, restocked, errorCount: errors.length },
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memproses file Excel";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
