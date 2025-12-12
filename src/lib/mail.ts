import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendResetEmail(email: string, url: string) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing");
  }

  const from = process.env.RESEND_FROM || "CallX AI <no-reply@callxai.org>";

  await resend.emails.send({
    from,
    to: email,
    subject: "Восстановление доступа к CallX",
    html: `
      <div style="font-family:Arial, sans-serif; line-height:1.5">
        <h2 style="margin:0 0 10px">Сброс пароля</h2>
        <p style="margin:0 0 14px">Нажми кнопку ниже, чтобы задать новый пароль:</p>
        <p style="margin:0 0 16px">
          <a href="${url}" style="display:inline-block;padding:12px 18px;background:#22c55e;color:#000;text-decoration:none;border-radius:10px;font-weight:700">
            Сбросить пароль
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:12px">Ссылка действует 30 минут.</p>
      </div>
    `,
  });
}
