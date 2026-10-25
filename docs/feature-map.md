# SketchBrowser 기능 구현 현황과 확장 지도

기준일: 2026-10-25. 앱 0.2.1 구현 기준 `c71781f`, 블로그 검토 UI 기준 `8a6707d`. 후속 커밋은 검사·문서 보완을 포함한다.
후속 작업 소스는 크래프톤 포트폴리오 지원을 추가했다. 서버 기준 `38bf66d`이며 **설치 APK 0.2.1에는 아직 없고 새 APK 빌드는 실행하지 않았다.**
이 문서는 다음 작업을 고르고 구현 범위를 확인하는 기준표다. 기능 ID를 유지하면서 행을 추가하고, 구현 상태와 검증 결과는 따로 갱신한다.

**앱 빌드는 사용자가 요청할 때만 실행한다.** 2026-10-25 UI 개선 작업에서는 사용자가 APK 빌드를 명시적으로 요청했다. 0.2.1 빌드·검토 서버 반영을 완료했으며 아래에 검증 결과를 기록했다.

## 상태 읽는 방법

| 표시 | 의미 |
| --- | --- |
| 구현 | 실제 실행 경로에 연결된 코드가 있음. 실물 사용까지 모두 확인했다는 뜻은 아님 |
| 일부 구현 | 기능의 일부만 제공하며 표에 적힌 제한이 있음 |
| 작업 중 | 구현을 시작했지만 완료 조건을 충족하지 못함 |
| 검증 대기 | 코드 추가보다 실제 기기·사용자 흐름 확인이 남음 |
| 미구현 후보 | 확장 아이디어. 아직 착수하거나 제공하는 기능이 아님 |
| 설정 변경 | 작업 규칙·CI 설정 변경. 원격 반영 여부를 별도로 표시 |

## 전체 사용 흐름

```mermaid
flowchart TD
    A[웹 읽기 · 필기] --> B["화면 캡처<br/>기기 보관"]
    B --> C["로그인 · 전송<br/>서버 보관"]
    C -->|PC 실행 중| D["원문 조회<br/>AI 수정 제안"]
    D --> E["본문 적용 · 검사<br/>미리보기 생성"]
    E --> R{사용자 검토}
    R -->|추가 요청| D
    R -->|폐기| X[요청 종료]
    R -->|승인| F["승인 커밋 검증<br/>main 반영"]
    F --> G["Pages · 편집 서버 배포<br/>글 버전 확인"]
    G --> H[완료 표시]
```

PC가 꺼져 있으면 새 수정안 생성과 main 반영이 대기한다. 서버에 접수한 요청, 이미 만든 미리보기, 승인은 유지된다. 그림은 구현된 흐름을 뜻하며, 사용자가 실제 글을 승인하는 전체 실사용 검증은 아직 남아 있다.

## 기능 구현 표

### 브라우저와 필기

| ID | 기능 | 구현 상태 | 현재 범위·제한 | 확인한 범위 | 관련 코드 |
| --- | --- | --- | --- | --- | --- |
| B01 | 주소·검색·앞뒤 이동·새로고침 | 구현 | 외부 웹 탐색은 Android WebView. 웹 데모는 연습 페이지 중심 | 브라우저 자동 검사 | [App.tsx](../App.tsx), [BrowserSurface.tsx](../src/browser/BrowserSurface.tsx), [urls.ts](../src/urls.ts) |
| B02 | 도구 접기·전체화면·화면 크기 대응 | 구현 | 전체화면 복귀 시 페이지·필기 유지 | 브라우저 자동 검사 | [App.tsx](../App.tsx) |
| N01 | 펜·밑줄·형광펜·지우개 | 구현 | 색·굵기·압력 지원. 지우개는 획 전체 삭제 | 브라우저·네이티브 입력 자동 검사 | [engine.ts](../src/ink/engine.ts), [model.ts](../src/model.ts) |
| N02 | S Pen 버튼 임시 지우기 | 구현 | 버튼을 누르는 동안 지우개 유지, 놓으면 이전 도구 복귀. 호버만으로는 지우지 않음 | 이전 APK에서 사용자 실물 확인 + 입력 자동 검사. 0.2.1 실물 재확인은 별개 | [SketchStylusInput.kt](../plugins/android/SketchStylusInput.kt), [engine.ts](../src/ink/engine.ts) |
| N03 | 펜만 입력·두 손가락 탐색 전환 | 구현 | 같은 방향 드래그로 탐색 전환. 모든 기기의 손바닥 차단을 보장하는 기능은 아님 | 브라우저·입력 패킷 자동 검사 | [engine.ts](../src/ink/engine.ts) |
| N04 | 실행 취소·다시 실행 | 구현 | 획과 당시 원문 해시를 함께 복원 | 기존 획 복원 자동 검사, 해시 복원 코드 확인 | [engine.ts](../src/ink/engine.ts) |
| N05 | URL별 저장·복원·서재 | 구현 | 기기 로컬 저장, 저장 실패 재시도. 기기 간 동기화 없음 | 저장소 단위·브라우저 자동 검사 | [notebook.ts](../src/storage/notebook.ts), [useNotebook.ts](../src/useNotebook.ts) |
| N06 | 스크롤·문단 이동에 따른 필기 위치 보정 | 일부 구현 | DOM 문단 앵커·좌표 사용. 글자 단위 앵커, PDF·복잡한 iframe은 미지원 | 앵커 위치 자동 검사. 모든 외부 사이트 보장 아님 | [engine.ts](../src/ink/engine.ts), [model.ts](../src/model.ts) |

