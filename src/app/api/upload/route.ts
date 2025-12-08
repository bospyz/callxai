import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadRawObject } from "@/lib/s3";
import { CallStatus, CallTaskStatus } from "@prisma/client";

export const runtime = "nodejs"; // чтобы был доступен Buffer

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = session.user as any;
    const companyId = user.companyId as string | undefined;

    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "No companyId" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const key = `companies/${companyId}/calls/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { url } = await uploadRawObject(key, buffer);

    const call = await db.call.create({
      data: {
        companyId,
        audioUrl: url,
        status: CallStatus.NEW,
        meta: {
          source: "manual-upload",
          originalFileName: file.name,
        } as any,
      },
    });

    await db.callTask.create({
      data: {
        callId: call.id,
        status: CallTaskStatus.NEW,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        callId: call.id,
        audioUrl: url,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[API] /api/upload error", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
