import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PATHS = ["/app/settings", "/app/billing"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAppPath = pathname.startsWith("/app");

  // Забираем JWT токен от NextAuth
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Если это /app/* и юзер не залогинен  кидаем на логин
  if (isAppPath && !token) {
    const url = new URL("/auth/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Если это админский путь  проверяем роль
  if (isAppPath && ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const role = (token as any)?.role as string | undefined;

    if (role !== "OWNER" && role !== "ADMIN") {
      // Можно отдать красивую 403 страницу или простой текст
      return new NextResponse("Forbidden: admin access only", {
        status: 403,
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