### 필기 전송과 요청 관리

| ID | 기능 | 구현 상태 | 현재 범위·제한 | 확인한 범위 | 관련 코드 |
| --- | --- | --- | --- | --- | --- |
| R01 | 원문+필기 화면 캡처 | 구현 | 현재 화면 한 장의 PNG와 보이는 획·텍스트·원문 해시. 캡처 중 화면 변화 검사 | 캡처 문맥 자동 검사. 태블릿의 실제 PNG 캡처는 검증 대기 | [BrowserSurface.tsx](../src/browser/BrowserSurface.tsx), [transfer.ts](../src/review/transfer.ts), [engine.ts](../src/ink/engine.ts) |
| R02 | 이전 필기와 현재 원문 버전 확인 | 구현 | 버전이 없거나 다른 옛 필기는 위치·문장 확인 후 전송. 최신 main 원문이 다르면 새 캡처 요구 | 입력·버전·재연결 자동 검사 | [transfer.ts](../src/review/transfer.ts), 블로그 [sketch-protocol.mjs](../../imjae.github.io/server/sketch-protocol.mjs) |
| R03 | 미전송 요청 보관·재전송 | 구현 | 기기에 한 개 보관, 설명도 제출 전 저장. 같은 ID 재전송 지원. 여러 요청의 오프라인 대기열은 없음 | UI 저장 확인 응답·서버 중복 접수 검사. 기기 강제 종료 복구는 검증 대기 | [ReviewPanel.tsx](../src/review/ReviewPanel.tsx), 블로그 [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs) |
| R04 | GitHub 소유자 로그인 | 구현 | 기존 소유자 한 명만 접근. 일반 사용자 가입·계정별 저장소 설정 없음 | 인증 자동 검사·운영 서버 비로그인 차단 확인. 새 APK 로그인은 검증 대기 | [ReviewPanel.tsx](../src/review/ReviewPanel.tsx), 블로그 [author-auth.mjs](../../imjae.github.io/server/author-auth.mjs) |
| R05 | 요청 보관·작업 임대·진행 상태 | 구현 | SQLite Durable Object, 실행기 한 작업씩 처리, 만료된 임대 회수 | 서버 상태 자동 검사·실행기 연결 확인 | 블로그 [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs), [main.mjs](../runner/main.mjs) |
| R06 | 추가 요청·폐기·자료 삭제 | 구현 | 허용된 상태에서만 재수정·폐기·삭제. 재수정은 이전 승인 무효화. 배포 중 폐기는 불가 | 서버 상태·검토 UI 자동 검사 | 블로그 [sketch-ui.mjs](../../imjae.github.io/server/sketch-ui.mjs), [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs) |

### AI 수정·검토·배포

