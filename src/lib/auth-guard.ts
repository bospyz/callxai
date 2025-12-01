import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";

export type AppRole = Role;

export interface AuthContext {
  session: Awaited<ReturnType<typeof auth>>;
  userId: string | null;
  companyId: string;
  role: AppRole;
}

/**
 * Обязательная авторизация + companyId + role.
 * Если нет сессии — Unauthorized.
 * Если нет companyId — ошибка, потому что мы multi-tenant.
 */
export async function requireAuthWithCompany(): Promise<AuthContext> {
  const session = await auth();

  if (!session || !session.user) {
    throw new Error("Unauthorized: no session");
  }

  const user = session.user as any;

  const userId =
    (user.id as string | undefined) ??
    (user.email as string | undefined) ??
    null;

  const companyId = (user.companyId as string | undefined) ?? "";
  const role = (user.role as AppRole | undefined) ?? Role.MANAGER;

  if (!companyId) {
    throw new Error("No companyId in session");
  }

  return { session, userId, companyId, role };
}
