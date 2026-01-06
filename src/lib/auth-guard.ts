import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { HttpError } from "@/lib/http-error";

export type AppRole = Role;

export interface AuthContext {
  session: Awaited<ReturnType<typeof auth>>;
  userId: string;
  companyId: string;
  role: AppRole;
}

export async function requireAuthWithCompany(): Promise<AuthContext> {
  const session = await auth();

  if (!session || !session.user) {
    throw new HttpError(401, "Unauthorized");
  }

  const user = session.user as any;

  const userId =
    (user.id as string | undefined) ??
    null;

  const companyId = (user.companyId as string | undefined) ?? "";
  const role = (user.role as AppRole | undefined) ?? Role.MANAGER;

  if (!userId) {
    // лучше не фолбечить на email — иначе userId перестаёт быть userId
    throw new HttpError(401, "Unauthorized: missing user id");
  }

  if (!companyId) {
    // это уже не 401, а 403/500 зависит от твоей модели.
    // Я бы делал 403: пользователь есть, но тенант не определён.
    throw new HttpError(403, "Forbidden: no companyId");
  }

  return { session, userId, companyId, role };
}
