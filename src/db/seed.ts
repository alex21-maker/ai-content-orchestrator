// Dev/demo seed. Run with `npm run db:seed`.
// Creates one organization ("lablab_ai"), one OWNER user, a brand profile
// matching the user's real @lablab_ai account context, and mock social
// connections for all three Phase 1 channels.

import "dotenv/config";
import { hash } from "bcryptjs";
import { db } from "./index";
import { users, organizations, memberships, brandProfiles, socialConnections, financeEntities } from "./schema";

async function main() {
  const passwordHash = await hash("dev-password-1234", 10);

  const [user] = await db
    .insert(users)
    .values({
      email: "admin@lablab.ai",
      name: "Alex",
      passwordHash,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const resolvedUser =
    user ?? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, "admin@lablab.ai") }));
  if (!resolvedUser) throw new Error("Failed to create or find seed user");

  const [org] = await db
    .insert(organizations)
    .values({ name: "lablab_ai", slug: "lablab-ai" })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  const resolvedOrg =
    org ?? (await db.query.organizations.findFirst({ where: (o, { eq }) => eq(o.slug, "lablab-ai") }));
  if (!resolvedOrg) throw new Error("Failed to create or find seed organization");

  await db
    .insert(memberships)
    .values({ userId: resolvedUser.id, organizationId: resolvedOrg.id, role: "OWNER" })
    .onConflictDoNothing({ target: [memberships.userId, memberships.organizationId] });

  await db
    .insert(brandProfiles)
    .values({
      organizationId: resolvedOrg.id,
      name: "lablab_ai — 중국 마케팅 인사이트",
      description: "샤오홍슈·도우인 뷰티 트렌드를 다루는 중국 마케팅 인사이트 계정",
      targetAudience: "뷰티/헬스푸드/피부과 브랜드 마케터",
      toneOfVoice: "신뢰감 있는 전문가 톤, 과장 없는 데이터 기반 인사이트",
      forbiddenWords: ["100% 보장", "즉시 효과", "부작용 없음"],
      requiredPhrases: [],
      competitors: [],
    })
    .onConflictDoNothing();

  for (const channel of ["INSTAGRAM", "THREADS", "BLOGGER"] as const) {
    const accountLabel = channel === "BLOGGER" ? "lablab-ai.blogspot.com" : "@lablab_ai";
    await db
      .insert(socialConnections)
      .values({
        organizationId: resolvedOrg.id,
        channel,
        mode: "MOCK",
        accountLabel,
        status: "connected",
      })
      .onConflictDoNothing({ target: [socialConnections.organizationId, socialConnections.channel] });
  }

  // Finance entity shell only — no seeded filing/figures on purpose. Real
  // monthly financial statements are confidential and should come from an
  // actual upload through the dashboard (/dashboard/finance), never from a
  // fixture checked into source control. legalNameZh/taxId auto-fill from
  // the first uploaded filing (see src/lib/finance/ingest.ts).
  // (taxId is null pre-upload, and Postgres treats NULL as distinct in the
  // org+taxId unique index, so dedupe by name instead of onConflictDoNothing.)
  const existingFinanceEntity = await db.query.financeEntities.findFirst({
    where: (fe, { and, eq }) => and(eq(fe.organizationId, resolvedOrg.id), eq(fe.name, "레이블 차이나")),
  });
  if (!existingFinanceEntity) {
    await db.insert(financeEntities).values({ organizationId: resolvedOrg.id, name: "레이블 차이나", country: "CN", currency: "CNY" });
  }

  console.log("Seed complete:");
  console.log(`  org: ${resolvedOrg.name} (${resolvedOrg.id})`);
  console.log(`  user: ${resolvedUser.email} / dev-password-1234`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
