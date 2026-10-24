# SketchBrowser

웹페이지 위에 손글씨, 밑줄, 형광펜을 남기고 페이지별로 저장하는 Android 태블릿 브라우저의 첫 버전입니다. React Native + Expo + 네이티브 WebView로 만들었습니다. iPad용 화면과 필기·저장 로직도 같은 코드를 재사용하도록 구성했지만, 현재 검증 대상은 Android입니다.

## 실행하기

Node.js 22.13 이상과 pnpm 11을 사용합니다.

```powershell
pnpm install
pnpm start
```

Android 태블릿에 **Expo Go**를 설치하고 PC와 같은 Wi-Fi에 연결한 뒤, 터미널의 QR 코드를 Expo Go에서 스캔하세요. 프로젝트는 Expo SDK 57을 사용합니다. QR 연결이 안 되면 PC 방화벽의 Node.js 로컬 네트워크 허용 여부를 확인하세요.

Android SDK·에뮬레이터 또는 USB 디버깅 기기가 준비되어 있다면 `pnpm android`로 실행할 수도 있습니다. 네이티브 개발 빌드는 `pnpm exec expo run:android`를 사용합니다.

```powershell
pnpm web
```

웹 미리보기에서는 **시작 노트와 연습 노트**에서 필기를 체험할 수 있습니다. 외부 사이트 열기는 Android 앱의 네이티브 WebView에서 지원합니다. 일반 웹브라우저의 iframe 정책을 우회하는 프록시는 사용하지 않습니다. 웹과 Android의 필기 저장 공간은 서로 다릅니다.

## 들어 있는 기능

- 주소·검색어 입력, 링크 탐색, 뒤로/앞으로 가기, 새로고침.
- **탐색 / 펜 / 밑줄 / 형광펜 / 지우개** 도구. 지우개는 닿은 획 전체를 지웁니다.
- 5가지 색, 3가지 굵기, 펜 압력 반영, 실행 취소·다시 실행.
- **펜만** 옵션: 손가락·마우스 입력을 필기에서 제외합니다.
- 필기 도구를 사용하다가 **두 손가락을 같은 방향으로 드래그**하면 탐색 모드로 전환하고 바로 스크롤합니다. 진행 중인 획·지우기는 취소하며 기존 필기를 유지합니다. 단순한 두 손가락 터치나 핀치는 전환하지 않습니다.
- 주소창의 **도구 접기·펼치기**로 펜 도구 모음을 숨기고 다시 표시합니다.
- 주소창의 **전체화면** 버튼으로 웹 내용만 표시합니다. 화면의 종료 버튼, PC의 `Esc`, Android의 뒤로 가기로 복귀합니다. 페이지·필기·실행 취소 기록은 유지됩니다.
- 획을 마칠 때마다 AsyncStorage에 자동 저장. 저장 성공·실패 상태와 다시 시도를 표시합니다.
- 서재에서 필기한 페이지를 다시 열기. 앱을 다시 실행해도 해당 URL의 필기가 복원됩니다.
- 스크롤·확대와 문단의 위치 변경을 반영하는 필기 레이어. 가로·세로 태블릿 화면과 접이식 서재를 지원합니다.
- 인터넷 없이도 사용할 수 있는 두 개의 연습 페이지.

## 저장과 위치 보정

기기에 URL별 레코드를 저장하며 서버나 계정은 필요하지 않습니다. 일반 `#section` 링크는 같은 페이지의 필기를 공유하고, 쿼리 문자열과 `#/route`, `#!/route`는 별도 페이지로 구분합니다. 로딩 중에는 필기를 잠가서 기존 기록을 빈 데이터로 덮어쓰지 않습니다. 저장 순서를 직렬화하고, 저장 실패 시 현재 실행 세션의 초안을 유지합니다.

필기는 문서 좌표와 가까운 DOM 요소의 선택자·텍스트·위치를 함께 기록합니다. 문단이 이동하면 위치를 보정합니다. **글자 단위의 텍스트 앵커는 아직 구현하지 않았으므로** 문장이 수정되거나 줄바꿈·DOM 구조가 크게 달라지면 위치가 어긋날 수 있습니다. CSS 변환이 복잡한 페이지, 내부 iframe, PDF, 캔버스 기반 사이트 등은 별도 대응이 필요합니다.

페이지당 최대 600획·24,000개 좌표, 한 획당 최대 6,000개 좌표로 제한합니다. 앱 데이터 삭제나 앱 삭제 시 필기도 삭제되며, 기기 간 동기화·백업·내보내기는 아직 없습니다. 웹사이트에 주입한 필기 레이어는 해당 페이지 스크립트가 읽을 수 있습니다.

HTTP 주소는 기기 또는 Android 네트워크 정책에 따라 차단될 수 있으므로 HTTPS 주소를 권장합니다. 로그인 방식·다운로드·팝업·외부 앱 호출 등은 전용 브라우저 수준의 처리를 아직 제공하지 않습니다.

