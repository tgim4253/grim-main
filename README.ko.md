# Grim Desktop Monorepo (한국어 번역)

> 현재 앱은 **단일 라이브러리 기반 크로키 앱** 방향으로 정리되고 있습니다. 레퍼런스 에셋, 가상 폴더, 태그, 기록, 세션 중심으로 동작합니다. 자세한 변경 요약은 [docs/croquis-library-refactor.md](./docs/croquis-library-refactor.md)를 참고하세요.

---

## 권장 툴체인

- **Node.js 20.x** · .nvmrc 또는 .node-version 파일에 명시된 Node.js 버전과 맞추세요.
  의존성을 설치하기 전에 nvm use(혹은 asdf를 사용한다면 해당 명령어)를 실행하여 환경을 정렬해야 합니다.
- **pnpm 10.13.1** · 루트 `packageManager` 필드에 고정된 워크스페이스 패키지 매니저
- **Tauri CLI ^2.7.1 & Rust Toolchain** · 데스크톱 번들 빌드 및 Rust 명령 실행에 필요

---

## 프로젝트 주요 기능

- **크로스 플랫폼 데스크톱**: Tauri + Rust로 가볍고 안전한 런타임 제공
- **크로키 전용 흐름**: 다중 프로젝트 대신 단일 라이브러리 구조로 자료/기록/세션 관리
- **React 19 UI**: React, TypeScript, 디자인 토큰 기반 CSS 구조
- **앱 내부 구조 중심 아키텍처**: 페이지/피처/엔티티/공유 계층이 `apps/desktop/src` 안에 직접 정리됨

---

## 저장소 구조

```
apps/desktop/        # Tauri 프론트엔드와 Rust 백엔드
scripts/             # 번역 및 자동화 스크립트
docs/                # 프로젝트 문서와 리팩토링 노트
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
| `pnpm ui:demo`      | 분리된 라이브러리 데모 페이지 엔트리 실행            |
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
- 재사용 코드는 우선 `apps/desktop/src/shared` 안에서 정리하기
- 훅, 유틸, 타입은 별도 패키지보다 앱 내부 구조에서 먼저 관리하기
- 사용자 노출 문자열 수정 시 `scripts/translations.xlsx` 갱신 후 `pnpm translate` 실행

---

## 기술 스택

- **프론트엔드**: React 19, TypeScript, 디자인 토큰 기반 CSS
- **데스크톱 셸**: Tauri, Rust, SQLx
- **로컬라이제이션**: i18next + 자동 번역 파이프라인 (`scripts/translator.mjs`)

---

## 기여하기

커밋 규칙 및 기여 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고

---

## 라이선스

본 프로젝트는 [LICENSE](./LICENSE) 조건에 따라 라이선스가 부여됩니다.

---