| ID | 기능 | 구현 상태 | 현재 범위·제한 | 확인한 범위 | 관련 코드 |
| --- | --- | --- | --- | --- | --- |
| A01 | 대상 주소에서 실제 원본 찾기 | 구현 | 공개 Markdown 글 또는 크래프톤 포트폴리오의 합성 문구. 소유자 편집 주소는 공개 대상으로 정규화 | 원본 조회 단위 검사·실제 글/포트폴리오 조회. 설치 0.2.1은 글 전용 | 블로그 [sketch-target.mjs](../../imjae.github.io/scripts/sketch-target.mjs) |
| A02 | 이미지·문맥을 이용한 AI 수정안 | 구현 | PC Codex CLI가 문장 교체 JSON 또는 질문 반환. AI에게 파일 수정·배포 도구를 제공하지 않음 | 실제 이미지 입력 AI 호출·수정안 생성. 다양한 실제 손글씨 해석은 추가 확인 필요 | [core.mjs](../runner/core.mjs), [main.mjs](../runner/main.mjs) |
| A03 | 대상 문구만 적용·변경 범위 검사 | 구현 | 글은 본문 문자열 교체. 포트폴리오는 기존 키·원문이 일치하는 600자 이하 문구를 새 JSON 한 개로 저장. 메타데이터·다른 파일·HTML·새 외부 URL 거절 | 교체 범위 단위 검사·격리 작업 공간에서 실제 AI 글/포트폴리오 수정 | [core.mjs](../runner/core.mjs), [main.mjs](../runner/main.mjs), 블로그 [sketch-portfolio.server.mjs](../../imjae.github.io/src/lib/sketch-portfolio.server.mjs) |
| A04 | 블로그 빌드·사이트·화면 검사 | 구현 | 전체 사이트 검사, 보호된 편집 빌드, 수정 글·Home·긴 글·모바일 검색 검사 | 실제 AI 수정안에 검사 수행 | [main.mjs](../runner/main.mjs), [preview.mjs](../runner/preview.mjs) |
| V01 | 변경 비교·글 미리보기 | 구현 | 실제 빌드의 정적 HTML. CSS·렌더된 도표 포함, 영상·스크립트·페이지 이동 제외 | 실제 수정 미리보기의 데스크톱·모바일 표시 및 sandbox 자동 검사 | [preview.mjs](../runner/preview.mjs), 블로그 [sketch-ui.mjs](../../imjae.github.io/server/sketch-ui.mjs) |
| V02 | 사용자 승인 | 구현 | 확인 체크박스 후 승인. 해당 세대·커밋·미리보기·diff에 묶임. 24시간 유효 | 무승인·오래된 승인 거절 및 UI 자동 검사. 실제 글에 대한 사용자 승인은 아직 없음 | 블로그 [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs), [sketch-ui.mjs](../../imjae.github.io/server/sketch-ui.mjs) |
| D01 | 승인한 커밋만 main 반영 | 구현 | 커밋·원문·diff·미리보기 재확인 후 일반 push. 경쟁 변경 시 중단 | 승인·경쟁 변경 상태 검사. 실제 글 승인 후 push는 실사용 검증 대기 | [main.mjs](../runner/main.mjs) |
| D02 | 두 서버 배포·실제 글 확인 | 구현 | 동일 커밋의 Pages·편집 서버 Actions 및 양쪽 원문 해시 확인 후 완료 | 기반 서버 배포·실제 버전 대조 확인. 사용자 글의 승인 배포 전체 경로는 검증 대기 | [main.mjs](../runner/main.mjs), 블로그 [deploy.yml](../../imjae.github.io/.github/workflows/deploy.yml), [authoring.yml](../../imjae.github.io/.github/workflows/authoring.yml) |

### 운영과 앱 빌드

| ID | 기능 | 구현 상태 | 현재 범위·제한 | 확인한 범위 | 관련 코드 |
| --- | --- | --- | --- | --- | --- |
| O01 | PC 실행기 시작·중지·연결 복구 | 구현 | 숨겨진 프로세스, DPAPI 자격 증명, 개인 작업 폴더. 재부팅 후 수동 시작 | 실제 시작·중지·재연결 확인 | [setup.mjs](../runner/setup.mjs), [launch.mjs](../runner/launch.mjs), [start.ps1](../runner/start.ps1) |
| O02 | 요청 용량·보관 기간 제한 | 구현 | 요청 100개, 이미지 base64 4MB, 설명 4,000자. 완료·폐기·실패 자료 30일 정리. PC 자료 자동 정리는 없음 | 용량·분할 파일 해시 검사. 30일 운영 경과 확인은 아님 | 블로그 [sketch-protocol.mjs](../../imjae.github.io/server/sketch-protocol.mjs), [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs) |
| O03 | 요청할 때만 앱 빌드 | 설정 변경 | 프로젝트 규칙에 명시. 현재 작업 브랜치와 원격 main의 APK 워크플로는 수동 실행만 사용 | 작업 브랜치 `c71781f`, main `fcf57b4` 반영. 0.2.1은 사용자 요청에 따른 workflow_dispatch 실행 | [AGENTS.md](../AGENTS.md), [android-apk.yml](../.github/workflows/android-apk.yml) |

