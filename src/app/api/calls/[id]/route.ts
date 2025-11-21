import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  const { id } = await params;
  const callId = id;

  try {
    const call = await db.call.findFirst({
      where: {
        id: callId,
        companyId,
      },
    });

    if (!call) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json({ ok: true, call });
  } catch (err: any) {
    console.error("[API] /api/calls/[id] error", err);
    return new NextResponse(
      err?.message ? `Failed to load call: ${err.message}` : "Failed to load call",
      { status: 500 }
    );
  }
}
