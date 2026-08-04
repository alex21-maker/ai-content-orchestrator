# AI Content Orchestrator — PRD & 기술 설계 (Phase 1 MVP)

> 이 문서는 업로드된 마스터 프롬프트(`claude_multi_agent_content_system_prompt.md`) 13번 지침에 따라 작성되었습니다.
> 결정된 범위: **Phase 1 MVP 전체 구축**, DB는 **Vercel Postgres**, 채널 연동은 **mock 커넥터만** (실제 OAuth는 Phase 2).
> 기존 정적 대시보드 시스템(`insta-mk-labl` 프로젝트, content.json 기반)은 이 시스템으로 대체됩니다. 기존 자동화 스케줄 2건은 비활성화했습니다.

## 1. PRD 요약

**목표**: 캠페인 브리프 하나에서 리서치 → 기획 → 채널별 원고/크리에이티브 → 검수 → 관리자 승인 → 예약 발행 → 운영 → 분석까지 이어지는 멀티 에이전트 콘텐츠 운영 시스템.

**대상 채널**: Instagram(피드/캐러셀/릴스/스토리), Threads(단문/스레드), Google Blogger(SEO 장문).

**핵심 원칙**:
1. 관리자의 명시적 최종 승인 전에는 어떤 실제 채널에도 게시하지 않는다 — Phase 1은 mock 배포만 존재하므로 이 원칙이 구조적으로 보장된다.
2. 모든 생성·수정·검토·승인·반려·예약·배포·실패·재시도 이력을 감사 로그로 남긴다.
3. 커넥터는 인터페이스로 추상화하고, mock과 production을 UI에서 명확히 구분한다.
4. AI 결과물과 외부 자료는 출처·모델·프롬프트 버전·생성 시각을 추적한다.
5. 미구현 기능을 구현된 것처럼 표시하지 않는다 — mock 배포는 "실제 게시 아님"을 항상 명시한다.

## 2. 사용자 역할 (RBAC)

| 역할 | 권한 |
|---|---|
| Owner | 조직 설정, 결제, 멤버 초대/삭제, 모든 기능 |
| Admin | 브랜드/캠페인 관리, 최종 승인 권한, 커넥터 연결 |
| Editor | 콘텐츠 작성/편집, 코멘트, 수정 요청 대응 (승인 불가) |
| Reviewer | 코멘트·수정 요청만 가능, 승인 권한 없음 (선택적 역할) |
| Viewer | 읽기 전용 |

Membership은 Organization당 사용자별 role 하나를 가진다 (다중 조직 소속 가능).

## 3. 핵심 사용자 흐름

