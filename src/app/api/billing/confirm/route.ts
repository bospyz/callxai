import { NextRequest, NextResponse } from "next/server";

/**
 * Stub for Stripe billing confirm.
 * В демо-версии просто отдаём 200, чтобы билд проходил.
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, message: "Billing confirm stub" });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true, message: "Billing confirm stub (POST)" });
}
