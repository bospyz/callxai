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

    await db.call.update({
      where: { id: callId },
      data: { status: CallStatus.PROCESSING },
    });

    try {
      await processCall(callId);
      // processCall ставит DONE
      return NextResponse.json({ ok: true });
    } catch (error: any) {
      console.error("Error in processCall", error);

      await db.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.ERROR,
          meta: {
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
