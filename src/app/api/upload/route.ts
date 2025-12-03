import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadRawObject } from "@/lib/s3";
import { CallStatus } from "@prisma/client";
import { enqueueCallProcessing } from "@/lib/workers/queue";

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
        { ok: false, error: "No company in session" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Поле file обязательно" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = (file.name.split(".").pop() || "wav").toLowerCase();
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

    await enqueueCallProcessing({ callId: call.id });

    return NextResponse.json(
      {
        ok: true,
        callId: call.id,
        audioUrl: url,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[upload] error", error);
    return NextResponse.json(
      { ok: false, error: "Ошибка при загрузке файла" },
      { status: 500 }
    );
  }
}
