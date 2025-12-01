import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCall } from "@/lib/call-analysis";
import { CallStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const { callId, secret } = await req.json();

    if (!callId) {
      return new NextResponse("callId is required", { status: 400 });
    }

    if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const call = await db.call.findUnique({
      where: { id: callId },
    });

    if (!call) {
      return new NextResponse("Call not found", { status: 404 });
    }

    try {
      await processCall(callId);
      return new NextResponse("OK", { status: 200 });
    } catch (error: any) {
      console.error("[/api/calls/process] processing error", error);

      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
            ...(call.meta as any),
            error: String(error?.message || error),
          },
        },
      });

      return new NextResponse("Processing error", { status: 500 });
    }
  } catch (error) {
    console.error("Error in /api/calls/process", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
