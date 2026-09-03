// Public, unauthenticated read-only mirror of /dashboard/finance — no login
// required, no upload/create actions. Requested as a temporary "let people
// view the data first" step; the authenticated /dashboard/finance (full
// CRUD, RBAC, audit log) is unaffected and still the only way to upload or
// register an entity. See src/lib/finance/queries.ts for the public reads
// this relies on.
export default function PublicFinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">레이블 재무 대시보드</p>
        <span className="mock-badge">보기 전용 · 로그인 불필요</span>
      </div>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
