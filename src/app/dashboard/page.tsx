import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export default async function DashboardHomePage() {
  const org = await requireCurrentOrg();

  const [campaignCount] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(eq(campaigns.organizationId, org.organizationId));

  return (
    <div>
      <h1 className="text-xl font-bold">대시보드</h1>
      <p className="mt-1 text-sm text-[var(--sub)]">{org.organizationName} · 로그인: {org.userId}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="text-2xl font-extrabold text-[var(--accent)]">{campaignCount?.value ?? 0}</div>
          <div className="mt-1 text-xs text-[var(--sub)]">캠페인</div>
        </div>
      </div>

      <p className="mt-8 text-sm text-[var(--sub)]">
        왼쪽 메뉴에서 캠페인을 만들고 콘텐츠 파이프라인을 시작하세요.
      </p>
    </div>
  );
}