1. **온보딩**: 가입 → 조직 생성 → 브랜드 프로필 입력(소개/톤앤매너/금칙어/컬러/폰트) → (mock) 채널 연결.
2. **캠페인 생성**: 브리프 입력 → AI 보완 질문(mock 오케스트레이터가 질문 목록 생성) → 캠페인 확정.
3. **콘텐츠 생성**: 오케스트레이터가 작업 분해 → 리서치 에이전트 mock 실행 → 전략 에이전트 mock 실행 → 카피라이팅/크리에이티브 에이전트 채널별 병렬 mock 실행 → 품질검수 에이전트 mock 실행(위험도 blocker/high/medium/low) → blocker면 REVISION_REQUIRED로 자동 반송.
4. **검토·승인**: 관리자가 승인 화면에서 채널별 미리보기, 출처, 검수 결과, 버전 diff 확인 → 승인(버전 해시 저장) / 반려 / 수정요청.
5. **예약·배포(mock)**: 승인된 콘텐츠만 PublicationJob 생성 가능 → mock connector가 게시 결과를 시뮬레이션(성공/실패/재시도) → PublicationResult 기록, 감사 로그 남김.
6. **운영·분석**: mock 지표 스냅샷 생성 → 채널/캠페인/형식별 비교 대시보드 → 다음 캠페인 제안(가설 형태, 인과관계 단정 금지).

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router, TS)  — Vercel                   │
│  ┌───────────────┐  ┌──────────────────┐                 │
│  │  UI (RSC)     │  │  API Routes        │                │
│  │  - 대시보드    │  │  /api/campaigns    │                │
│  │  - 승인 화면   │  │  /api/content      │                │
│  │  - 캘린더      │  │  /api/agents/run    │                │
│  └───────────────┘  │  /api/publish       │                │
│                      │  /api/webhooks/*    │                │
│                      └──────────────────┘                 │
│  Auth.js (세션, RBAC 미들웨어)                              │
│  Agent Orchestration Layer (mock, 공통 JSON 프로토콜)       │
│  Connector Layer (interface + MockConnector)               │
└─────────────────────────────────────────────────────────┘
              │                          │
      Prisma ORM                  S3-compatible (mock: 로컬/Blob)
              │
      Vercel Postgres
```

**중요 제약**: Vercel 서버리스 함수는 요청 생명주기가 짧아 장시간 작업에 부적합하다. Phase 1은 에이전트 실행이 즉시 응답 가능한 mock이므로 API Route 내에서 동기 처리한다. Phase 2에서 실제 LLM/이미지 생성 연동 시 durable queue(예: Vercel Queues, Inngest, Trigger.dev)로 분리해야 한다 — 이 문서는 그 지점에 어댑터 경계를 미리 만들어 둔다 (`lib/queue/`).

## 5. 데이터 모델 (Prisma 기준)

핵심 엔터티: `User, Organization, Membership, BrandProfile, SocialConnection, Campaign, ContentItem, ChannelVariant, Asset, Source, AgentRun, AgentMessage, ReviewFinding, Approval, PublicationJob, PublicationResult, MetricSnapshot, CommentThread, Notification, PromptTemplate, PromptVersion, AuditLog`

세부 스키마는 `prisma/schema.prisma` 참고. 설계 원칙:
- `ContentItem`과 `Asset`은 버전(version 필드) + `createdBy`(User|Agent 구분) + `parentVersionId`로 이전 버전 계보를 추적.
- `Approval`은 승인 시점의 `contentHash`를 저장하고, `PublicationJob` 생성 시 현재 콘텐츠 해시와 재대조한다(해시 불일치 시 배포 차단, 승인 자동 무효화).
- `AuditLog`는 애플리케이션 레벨에서 UPDATE/DELETE를 차단(추가 전용, append-only)한다.
- `SocialConnection`은 Phase 1에서 `provider: "mock"` 값만 가지며, 실제 토큰 필드는 스키마에 존재하되 암호화 저장을 전제로 미사용 상태로 둔다.

## 6. 콘텐츠 상태 머신

```
IDEA → RESEARCHING → DRAFTING → REVIEWING → REVISION_REQUIRED → READY_FOR_APPROVAL
  → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED → MONITORING → ANALYZED

예외: BLOCKED, FAILED, CANCELED, ARCHIVED (모든 단계에서 진입 가능)
```

- `REVIEWING ↔ REVISION_REQUIRED`: 최대 3라운드, 이후 관리자 판단 요청(상태를 BLOCKED로 전환하고 알림).
- `APPROVED` 이후 `ContentItem`/`ChannelVariant`/`Asset` 수정 시 해당 `ContentItem`은 자동으로 `READY_FOR_APPROVAL` 이전 단계로 되돌아가고 기존 `Approval`은 무효화된다.
- 모든 상태 변경은 `AuditLog`에 actor, timestamp, reason, from/to 값을 기록한다.

## 7. 커넥터 Capability Matrix (Phase 1)

| 채널 | validate | preview | publish | schedule | getStatus | fetchMetrics | fetchComments | 비고 |
|---|---|---|---|---|---|---|---|---|
| Instagram (mock) | ✅ | ✅ | ✅ mock | ✅ mock | ✅ | ✅ mock | ✅ mock | 실제 API 공식 지원(Graph API) — Phase 2에서 실연동 |
| Threads (mock) | ✅ | ✅ | ✅ mock | ✅ mock | ✅ | ⚠️ 제한적(공식 API 지표 제한) | ⚠️ | Threads API 공개 지표 범위 좁음 — Phase 2 확인 필요 |
| Blogger (mock) | ✅ | ✅ | ✅ mock | ✅ mock | ✅ | ⚠️ 조회수만 | ✅ mock | Blogger API는 공식 지원, Phase 2 실연동 용이 |

모든 셀은 현재 **mock 구현**이며 UI에 "MOCK MODE" 배지로 명시한다. Phase 2에서 실제 API로 전환 시 이 표를 갱신한다.

## 8. 보안 위협 모델

| 위협 | 대응 (Phase 1) |
|---|---|
| 테넌트 간 데이터 유출 | 모든 쿼리에 `organizationId` 스코프 필수, Prisma 미들웨어로 강제 |
| 미승인 배포 | `PublicationJob` 생성 API는 `Approval` 레코드 존재 + 해시 일치 + RBAC(Admin/Owner) 검증을 통과해야 호출 가능 |
| 권한 상승 | 서버 액션/API Route에서 세션 role을 매 요청 재검증 (클라이언트 role 신뢰 안 함) |
| 승인 우회 | 승인 없는 상태에서 배포 엔드포인트 호출 시 403 + AuditLog 기록 |
| 중복 게시 | `PublicationJob`에 멱등성 키(`contentItemId + channel + approvalId`) unique 제약 |
| 감사 로그 변조 | `AuditLog`는 애플리케이션 레벨 UPDATE/DELETE 금지, DB 레벨에서도 REVOKE UPDATE/DELETE 권장(Phase 2 인프라 작업) |
| 시크릿 노출 | 모든 시크릿은 서버 전용 환경변수, 클라이언트 번들에 미포함 — mock 단계라 실제 토큰 없음 |
| CSRF/XSS | Next.js 기본 보호 + 입력값 sanitize, 서버 액션 사용 |
| 근거 없는 통계 생성 | 품질검수 에이전트가 `sources` 배열 없는 통계 주장을 blocker로 분류 |
| 에이전트의 권한 상승 | mock 에이전트 실행 레이어는 승인/시스템 프롬프트를 수정하는 도구를 갖지 않음(코드 레벨 분리) |

## 9. Phase 1 완료 기준 (이 문서 14번 기준과 동일)

- 새 사용자가 브랜드와 캠페인을 만들 수 있다.
- 에이전트(mock)가 조사·전략·원고·크리에이티브·검수 결과를 생성하고 기록한다.
- 관리자가 채널별 결과를 편집하고 버전 비교 후 승인/반려할 수 있다.
- 승인 전에는 배포 작업 생성이 불가능하다.
- 승인 후 mock connector로 예약·게시·실패·재시도 흐름을 검증할 수 있다.
- 모든 주요 이벤트가 검색 가능한 감사 로그에 남는다.
- 샘플 지표로 성과 대시보드와 개선 제안을 확인할 수 있다.
- 모바일/데스크톱에서 핵심 화면이 정상 작동한다.
- 테스트와 production build 통과, Vercel 배포 절차 문서화.

## 10. Phase 1에서 다루지 않는 것 (명시적 범위 제외)

- 실제 Instagram/Threads/Blogger OAuth 및 실게시 (Phase 2)
- 실제 이미지·영상 생성 공급자 연동 (Phase 2)
- 댓글 모니터링·자동 답변 (Phase 2)
- durable queue 기반 백그라운드 실행 (Phase 2 — Phase 1은 동기 mock 처리)
- A/B 실험, 성과 학습 추천, 다중 브랜드 고급 리포트 (Phase 3)
