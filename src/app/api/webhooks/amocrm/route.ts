import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  console.log("AMO WEBHOOK:", body);
  // TODO: разобрать реальные события amoCRM и создавать Call сразу по вебхуку

  return NextResponse.json({ ok: true });
}