## UI/UX 구현 현황과 개선 기준

읽기·필기 화면은 서재, 주소창, 도구막대, 저장 상태를 갖춘 형태다. AI 검토 화면은 변경 비교·글 미리보기·보낸 필기 탭과 하단 승인 영역으로 구성한다. 아래의 **현재 UI**는 구현된 내용이며, **다음 개선·완료 기준**은 남은 작업이다. 브라우저 검사와 실제 태블릿의 사용성 확인은 구분한다.

| ID | 화면·사용 경험 | 현재 UI | 다음 개선·완료 기준 | 관련 위치 |
| --- | --- | --- | --- | --- |
| U01 | 읽기·필기 | 크림색·초록색 중심. 넓은 화면은 왼쪽 서재, 좁은 화면은 서랍. 상단 도구막대 접기·전체화면, 하단 저장 상태 제공 | Galaxy Tab 가로·세로에서 글 영역과 도구 크기를 확인하고, 손가락·펜으로 도구를 쉽게 선택할 수 있는지 검증 | B02, N01~N05, [App.tsx](../App.tsx) |
| U02 | 수정 요청 진입 | 일부 구현: 글·크래프톤 포트폴리오 지원. 대상 밖 화면·로딩·복원 이유 표시, 눌렀을 때 안내, 공개 글 목록 이동 제공 | 타입·단위 23개 검사 통과. 새 APK 미빌드로 설치 0.2.1에는 확장·안내가 없음. 미전송·검토 대기 배지는 남음 | R01~R03, [App.tsx](../App.tsx), [availability.ts](../src/review/availability.ts) |
| U03 | 캡처 확인·전송 | 전체화면 검토 창에서 소유자 로그인 후 캡처 이미지·설명 입력·전송 취소 제공 | 처음 로그인하는 흐름에서도 캡처가 보관됐음을 안내. 대상 글·보내는 화면을 확인하고 전송 완료를 분명히 알 수 있도록 정리 | R01~R04, [ReviewPanel.tsx](../src/review/ReviewPanel.tsx), 블로그 [sketch-ui.mjs](../../imjae.github.io/server/sketch-ui.mjs) |
| U04 | 요청 목록·진행 상태 | 상태와 제목을 버튼 목록으로 표시. PC 연결 여부·작업 상태를 8초마다 갱신. 선택한 상세가 같은 페이지에 표시됨 | `접수 → 수정·검사 → 검토 대기 → 배포 → 완료` 단계 표시. PC 대기와 오류를 구분하고, 사용자가 지금 해야 할 행동을 함께 안내 | R05, O01, 블로그 [sketch-ui.mjs](../../imjae.github.io/server/sketch-ui.mjs) |
| U05 | 변경 내용·미리보기 | 구현: 변경 비교·글 미리보기·보낸 필기 탭. 900px 이상은 수정 전후 나란히, 좁은 화면은 전환. 변경 위치 선택·이전/다음 제공. 원본 diff는 접힌 상세. 미리보기는 독립 스크롤 영역 | 브라우저의 가로·세로·좁은 화면 검사 통과. 실제 Galaxy Tab에서 회전·펜 조작 확인은 남음. Markdown 문법은 평문으로 보존하며 렌더된 글은 미리보기에서 확인 | V01, 블로그 [sketch-ui-client.mjs](../../imjae.github.io/server/sketch-ui-client.mjs), [sketch-diff.mjs](../../imjae.github.io/server/sketch-diff.mjs) |
| U06 | 추가 수정·승인 | 구현: 하단에 확인 체크·승인·추가 수정 버튼 유지. 추가 요청은 별도 입력 화면, 승인 대상 버전 검증 유지. 상태 조회만으로 입력·스크롤·체크가 초기화되지 않음 | 브라우저에서 긴 비교·화면 축소·입력 보존·명시적 승인 검사 통과. 새 수정안은 확인 상태를 초기화. 문장별 선택은 별도 X05 범위 | R06, V02, 블로그 [sketch-ui-client.mjs](../../imjae.github.io/server/sketch-ui-client.mjs) |
| U07 | 오류·복구 | 앱 오류 막대, 검토 창 오류 문구, 서버의 실패·재캡처 상태 표시. 앱의 캡처 오류도 공통 `다시 시도` 경로에서 페이지를 새로고침함 | 캡처 실패는 재캡처, 로그인 실패는 로그인, PC 연결 대기는 대기 안내처럼 원인별 다음 행동 연결. 전송·재시도 후 중복 요청이나 필기 손실이 없어야 함. 배포 복구 기능은 X11과 연결 | R03~R06, X11, [App.tsx](../App.tsx), [ReviewPanel.tsx](../src/review/ReviewPanel.tsx) |
| U08 | 배포 완료·읽기 복귀 | `공개 글 열기` 제공. 앱의 검토 WebView에서 공개 블로그 링크는 외부 브라우저로 열림 | 앱 안의 해당 글로 돌아가 최신 글을 확인하는 동선 검토. 기존 필기의 원문 버전·위치가 달라졌다면 사용자에게 표시 | D02, N06, [ReviewPanel.tsx](../src/review/ReviewPanel.tsx) |
| U09 | 시각적 일관성·버전 표시 | 일부 구현: 검토 화면은 크림색·초록색과 공통 CSS 변수 사용. 앱 하단 버전은 app.json에서 표시 | 읽기 화면과 검토 화면 사이의 완전한 디자인 토큰 공유는 남음 | [App.tsx](../App.tsx), 블로그 [sketch-ui-style.mjs](../../imjae.github.io/server/sketch-ui-style.mjs) |
| U10 | 태블릿·접근성 | 일부 구현: 검토 버튼 최소 높이 48px, 비교 본문 17px. 탭 키보드 조작·포커스 표시·작은 높이 대응. 앱 검토 창은 SafeAreaView와 48px 헤더 버튼 사용 | 1280×800, 800×1280, 1024×600, 390×844 브라우저 배치 검사. 실제 기기의 글자 확대·키보드·회전·시스템 영역 확인은 남음. 읽기 화면의 작은 보조 글자는 별도 개선 대상 | X01, [ReviewPanel.tsx](../src/review/ReviewPanel.tsx), 블로그 [sketch-ui-style.mjs](../../imjae.github.io/server/sketch-ui-style.mjs) |

