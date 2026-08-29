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
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud 서비스 계정 키(JSON) — raw JSON 또는 base64. 이 계정의 이메일을 업로드 대상 Drive 폴더에 **편집자**로 공유해야 합니다. |
| `GOOGLE_DRIVE_FOLDER_ID` | 업로드 대상 폴더 ID (폴더 URL의 마지막 부분). |
| `OPENAI_API_KEY` | Whisper 음성인식용. |
| `ANTHROPIC_API_KEY` | Claude 분석용. |
| `SLACK_WEBHOOK_URL` | 선택. 없으면 전송이 시뮬레이션(MOCK)됩니다. |

## 알려진 제한사항

- **요청 본문 크기**: Vercel 서버리스 함수는 요청 본문이 약 4.5MB로 제한됩니다. 압축된 웹 오디오
  기준 대략 몇 분 분량의 녹음까지는 문제없지만, 아주 긴 회의는 실패할 수 있습니다. Phase 2에서
  청크 업로드/스트리밍으로 개선이 필요합니다.
- **DB가 없습니다.** 과거 회의 기록을 이 앱 안에서 다시 조회할 수 없습니다 — 구글 드라이브의
  파일과 Slack 메시지가 유일한 기록입니다.
- **화자 분리가 없습니다.** Whisper 출력은 화자 구분 없이 하나의 텍스트로 이어지므로, 액션
  아이템의 담당자(owner)는 Claude가 문맥으로 추정한 값이며 부정확할 수 있습니다.
