// src/app/api/calls/export/route.ts

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

function resolveFromDate(period: string | null): Date | null {
  const now = new Date();

  switch (period) {
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "90d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return d;
    }
    case "365d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      return d;
    }
    default:
      return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period");
  const fromDate = resolveFromDate(periodParam);

  const where: any = { companyId };
  if (fromDate) {
    where.createdAt = { gte: fromDate };
  }

  const calls = await db.call.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      manager: {
        select: { name: true },
      },
    },
  });

  const rows = calls.map((c) => ({
    "Дата": c.createdAt.toISOString(),
    "Статус": c.status,
    "Score": c.score ?? "",
    "Менеджер": (c as any).managerName ?? c.manager?.name ?? "",
    "ID звонка": c.id,
    "Длительность (сек)": (c as any).duration ?? "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Calls");

  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });

  return new NextResponse(excelBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="callx_calls_${periodParam || "all"}.xlsx"`,
    },
  });
}