### 권장 화면 구성과 작업 순서

1순위 검토 화면 개선은 구현했다. 요청 목록은 넓은 화면에서 왼쪽, 좁은 화면에서 목록 버튼으로 연다. 2·3순위 전송·진행·복구 기능의 추가 개선은 남아 있다.

| 순서 | 개선 작업 | 사용자가 바로 알 수 있어야 할 것 |
| --- | --- | --- |
| 1 · 구현 | U05~U06 검토 화면: 수정 전후 비교·글 미리보기·추가 요청·승인 동작 정리 | 어디가 어떻게 바뀌었고, 어떤 수정안을 승인하는지 |
| 2 | U02~U04 전송·요청 화면: 캡처 확인·접수 결과·단계별 상태 정리 | 무엇을 보냈고, 지금 어느 단계이며, 내 확인이 필요한지 |
| 3 | U07~U08 복구·완료 화면: 상황별 다음 행동과 글 복귀 연결 | 문제가 생겼을 때 무엇을 하면 되고, 배포된 글을 어디서 확인하는지 |
| 병행 | U01·U09·U10 공통 UI와 실물 확인 | 읽기·필기·검토 화면이 일관되고 태블릿에서 편하게 조작되는지 |

검토 UI는 실제 서버 처리 코드와 메모리 테스트 요청으로 브라우저 검사했다. Worker 배포용 번들에서도 같은 검사를 수행했다. 예제 수정안만 사용했으며 실제 공개 글을 승인·게시한 검사는 아니다. 실제 Galaxy Tab의 새 로그인·필기 전송·승인 사용성 확인은 남아 있다.

### 0.2.1 실사용 진입 문제 점검

사용자가 `/portfolio/krafton-2027/?edit=1`에서 전송 버튼의 무반응을 보고했다. 현재 지원 대상은 공개 `/writing/<slug>/` 본문이므로 포트폴리오는 전송되지 않는다. `?edit=1` 자체는 공개 글의 전송을 막지 않는다. 기존 UI는 이유를 표시하지 않은 채 클릭만 비활성화했다.

