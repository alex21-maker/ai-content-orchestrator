import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ targetType?: string }>;
}) {
  const org = await requireCurrentOrg();
  const { targetType } = await searchParams;

  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      targetType
        ? and(eq(auditLogs.organizationId, org.organizationId), eq(auditLogs.targetType, targetType))
        : eq(auditLogs.organizationId, org.organizationId)
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-xl font-bold">감사 로그</h1>
      <p className="mt-1 text-sm text-[var(--sub)]">
        최근 100건. 추가만 가능(append-only)하며 수정/삭제 경로는 존재하지 않습니다.
      </p>

      <form className="mt-4 flex items-center gap-2" action="/dashboard/audit-log">
        <label className="text-xs text-[var(--sub)]" htmlFor="targetType">
          대상 유형 필터
        </label>
        <input
          id="targetType"
          name="targetType"
          defaultValue={targetType ?? ""}
          placeholder="예: content_item"
          className="rounded-md border border-[var(--line)] px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--line)] px-3 py-1 text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          검색
        </button>
        {targetType && (
          <Link href="/dashboard/audit-log" className="text-xs text-[var(--sub)] underline">
            초기화
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs text-[var(--sub)]">
              <th className="px-3 py-2 font-semibold">시각</th>
              <th className="px-3 py-2 font-semibold">주체</th>
              <th className="px-3 py-2 font-semibold">액션</th>
              <th className="px-3 py-2 font-semibold">대상</th>
              <th className="px-3 py-2 font-semibold">상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-[var(--sub)]">
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--line)] align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--sub)]">
                  {row.createdAt.toISOString()}
                </td>
                <td className="px-3 py-2 text-xs">
                  {/* actorId for agent actors already carries an "agent:" prefix
                      (e.g. "agent:orchestrator") — don't double it up. */}
                  {row.actorId?.startsWith(`${row.actorType}:`) ? row.actorId : `${row.actorType}${row.actorId ? `:${row.actorId}` : ""}`}
                </td>
                <td className="px-3 py-2 text-xs font-semibold">{row.action}</td>
                <td className="px-3 py-2 text-xs text-[var(--sub)]">
                  {row.targetType}:{row.targetId}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.metadata ? (
                    <details>
                      <summary className="cursor-pointer text-[var(--accent)]">JSON</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-[var(--bg)] p-2 text-[11px]">
                        {JSON.stringify(row.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-[var(--sub)]">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
