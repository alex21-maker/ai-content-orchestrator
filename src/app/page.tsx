import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">AI Content Orchestrator</p>
      <h1 className="mt-2 text-2xl font-extrabold">멀티 에이전트 콘텐츠 운영 시스템</h1>
      <p className="mt-3 text-sm text-[var(--sub)]">
        Phase 1 MVP · 모든 채널 연동은 mock 모드입니다. 관리자 승인 없이는 어떤 실제 채널에도 게시되지 않습니다.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          로그인
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold"
        >
          대시보드
        </Link>
      </div>
    </main>
  );
}