최초 진단 뒤 대상·로딩 상태 안내를 추가했다. 이어 사용자 요청으로 아래 포트폴리오 지원을 구현했다. 현재 설치된 0.2.1은 공개 글 전용이며, 확장 소스의 새 APK는 별도 빌드 요청 때 만든다.

### 포트폴리오 필기 수정 확장

| ID | 기능 | 구현 상태 | 범위·확인 결과 | 관련 코드 |
| --- | --- | --- | --- | --- |
| P01 | 공개·편집 주소의 포트폴리오 캡처 | 구현 | `/portfolio/krafton-2027/`와 고정 소유자 origin 지원. 쿼리·fragment 정규화, 표시 문구 문맥·합성 원문 해시 사용. 설치 0.2.1 미포함 | [contract.ts](../src/review/contract.ts), [engine.ts](../src/ink/engine.ts), 블로그 [sketch-target.mjs](../../imjae.github.io/server/sketch-target.mjs) |
| P02 | 미저장 직접 편집 감지 | 구현 | 미저장 문구가 있으면 캡처 거절. 캡처 중 직접 편집이 생겨도 일관성 검사 실패. 브라우저 검사 통과 | [engine.ts](../src/ink/engine.ts), 블로그 [portfolio-copy-editor.ts](../../imjae.github.io/src/scripts/portfolio-copy-editor.ts) |
| P03 | 문구 키 기반 AI 수정·비교 | 구현 | 기존 키·원문 확인 후 새 JSON 한 개만 추가. 기본 문구·기존 기록·영상·순서 보존. 실제 AI 한 문구 시험 수정·전체 사이트 검사·미리보기 생성 통과. 문구별 전후 비교 제공 | 블로그 [sketch-portfolio.server.mjs](../../imjae.github.io/src/lib/sketch-portfolio.server.mjs), [main.mjs](../runner/main.mjs) |
| P04 | 포트폴리오 승인·배포 버전 확인 | 구현 | 기존 승인·경쟁 main 검사에 파일/합성 문구 해시와 양쪽 배포 확인 연결. 메모리 요청 승인, 실제 격리 결과 검증·변조/무승인 거절 통과. 실제 소유자 승인 배포는 검증 대기 | [main.mjs](../runner/main.mjs), 블로그 [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs) |

앱 타입·단위 23개, 블로그 전체 검사 114개·Astro 오류 0개·128개 HTML 검사, 보호된 빌드, 실제 Worker 번들의 글/포트폴리오 검토 E2E를 통과했다. 실제 AI 시험 커밋은 격리 작업 공간의 `9abb016`이며 공개하지 않았다. 기본 문구와 공개 포트폴리오는 그대로다. 서버 `38bf66d`의 Pages·편집 Worker 배포 성공과 공개/편집 원문 해시 일치를 확인하고 PC 실행기를 새 코드로 재시작했다. 새 APK 빌드·실물 태블릿 확인은 수행하지 않았다.

## 확장할 때 바꿀 위치

실선은 현재 연결, 점선은 미구현 확장 후보다. 공통 요청 처리기·모델 어댑터·저장소 어댑터가 이미 추상화되어 있다는 뜻은 아니다. 현재 코드에는 전용 블로그 주소·원본 경로·서버가 고정되어 있다.

```mermaid
flowchart TD
    INK[브라우저 · 필기] --> CAP[화면 캡처]
    CAP --> SEND[전송 · 보관]
    SEND --> BLOG[블로그 원문 조회]
    BLOG --> AI[AI 수정 제안]
    AI --> REVIEW["검사 · 미리보기<br/>사용자 승인"]
    REVIEW --> DEPLOY[승인 커밋 배포]

    INK -.-> ANCHOR["X12 · X14<br/>앵커 · 부분 지우기"]
    CAP -.-> REGION["X02 · X03<br/>영역 선택 · 여러 화면"]
    SEND -.-> SHARE["X06<br/>이미지 · PDF 공유"]
    SEND -.-> ASK["X07<br/>AI 질문 · 요약"]
    BLOG -.-> TARGET["X08<br/>다른 저장소"]
    AI -.-> MODEL["X15<br/>AI 실행 방식 교체"]
    REVIEW -.-> PART["X05<br/>문장별 수정 선택"]
```