## 검증

```powershell
pnpm typecheck
pnpm test
pnpm web
# 개발 서버가 실행된 다른 터미널에서:
pnpm test:e2e
pnpm export:android
```

E2E는 기본적으로 설치된 Google Chrome을 사용합니다. Playwright Chromium을 사용하려면 먼저 `pnpm exec playwright install chromium`을 실행하고 PowerShell에서 `$env:PLAYWRIGHT_CHANNEL = 'chromium'`을 설정하세요. `SKETCH_TEST_URL`로 서버 주소를 지정할 수 있습니다.

단위 테스트는 주소 정규화, 브리지 데이터 검증, URL별 저장, 빠른 연속 저장, 저장 실패 후 재시도, 손상된 레코드 격리를 검증합니다. 브라우저 E2E는 필기·저장·복원, 도구 접기, 전체화면 전환과 복귀, 두 손가락 탐색 전환, 전환 중 획·지우기 취소, 펜만 모드와 내부 스크롤 영역을 검증합니다. 화면 캡처는 `test-results/`에 생성됩니다.

`export:android`는 Android용 JavaScript/Hermes 번들 검증이며 **설치 가능한 APK 빌드는 아닙니다**. 이 환경에는 Android SDK·실물 태블릿이 없어 네이티브 WebView, S Pen 지연·압력, 손바닥 차단 동작은 실제 기기에서 추가 검증해야 합니다.

## 태블릿에 APK 설치하기

[GitHub Actions의 Android test APK](https://github.com/imjae/SketchBrowser/actions/workflows/android-apk.yml)에서 최신 성공 실행을 열고, **Artifacts → SketchBrowser-android-test**를 다운로드하세요. ZIP 안의 `SketchBrowser-0.1.1-test.apk`를 태블릿으로 옮겨 실행하면 설치됩니다. 설치 화면에서 요청하는 경우 해당 파일 앱 또는 브라우저의 **이 출처 허용**을 켜 주세요.

이 APK는 앱 코드를 포함하므로 **Expo Go나 PC 개발 서버 없이 실행**됩니다. ARM64·ARMv7 Android 태블릿을 지원하며, 필기는 설치한 앱의 기기에 저장됩니다. 외부 웹페이지를 열 때에는 인터넷이 필요합니다. 서명은 Expo 템플릿의 테스트 키를 사용합니다.

Actions는 `main`의 앱 코드 변경 시 실행되며 **Run workflow**로 수동 실행할 수도 있습니다. APK와 SHA-256 파일, 빌드 정보를 30일간 보관합니다. APK는 Git 소스에 넣지 않습니다.

첫 테스트는 시작 노트에 필기 → 앱 완전히 종료 → 다시 실행해 복원 확인 → 외부 HTTPS 페이지에서 필기 순서로 진행하세요. S Pen 감도·손바닥 입력·회전 후 위치 보정은 실제 태블릿에서 확인해야 합니다.

로컬에 Java 17과 Android SDK 36·NDK 27.1.12297006·CMake 3.22.1이 설치되어 있다면 다음 명령으로 같은 APK를 만들 수 있습니다.

```powershell
pnpm prebuild:android
cd android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
cd ..
node scripts/collect-apk.mjs
```

생성 결과는 `dist/apk/`에 모입니다. 별도로 Expo 계정의 EAS를 사용하려면 `pnpm dlx eas-cli build --platform android --profile preview`를 실행할 수 있습니다. `eas.json`에 APK 미리보기 프로필이 준비되어 있습니다.

## 구조

```text
App.tsx                         태블릿 UI, 주소창, 도구 모음, 서재
src/browser/BrowserSurface.tsx   Android 네이티브 WebView 연결
src/browser/BrowserSurface.web.tsx  자체 문서만 여는 웹 미리보기
src/ink/engine.ts               공통 Canvas 필기·문단 앵커·입력 엔진
src/useNotebook.ts              페이지별 로딩·저장과 브리지 상태 관리
src/storage/notebook.ts         버전이 있는 로컬 저장소와 저장 순서 제어
src/model.ts                    필기 모델과 브리지 데이터 검증
tests/                         단위 테스트와 실제 브라우저 E2E
```

추후 iPad 대응 시 공통 엔진과 저장소를 유지하면서 iOS 빌드 설정, WKWebView 이벤트, Apple Pencil과 손바닥 입력, 핀치 확대 및 회전을 실기기에서 검증하면 됩니다. iOS 로컬 빌드에는 macOS/Xcode가 필요하며 클라우드 빌드는 EAS를 이용할 수 있습니다.

참고: [Expo 프로젝트 실행](https://docs.expo.dev/get-started/start-developing/), [React Native WebView](https://docs.expo.dev/versions/v57.0.0/sdk/webview/), [AsyncStorage](https://docs.expo.dev/versions/latest/sdk/async-storage/).
