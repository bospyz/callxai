import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCompany } from "@/lib/auth-guard";
import { amoRequest } from "@/lib/amocrm";

export async function GET(req: NextRequest) {
  const { companyId } = await requireAuthWithCompany();

  async function probe(path: string, query: any = {}) {
    try {
      const data = await amoRequest<any>({
        companyId,
        method: "GET",
        path,
        query,
      });
      const embedded = data?._embedded;
      const keys = embedded ? Object.keys(embedded) : [];
      const firstKey = keys[0];
      const arr =
        (firstKey && Array.isArray(embedded[firstKey]) && embedded[firstKey]) ||
        (Array.isArray(data?.items) ? data.items : null) ||
        null;

      return {
        path,
        ok: true,
        embeddedKeys: keys,
        count: Array.isArray(arr) ? arr.length : null,
        sample: Array.isArray(arr) ? arr.slice(0, 2) : null,
      };
    } catch (e: any) {
      return { path, ok: false, status: e?.status ?? null, message: e?.message ?? String(e) };
    }
  }

  // важные кандидаты
  const res = await Promise.all([
    probe("/api/v4/account"),
    probe("/api/v4/calls", { limit: 5, page: 1 }),
    probe("/api/v4/events", { limit: 5, page: 1 }),
    probe("/api/v4/leads/notes", { limit: 5, page: 1 }),
    probe("/api/v4/contacts/notes", { limit: 5, page: 1 }),
    probe("/api/v4/companies/notes", { limit: 5, page: 1 }),
  ]);

  return NextResponse.json({ ok: true, probes: res });
}
