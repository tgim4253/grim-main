# Grim Desktop Monorepo (한국어 번역)

> 가상 폴더와 그래프 뷰로 참고 자료를 정리하고, 선택한 이미지를 항상 위에 고정하는 크로키 창으로 크로키 연습을 더욱 효과적으로 할 수 있습니다. 각 드로잉에 노트를 추가하여 피드백을 기록하여 학습에 도움을 줍니다.

---

## 권장 툴체인

- **Node.js 20.x** · .nvmrc 또는 .node-version 파일에 명시된 Node.js 버전과 맞추세요.
  의존성을 설치하기 전에 nvm use(혹은 asdf를 사용한다면 해당 명령어)를 실행하여 환경을 정렬해야 합니다.
- **pnpm 10.13.1** · 루트 `packageManager` 필드에 고정된 워크스페이스 패키지 매니저
- **Tauri CLI ^2.7.1 & Rust Toolchain** · 데스크톱 번들 빌드 및 Rust 명령 실행에 필요

---

## 프로젝트 주요 기능

- **크로스 플랫폼 데스크톱**: Tauri + Rust로 가볍고 안전한 런타임 제공
- **React 19 UI**: React, TypeScript, Tailwind CSS 기반으로 빠르고 반응성 높은 인터페이스
- **공유 상태 관리**: `@tgim/stores`의 Zustand 스토어로 여러 앱 동기화
- **모듈형 아키텍처**: UI, 훅, 유틸리티, 드래그앤드롭 헬퍼, 타입을 `packages/*` 아래에 조직화

---

## 저장소 구조

```
apps/desktop/        # Tauri 프론트엔드와 Rust 백엔드
apps/api-server/     # API 서버 리소스
packages/ui          # 공유 UI 컴포넌트
packages/stores      # 글로벌 Zustand 스토어
packages/hooks       # 커스텀 React 훅
packages/utils       # 유틸리티 함수와 헬퍼
packages/dnd         # Drag & Drop 헬퍼
packages/types       # 공유 타입 정의 및 모델
scripts/             # 번역 및 자동화 스크립트
```

---

## 빠른 시작

1. **의존성 설치**
   ```bash
   pnpm install
   ```
2. **데스크톱 개발 서버 실행**
   ```bash
   pnpm dev
   ```
   > 내부적으로 `pnpm --filter @grim/desktop dev` 실행
3. **프로덕션 빌드 생성**
   ```bash
   pnpm --filter @grim/desktop build
   ```
4. **Tauri 번들 생성**
   ```bash
   pnpm --filter @grim/desktop tauri build
   ```

---

## 루트 스크립트 명령어

| 명령어              | 설명                                                 |
| ------------------- | ---------------------------------------------------- |
| `pnpm dev`          | 데스크톱 개발 서버 실행 (`@grim/desktop dev` 프록시) |
| `pnpm build:front`  | React/Vite 정적 프론트엔드 빌드 생성                 |
| `pnpm build`        | `tauri build` 실행으로 전체 데스크톱 앱 번들링       |
| `pnpm tauri`        | 임의의 `tauri` CLI 명령어 실행 헬퍼                  |
| `pnpm lint:ts`      | TypeScript 소스에 ESLint 실행 및 자동 수정           |
| `pnpm lint:rs`      | Rust 백엔드에 `cargo clippy` 실행                    |
| `pnpm lint`         | TS와 Rust 린트 실행                                  |
| `pnpm lint:fix`     | TS 린트 자동 수정 + Rust `--fix` 린트 실행           |
| `pnpm lint:check`   | 자동 수정 없는 ESLint 실행                           |
| `pnpm format`       | Prettier + `cargo fmt --check` 실행                  |
| `pnpm format:write` | Prettier + `cargo fmt`로 코드 포맷팅 적용            |
| `pnpm translate`    | `scripts/translator.mjs`로 로케일 JSON 갱신          |

---

## 품질 체크리스트

| 목표                   | 명령어                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| ESLint 규칙 강제       | `pnpm lint:check`                                                                                     |
| 워크스페이스 포맷 적용 | `pnpm format:write`                                                                                   |
| Rust 포맷 & 린트 실행  | `cargo fmt --all` & `cargo clippy --all-targets -- -D warnings` (실행 위치: `apps/desktop/src-tauri`) |

---

## 개발 팁

- `apps/desktop/src/features` 안에서 기능 중심(feature-first) 구조 유지
- `@tgim/stores`를 확장하여 상태 관리 (중복 스토어 생성 금지)
- UI 컴포넌트는 `packages/ui/src/index.ts`에서 내보내고, Tailwind 클래스는 디자인 토큰과 일치시키기
- 사용자 노출 문자열 수정 시 `scripts/translations.xlsx` 갱신 후 `pnpm translate` 실행

---

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Tailwind CSS
- **데스크톱 셸**: Tauri, Rust, SQLx
- **로컬라이제이션**: i18next + 자동 번역 파이프라인 (`scripts/translator.mjs`)

---

## 기여하기

커밋 규칙 및 기여 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고

---

## 라이선스

본 프로젝트는 [LICENSE](./LICENSE) 조건에 따라 라이선스가 부여됩니다.

---