| ID | 상태 | 확장할 기능 | 연결되는 기존 기능 | 시작할 위치 | 완료 확인 기준 |
| --- | --- | --- | --- | --- | --- |
| X01 | 검증 대기 | Galaxy Tab에서 전체 흐름 확인 | R01~R04, V02, D01~D02 | 현재 앱·검토 화면 | 실물 캡처·로그인·재시도 후 사용자가 실제 수정안을 승인하고 두 서버 반영 확인. 앱 빌드는 별도 요청 때만 |
| X02 | 미구현 후보 | 캡처 영역 선택 | R01 | `BrowserSurface`·`transfer.ts`·전송 UI | 선택한 영역만 이미지·문맥에 포함되고 스크롤·확대 후에도 범위 일치 |
| X03 | 미구현 후보 | 여러 화면을 한 요청에 첨부 | R01~R03, A02 | `Transfer`·서버 입력 규격·`askCodex` | 같은 글의 캡처를 순서대로 보관·미리보기하고 이미지와 수정 위치의 연결 유지 |
| X04 | 미구현 후보 | 여러 미전송 요청·오프라인 재시도 | R03, R05 | `ReviewPanel` 보관 파일 구조 | 여러 요청이 앱 재시작 후 남고 개별 재전송 시 중복 접수 없음 |
| X05 | 미구현 후보 | 문장별 수정 선택 | A03, V01~V02 | 교체 JSON·변경 비교 UI·승인 규격 | 선택한 변경만 적용하고 새 커밋·미리보기로 재검사·재승인 |
| X06 | 미구현 후보 | 필기 이미지·PDF 내보내기 | N05, R01 | 캡처·기기 파일·Android 공유 | 원문 주소·필기가 포함된 파일을 AI 계정 연결 없이 저장·공유 |
| X07 | 미구현 후보 | 일반 페이지에서 AI 질문·요약 | R01, A02 | 캡처 제한·요청 유형·응답 UI | 페이지 수정 권한 없이 이미지와 질문을 전달하고 답변 확인. 계정·비용 연결 방식도 별도 결정 |
| X08 | 미구현 후보 | 다른 블로그·저장소·페이지 유형 | A01, D01~D02 | 고정 URL·원본 조회·검사·배포 경로 분리 | 대상마다 원본 조회·허용 파일·검사·미리보기·승인 배포 규칙을 명시하고 오적용 차단 |
| X09 | 미구현 후보 | PC 실행기 자동 시작 | O01 | 실행기 수명 관리 | 사용자가 켜고 끌 수 있고, 재부팅 후 중복 프로세스 없이 연결 복구 |
| X10 | 미구현 후보 | 수정 완료·배포 실패 알림 | R05, D02 | 서버 상태·앱 알림 | 사용자가 알림을 켜고 끌 수 있으며, 해당 요청의 실제 상태와 일치하는 알림을 한 번 전달 |
| X11 | 미구현 후보 | 실패한 배포 복구 UI | D01~D02 | 검토 UI·실행기·Actions 확인 | 재시도는 승인한 버전을 유지하고, 앞선 main을 덮어쓰지 않음 |
| X12 | 미구현 후보 | 글자 단위 필기 위치 보정 | N06 | 저장 모델·앵커 알고리즘 | 문단 편집·화면 회전 뒤 위치를 확인하고, 모호한 연결은 표시 |
| X13 | 미구현 후보 | 필기 백업·복원 | N05 | 저장소·서재 UI | 원본 파일에서 획·주소·버전을 복원하고 다른 URL의 필기와 섞이지 않음 |
| X14 | 미구현 후보 | 획 부분 지우개 | N01, N04 | 필기 엔진·획 저장 모델 | 닿은 구간만 지워지고 실행 취소 시 원래 획·압력·앵커 복원 |
| X15 | 미구현 후보 | AI 실행 방식 교체 | A02~A03 | `askCodex`와 교체 제안 계약의 분리 | 선택한 실행 방식이 동일한 결과 규격을 반환하고, 변경 범위 검사·사용자 승인 규칙을 유지 |

## 다음 기능을 추가하는 형식

아래 한 행을 해당 표에 추가한다. 먼저 사용자 경험과 완료 조건을 적고, 구현 뒤 코드 위치와 실제 확인 결과를 채운다. ID는 다른 기능에 재사용하지 않는다.

