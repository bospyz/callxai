import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { retrySingleCall } from "@/lib/workers/retry-queue";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = (session.user as any).companyId as string | undefined;
  if (!companyId) {
    return new NextResponse("No companyId in session", { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const callId = body?.callId as string | undefined;
  if (!callId) {
    return new NextResponse('Field "callId" is required', { status: 400 });
  }

  const call = await db.call.findFirst({
    where: {
      id: callId,
      companyId,
    },
  });

  if (!call) {
    return new NextResponse("Call not found for this company", { status: 404 });
  }

  try {
    const result = await retrySingleCall(callId);

    return NextResponse.json({
      ok: true,
      callId,
      result,
    });
  } catch (err: any) {
    console.error("[API] /api/calls/retry error", err);
    return new NextResponse(
      err?.message ? `Retry error: ${err.message}` : "Retry error",
      { status: 500 }
    );
  }
}
