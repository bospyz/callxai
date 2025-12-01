import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PATHS = ["/app/settings", "/app/billing"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Нас интересуют только пути внутри /app
  const isAppPath = pathname.startsWith("/app");

  if (!isAppPath) {
    return NextResponse.next();
  }

  // Забираем JWT-токен от NextAuth
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Если нет токена — редиректим на логин
  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    // Чтобы после логина вернуть пользователя обратно
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Роль юзера из токена (мы её кладём в auth.ts → callbacks.jwt)
  const role = (token as any).role as string | undefined;

  // Если пытается зайти на админские пути — проверяем роль
  const isAdminPath = ADMIN_PATHS.some((p) =>
    pathname === p || pathname.startsWith(p + "/")
  );

  if (isAdminPath) {
    if (role !== "OWNER" && role !== "ADMIN") {
      // Можно потом сделать красивую страницу 403
      return new NextResponse("Forbidden: admin access only", {
        status: 403,
      });
    }
  }

  // Всё ок — пропускаем дальше
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
