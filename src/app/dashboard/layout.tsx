import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "홈" },
  { href: "/dashboard/campaigns", label: "캠페인" },
  { href: "/dashboard/meetings", label: "회의" },
  { href: "/dashboard/approvals", label: "승인 대기" },
  { href: "/dashboard/calendar", label: "콘텐츠 캘린더" },
  { href: "/dashboard/analytics", label: "성과 분석" },
  { href: "/dashboard/audit-log", label: "감사 로그" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let org;
  try {
    org = await requireCurrentOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 md:flex-row md:gap-8">
      <aside className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-[var(--line)] pb-4 md:w-48 md:flex-col md:items-stretch md:border-b-0 md:pb-0">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{org.organizationName}</p>
          <p className="mt-0.5 text-[11px] text-[var(--sub)]">{org.role}</p>
        </div>
        <span className="mock-badge md:mt-6 md:hidden">MOCK MODE</span>
        <nav className="hidden flex-col gap-1 md:mt-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="mock-badge mt-6 hidden md:inline-flex">MOCK MODE</span>
      </aside>
      <nav className="-mx-1 flex flex-wrap gap-1 md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2.5 py-1 text-xs text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
