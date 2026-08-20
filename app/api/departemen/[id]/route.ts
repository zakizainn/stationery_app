import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const deptId = parseInt(id);

    const body = await req.json();
    const { kode, nama } = body;

    const updatedDept = await db.departemen.update({
      where: { id: deptId },
      data: {
        ...(kode && { kode }),
        ...(nama && { nama }),
      },
    });

    return NextResponse.json({ success: true, data: updatedDept });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update departemen";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const deptId = parseInt(id);

    await db.departemen.delete({ where: { id: deptId } });

    return NextResponse.json({ success: true, message: "Departemen berhasil dihapus." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete departemen";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
