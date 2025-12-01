import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

  try {
    const { callId } = await req.json();

    if (!callId || typeof callId !== "string") {
      return new NextResponse("callId is required", { status: 400 });
    }

    const result = await retrySingleCall(callId, companyId);

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
