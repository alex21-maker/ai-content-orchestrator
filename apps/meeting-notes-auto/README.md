# 회의록 자동화 (meeting-notes-auto)

로그인도, DB도 없는 단일 페이지 도구입니다. 브라우저에서 녹음 버튼을 누르고 정지하면:

1. 녹음 파일을 **Google Drive**에 자동 업로드
2. **OpenAI Whisper**로 음성을 텍스트로 변환 (한국어/중국어 혼용 회의 지원)
3. **Claude API**로 한국어/중국어 요약, 결정 사항, 액션 아이템, 리스크를 실제 의미 기반으로 분석
4. **Slack**으로 결과 자동 전달 (webhook 미설정 시 시뮬레이션)

전 과정이 `/api/process` 라우트 하나에서 순서대로 처리됩니다. 별도 로그인/조직/DB 없이 파일(구글
드라이브)과 메시지(Slack)만 남습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 아래 "환경변수" 참고
npm run dev
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud OAuth 2.0 클라이언트 ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 위 클라이언트의 시크릿. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | 업로드 대상 폴더를 소유한 **본인 Google 계정**으로 발급받은 refresh token (아래 참고). |
| `GOOGLE_DRIVE_FOLDER_ID` | 업로드 대상 폴더 ID (폴더 URL의 마지막 부분). |
| `OPENAI_API_KEY` | Whisper 음성인식용. |
| `ANTHROPIC_API_KEY` | Claude 분석용. |
| `SLACK_WEBHOOK_URL` | 선택. 없으면 전송이 시뮬레이션(MOCK)됩니다. |

### 왜 서비스 계정이 아니라 OAuth인가

**서비스 계정은 자체 저장 용량이 0바이트**입니다. 개인(비-Workspace) Gmail 계정 소유의 폴더에
서비스 계정으로 업로드를 시도하면 `Service Accounts do not have storage quota` 오류가 납니다.
Google이 제시하는 공식 대안(공유 드라이브, 도메인 위임)은 둘 다 **Google Workspace 전용**이라
개인 Gmail에서는 쓸 수 없습니다. 그래서 이 앱은 **폴더 소유자 본인 계정으로 인증하는 OAuth
refresh token** 방식을 씁니다 — 업로드된 파일이 그 계정 자신의 용량을 씁니다.

### Refresh token 발급 방법 (OAuth Playground 이용)

1. Google Cloud Console → 해당 프로젝트 → **API 및 서비스 → OAuth 동의 화면**에서 동의 화면을
   구성합니다 (User Type: 외부/External). 테스트 사용자로 본인 이메일을 추가하거나, 가능하면
   **게시(Publish)**해서 테스트 모드의 7일 refresh token 만료를 피하세요 (`drive.file`은
   Google이 재검토를 요구하는 "제한된(restricted)" 범위가 아니라 게시 자체는 어렵지 않습니다 —
   다만 본인만 쓸 앱이라 "확인되지 않은 앱" 경고가 뜨면 그냥 진행하면 됩니다).
2. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   → 애플리케이션 유형 **웹 애플리케이션** → 승인된 리디렉션 URI에
   `https://developers.google.com/oauthplayground` 추가 → 만들기
   → 생성된 **클라이언트 ID**와 **클라이언트 보안 비밀** 저장
3. https://developers.google.com/oauthplayground 접속
4. 오른쪽 위 톱니바퀴(설정) 클릭 → **Use your own OAuth credentials** 체크 →
   위 클라이언트 ID/보안 비밀 입력
5. 왼쪽 목록에서 **Drive API v3** 찾기 → `https://www.googleapis.com/auth/drive.file` 범위 선택
   → **Authorize APIs** → 업로드 대상 폴더를 소유한 본인 Google 계정으로 로그인/허용
6. **Exchange authorization code for tokens** 클릭 → 화면에 나오는 **Refresh token** 복사

이렇게 받은 refresh token은 (앱을 게시했다면) 만료되지 않고 계속 쓸 수 있습니다.

## 알려진 제한사항

- **요청 본문 크기**: Vercel 서버리스 함수는 요청 본문이 약 4.5MB로 제한됩니다. 압축된 웹 오디오
  기준 대략 몇 분 분량의 녹음까지는 문제없지만, 아주 긴 회의는 실패할 수 있습니다. Phase 2에서
  청크 업로드/스트리밍으로 개선이 필요합니다.
- **DB가 없습니다.** 과거 회의 기록을 이 앱 안에서 다시 조회할 수 없습니다 — 구글 드라이브의
  파일과 Slack 메시지가 유일한 기록입니다.
- **화자 분리가 없습니다.** Whisper 출력은 화자 구분 없이 하나의 텍스트로 이어지므로, 액션
  아이템의 담당자(owner)는 Claude가 문맥으로 추정한 값이며 부정확할 수 있습니다.