| ID | 기능 | 구현 상태 | 현재 범위·제한 | 확인한 범위 | 관련 코드 |
| --- | --- | --- | --- | --- | --- |
| 새 ID | 사용자가 할 수 있게 될 행동 | 미구현 후보 / 작업 중 / 구현 | 이번 작업에서 지원할 범위 | 미확인 → 확인한 방법·결과 | 실제 구현 후 연결 |

- 요청 예: “X02 영역 선택부터 구현해 줘. 앱 빌드는 하지 마.”
- 구현 후에는 표의 상태·제한·검증 범위와 영향받은 흐름도를 함께 갱신한다.
- APK/AAB 빌드, 설치 확인, 블로그 글 배포를 각각 구분한다. 코드가 바뀌었다고 앱을 자동으로 빌드하거나 글을 승인 없이 게시하지 않는다.

## 근거와 관리 범위

앱 저장소는 `D:/dev/SketchBrowser`, 블로그 저장소는 `D:/dev/imjae.github.io`다. 위 코드 링크는 두 저장소가 나란히 있는 현재 배치를 기준으로 한다.

최초 연동 구현에서 앱 타입·단위 검사 18개, 기존 브라우저 E2E 4개 스크립트와 검토 흐름 E2E, Android 입력 검사, 블로그 검사 93개 및 실제 AI 시험 수정·미리보기 검사를 수행했다. 기존 S Pen 수정은 사용자가 잘 된다고 확인했다. 이번 UI 개선의 확인 범위는 아래와 같다.

### 0.2.1 UI 개선 검증·배포

- 앱 타입 검사·단위 18개, 블로그 `npm run verify` 테스트 96개·Astro 오류 0개·122개 경로·128개 HTML 검사와 보호된 편집 빌드를 통과했다. Home·긴 글·모바일 검색도 확인했다.
- 검토 E2E는 실제 처리 코드와 메모리 요청으로 1280×800·800×1280·1024×600·390×844 배치, 800×420 입력 화면, 변경 이동·전후 전환·고정 승인 영역·sandbox를 확인했다. 실패 후 입력 유지, 재수정 후 승인 초기화와 새 결과 승인도 확인했다. Worker의 실제 배포용 번들로도 통과했다.
- [APK 수동 빌드](https://github.com/imjae/SketchBrowser/actions/runs/40165495721)가 성공했다. 앱 소스는 `c71781f38282c8dd074afd1c650d70cb6dcf6d21`, 버전 `0.2.1`, versionCode `7`, 패키지 `com.sketchbrowser.app`이다. Android/Samsung 입력 검사, APK v2 서명 검사, ARM64·ARMv7 라이브러리와 내장 JS 번들을 확인했다.
- 받은 APK는 `dist/apk/0.2.1/SketchBrowser-0.2.1-test.apk`, 40,548,130 bytes다. SHA-256 `58e55b07083bf692da6c8246dd2422672f01e51a506e8d23237f29dcdcc7e912`가 빌드 산출물 기록과 일치한다. 테스트 키 서명이며 실물 설치·조작은 별도 확인 대상이다.
- 블로그 `8a6707dbee4fd77f08258293c4985b5bfa22ae2f`의 [검토 서버](https://github.com/imjae/imjae.github.io/actions/runs/40165588943)·[Pages](https://github.com/imjae/imjae.github.io/actions/runs/40165588966) 배포가 성공했다. 비로그인 검토 HTML은 로그인으로 이동하고 API는 401이다. 공개 예시 글의 원문 해시와 관리 UI 제외를 확인했다. 공개 글 본문 변경이나 실제 사용자 요청의 승인 배포는 수행하지 않았다.

HTTP 입력은 앱의 [transfer.ts](../src/review/transfer.ts)와 블로그의 [sketch-protocol.mjs](../../imjae.github.io/server/sketch-protocol.mjs), 운영 상태 전이는 [sketch-review.mjs](../../imjae.github.io/server/sketch-review.mjs)가 기준이다. `contract.ts`의 `RevisionRequest`와 `workflow.ts`는 초기 설계의 참조 모델이다. 확장할 때 이 참조 모델만 바꾸고 실제 앱·서버 계약을 그대로 두지 않도록 주의한다.

운영 방법과 현재 제한은 [블로그 수정 흐름](blog-review-flow.md)을 함께 확인한다. 이 표의 확장 후보를 선택했다고 구현이나 배포가 자동으로 시작되지는 않는다.
