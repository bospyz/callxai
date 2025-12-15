// src/lib/integration-ui.ts
import { IntegrationType as PrismaIntegrationType } from "@prisma/client";

export type UiIntegrationType = "amocrm" | "bitrix24" | "webhook";

export type UiIntegration = {
  id: string;
  companyId: string;
  enabled: boolean;
  type: UiIntegrationType;
  config: any | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapIntegrationToUi(
  integration:
    | {
        id: string;
        companyId: string;
        enabled: boolean;
        type: PrismaIntegrationType;
        config: any;
        createdAt: Date;
        updatedAt: Date;
      }
    | null
): UiIntegration | null {
  if (!integration) return null;

  const type: UiIntegrationType =
    integration.type === PrismaIntegrationType.AMOCRM
      ? "amocrm"
      : integration.type === PrismaIntegrationType.BITRIX24
      ? "bitrix24"
      : "webhook";

  return {
    id: integration.id,
    companyId: integration.companyId,
    enabled: integration.enabled,
    type,
    config: (integration.config as any) ?? null,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}
