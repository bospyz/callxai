import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasActivePaidSubscription, syncAmoRecentCalls } from "@/lib/amocrm";

export async function POST() {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const paid = await hasActivePaidSubscription(companyId);
  if (!paid) {
    return new NextResponse("Нет активной подписки", { status: 402 });
  }

  try {
    const result = await syncAmoRecentCalls({
      companyId,
      limit: 50,
    });

    // result уже содержит { ok, created, message }
    return NextResponse.json(result);
  } catch (error) {
    console.error("AMO sync error", error);
    return NextResponse.json(
      { error: "Ошибка синхронизации с amoCRM" },
      { status: 500 }
    );
  }
}
