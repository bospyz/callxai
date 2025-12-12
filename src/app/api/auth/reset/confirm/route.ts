import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcrypt";
import crypto from "crypto";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const record = await db.passwordResetToken.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.update({
    where: { id: record.userId },
data: { passwordHash: passwordHash },

  });

  await db.passwordResetToken.delete({
    where: { id: record.id },
  });

  return NextResponse.json({ ok: true });
}
