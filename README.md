# AI Content Orchestrator — Phase 1 MVP

멀티 에이전트 기반 콘텐츠 운영 시스템. Instagram / Threads / Google Blogger 채널을 대상으로
리서치 → 전략 → 원고/크리에이티브 → 검수 → 관리자 승인 → (mock) 예약/배포 → 운영 → 분석까지
이어지는 파이프라인의 Phase 1 MVP입니다. 자세한 설계는 [`docs/PRD.md`](./docs/PRD.md) 참고.

**중요: Phase 1은 모든 채널 연동이 mock입니다.** 실제 Instagram/Threads/Blogger에 게시되는
기능은 없습니다 (Phase 2 범위). 관리자 승인 없이는 어떤 배포 작업도 생성되지 않습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env   # 값 채우기 (아래 "환경변수" 참고)
npm run db:generate    # 스키마에서 마이그레이션 SQL 생성 (이미 생성돼 있으면 생략)
npm run db:migrate     # 로컬/개발 Postgres에 마이그레이션 적용
npm run db:seed        # 데모 조직/사용자/브랜드 프로필 생성
npm run dev            # http://localhost:3000
```

시드 계정: `admin@lablab.ai` / `dev-password-1234` — **프로덕션 배포 전 반드시 변경하거나
새 사용자로 교체하세요.**

## 환경변수

`.env.example` 참고. 필수 값:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Postgres 연결 문자열. Vercel Postgres 사용 시 `POSTGRES_URL`도 자동 인식됩니다 (아래 "Vercel 배포" 참고). |
| `AUTH_SECRET` | `npx auth secret` 또는 `openssl rand -base64 32`로 생성. |
| `NEXTAUTH_URL` | 로컬은 `http://localhost:3000`, Vercel은 배포 URL. |
| `AUTH_TRUST_HOST` | 로컬/비-Vercel 호스트에서 필수 (`"true"`). Vercel은 자체적으로 신뢰하므로 Vercel 대시보드에는 보통 설정할 필요 없음. |
| `CONNECTOR_MODE` | Phase 1은 `"mock"` 고정. |

## DB 마이그레이션 (Drizzle)

이 프로젝트는 **Prisma가 아니라 Drizzle ORM**을 사용합니다. 원래 Prisma로 시작했지만,
Prisma CLI가 스키마 검증/마이그레이션마다 `binaries.prisma.sh`에서 네이티브 엔진 바이너리를
내려받아야 하는데 이 작업이 실행된 샌드박스의 아웃바운드 프록시가 그 도메인을 완전히
차단해 `generate`/`validate`/`migrate` 전부가 실패했습니다. Drizzle은 순수 TypeScript +
`pg` 드라이버만 쓰고 어떤 바이너리도 내려받지 않아 문제없이 동작했고, 이 프로젝트의
PRD(`docs/PRD.md` 7번 섹션)도 애초에 "PostgreSQL + Prisma **또는 Drizzle**"을 명시적으로
허용하고 있어 그대로 전환했습니다. 다른 환경(로컬 개발 머신, 다른 CI 등)에서 이 제약이
없다면 Prisma로 다시 바꾸는 것도 가능하지만, 굳이 그럴 이유는 없어 보입니다.

```bash
npm run db:generate   # schema.ts 변경 후 마이그레이션 SQL 생성
npm run db:migrate     # 마이그레이션 적용 (비대화형, CI/CD에 안전)
npm run db:seed        # 데모 데이터 시드
```

`drizzle-kit push`(대화형 diff)는 TTY가 없는 환경(이 세션 포함)에서 멈추므로 generate+migrate
조합을 사용합니다.

