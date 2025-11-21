import { Role } from "@prisma/client";

export function canViewCompanyData(role: Role) {
  return (
    role === Role.OWNER ||
    role === Role.ADMIN ||
    role === Role.MANAGER
  );
}

export function canManageIntegrations(role: Role) {
  return role === Role.OWNER || role === Role.ADMIN;
}
