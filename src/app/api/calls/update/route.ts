import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthWithCompany } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await requireAuthWithCompany();
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return new NextResponse("Invalid body", { status: 400 });
    }

    const payload: any = (body as any).call ?? body;

    const id = payload.id as string | undefined;
    if (!id) {
      return new NextResponse("Missing call id", { status: 400 });
    }

    const existing = await db.call.findUnique({
      where: { id },
    });

    if (!existing || existing.companyId !== companyId) {
      return new NextResponse("Not found", { status: 404 });
    }

    const updateData: any = {};

    if (typeof payload.duration === "number") {
      updateData.duration = payload.duration;
    }
    if (typeof payload.audioUrl === "string") {
      updateData.audioUrl = payload.audioUrl;
    }
    if (typeof payload.status === "string") {
      updateData.status = payload.status;
    }
    if (payload.meta && typeof payload.meta === "object") {
      updateData.meta = payload.meta;
    }

    if (Object.keys(updateData).length === 0) {
      return new NextResponse("Nothing to update", { status: 400 });
    }

    const call = await db.call.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, call });
  } catch (err: any) {
    const msg = String(err?.message || err);

    if (msg.startsWith("Unauthorized")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (msg.includes("No companyId in session")) {
      return new NextResponse("No companyId in session", { status: 400 });
    }

    console.error("[API] /api/calls/update error", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