## 테스트

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
npm test              # vitest — 27개 단위 테스트 (상태 머신, 콘텐츠 해시, mock 커넥터, postable-variants 회귀 테스트)
npm run build         # production build
```

E2E는 자동화된 테스트 파일로 커밋되어 있지 않습니다 — 대신 개발 중 `/tmp/smoke_test.mjs`
(세션에만 존재, 저장소에는 없음)로 로그인 → 캠페인 생성 → 콘텐츠 생성 → 에이전트 실행 →
승인 전 배포 차단 검증(2회) → 승인 → mock 배포 → 지표 갱신 → 전 대시보드 페이지 렌더링까지
전체 흐름을 curl 기반으로 검증했고, Playwright로 로그인 상태의 데스크톱/모바일 뷰포트
스크린샷도 확인했습니다. Phase 2에서 Playwright E2E를 `tests/e2e/`에 정식으로 추가하는 것을
권장합니다.

## Vercel 배포

1. **Postgres 준비**: Vercel 대시보드 → 프로젝트 → Storage 탭 → Create Database → Postgres.
   연결하면 `POSTGRES_URL` 등 환경변수가 자동 주입됩니다 — 이 프로젝트의 DB 클라이언트
   (`src/db/index.ts`, `drizzle.config.ts`)는 `DATABASE_URL`을 우선 사용하고 없으면
   `POSTGRES_URL`로 자동 폴백하므로 별도 이름 변경 없이 바로 동작합니다.
2. **마이그레이션 적용**: `vercel env pull .env.local`로 연결 정보를 받은 뒤 로컬에서
   `npm run db:migrate`를 한 번 실행하거나, CI 배포 파이프라인에 같은 명령을 추가하세요.
3. **환경변수 설정**: Vercel 대시보드 → Settings → Environment Variables에 `AUTH_SECRET`,
   `NEXTAUTH_URL`(배포 URL)을 추가하세요. `AUTH_TRUST_HOST`는 Vercel에서는 보통 불필요합니다
   (Vercel이 자체적으로 호스트를 신뢰하도록 처리됨).
4. **배포**: `vercel --prod` 또는 Git 연동 자동 배포.
5. **시드**: 배포 후 최초 1회 `npm run db:seed`를 (연결된 env로) 실행해 조직/브랜드/사용자를
   만드세요. 프로덕션에서는 시드 스크립트의 기본 비밀번호를 그대로 쓰지 말고 직접 계정을
   만드는 것을 권장합니다.

## Mock/Production 전환

Phase 1은 `src/lib/connectors/mock-connector.ts`의 `MockConnector`만 존재하며,
`getConnector(channel)`이 항상 이것을 반환합니다. Phase 2에서 실제 Instagram/Threads/Blogger
연동을 추가할 때는:

1. `src/lib/connectors/types.ts`의 `Connector` 인터페이스를 그대로 구현하는
   `InstagramConnector`/`ThreadsConnector`/`BloggerConnector`를 추가하고,
2. `getConnector()`의 분기 로직만 바꾸면 됩니다 — API 라우트/UI 코드는 전혀 수정할 필요가
   없도록 설계되어 있습니다 (`docs/PRD.md` 9번 섹션의 커넥터 추상화 원칙).
3. `socialConnections.mode`를 `"PRODUCTION"`으로, 실제 OAuth 토큰은
   `encryptedAccessToken`/`encryptedRefreshToken` 필드에 **암호화하여** 저장하세요 (현재는
   미사용 — Phase 1은 이 필드에 아무것도 쓰지 않습니다).

## 알려진 제한사항 (Phase 1)

- **미디어 저장소가 로컬 파일시스템입니다** (`src/lib/storage.ts`). Vercel 서버리스는
  파일시스템이 요청마다 초기화/읽기전용이라 업로드된 이미지가 배포 간 유지되지 않습니다.
  Phase 2에서 Vercel Blob 또는 S3 호환 스토리지로 교체가 필요합니다 (`saveAsset()` 함수
  시그니처만 유지하면 호출부는 그대로 둘 수 있습니다).
- **에이전트가 실제 LLM을 호출하지 않습니다.** `src/lib/agents/*.ts`는 결정적
  템플릿 기반 mock 생성기입니다 — 브랜드 브리프/톤앤매너를 입력으로 받아 그럴듯한 한국어
  마케팅 카피를 만들지만 실제 리서치나 생성형 AI 호출은 없습니다.
- **Instagram 게시는 이미지가 필요합니다** (mock 커넥터도 실제 정책을 반영). 에이전트
  오케스트레이션만으로는 실제 업로드된 이미지가 생기지 않으므로, Instagram 채널을 배포하려면
  승인 전에 `콘텐츠 상세 → 채널 변형 편집` 화면에서 이미지를 업로드해야 합니다. 업로드 없이
  배포를 시도하면 Instagram만 실패 처리되고 Threads/Blogger는 정상 진행됩니다.
- **부분 실패 시 재시도 경로가 제한적입니다.** 배포 중 한 채널이라도 실패하면 콘텐츠 상태가
  `FAILED`로 전환되고, 이미 성공한 채널이 있어도 같은 승인 건으로는 재배포 API가
  다시 호출되지 않습니다(APPROVED 상태만 허용). 실패한 채널만 골라 재시도하는 세밀한 흐름은
  Phase 2 과제로 남겨두었습니다 — 다만 성공한 채널이 중복 게시되는 일은 없습니다
  (idempotencyKey가 채널+승인 단위로 유일해서 이미 성공한 채널은 재호출해도 skip됩니다).
- **다중 조직 전환 UI가 없습니다.** 로그인한 사용자의 첫 번째 멤버십을 "현재 조직"으로
  간주합니다 (`src/lib/current-org.ts`). 데이터 모델은 다중 조직을 지원하지만 전환 UI는
  Phase 2 과제입니다.
- **콘텐츠 캘린더 화면이 없습니다.** 사이드바에 링크는 있지만 페이지가 아직 없습니다
  (다른 화면들과 달리 우선순위가 낮다고 판단해 Phase 1에서 제외했습니다).
- **댓글/멘션 모니터링, 실험(A/B), 성과 기반 추천은 전혀 구현되어 있지 않습니다** (PRD
  11번 섹션 "추가 고도화 기능" — Phase 3 범위).

## Phase 2 실제 연동을 위해 준비할 것

- Meta 개발자 앱 (Instagram/Threads Graph API 자격 증명 — 앱 등록은 계정 소유자 본인이 직접
  해야 합니다)
- Google Cloud 프로젝트 + Blogger API 사용 설정 (OAuth 클라이언트)
- 이미지/영상 생성 서비스 자격 증명 (사용할 공급자 결정 필요 — 아직 미정)
- S3 호환 오브젝트 스토리지 (또는 Vercel Blob) — 위 "알려진 제한사항" 참고
- durable queue/workflow 서비스 (Vercel 서버리스 함수 생명주기를 벗어나는 예약 발행/재시도를
  위해 필요 — 예: Vercel Queues, Inngest, Trigger.dev 등 중 선택)
