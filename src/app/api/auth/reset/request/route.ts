import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateResetToken } from "@/lib/tokens";
import { sendResetEmail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email } });

  // ВАЖНО: не палим, существует ли пользователь
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const { token, tokenHash } = generateResetToken();

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 минут
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset?token=${token}`;

  await sendResetEmail(user.email, resetUrl);

  return NextResponse.json({ ok: true });
}
