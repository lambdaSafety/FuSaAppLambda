# GitHub Pages 배포 방법

## FuSaAppLambda 배포

FuSaAppLambda는 `docs/index.html`이 같은 폴더의 CSS·JavaScript를 불러오는 정적 사이트다. 이 폴더에 로그인과 작업공간, SysML 편집기, 지수 분포와 FTA 기본사상 계산기가 있다. `docs/`를 별도 빌드 없이 게시할 수 있다. [현재 구현 범위](./system_definition.md) · [SysML 기능 안내](./feature01_sysml.md)

1. `main` 브랜치에 `docs/` 전체를 올린다. GitHub 웹에서는 **Code → Add file → Upload files**에서 폴더를 끌어다 놓고 `docs/index.html`과 `docs/sysml-*.js`, `docs/sysml-*.css`가 업로드 목록에 표시되는지 확인한 뒤 커밋한다. [FuSaAppLambda 저장소](https://github.com/lambdaSafety/FuSaAppLambda)
2. **Settings → Pages → Build and deployment**에서 아래 값을 선택하고 **Save**를 누른다.

   | 항목 | 설정 |
   |---|---|
   | Source | **Deploy from a branch** |
   | Branch | **`main`** |
   | Folder | **`/docs`** |

3. **Actions**에서 배포 성공을 확인하고, **Settings → Pages**의 **Visit site**로 접속한다. 이후 게시 소스인 `main`의 `docs/`에 변경 사항을 올리면 다시 배포된다. [예상 사이트 주소](https://lambdasafety.github.io/FuSaAppLambda/) · [GitHub Pages 게시 소스 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
4. 로그인에 사용하는 Supabase 프로젝트에 저장 마이그레이션을 적용한다. 배포 URL에서 로그인하고 프로젝트 저장과 재로그인 복원을 확인한다. [Supabase 설정 및 점검](./GitHubPage_Subbase.md#4-sysml-프로젝트-저장과-접근-제어)

로컬 작업공간의 SysML 편집과 JSON 저장·열기를 브라우저에서 검증했다. FuSaAppLambda 원격 Pages 게시 상태와 운영 Supabase 저장·복원은 확인이 남아 있다.

## safetyCalculator 배포

safetyCalculator는 별도 Vite 프로젝트다. 당시 `gh-pages` 브랜치에 이미 빌드된 `index.html`과 `assets/`가 있어서 해당 브랜치를 다시 게시해 빈 화면을 해결했다.

| 항목 | 실제 적용한 설정 |
|---|---|
| Source | **Deploy from a branch** |
| Branch | **`gh-pages`** |
| Folder | **`/ (root)`** |

[배포 실행 #11](https://github.com/lambdaSafety/safetyCalculator/actions/runs/45623451786)의 성공을 확인했다. [공개 사이트](https://lambdasafety.github.io/safetyCalculator/)에서 시작 화면이 열렸고 **Quick Start (Guest Mode)**로 안전 분석 화면에 들어갈 수 있었다. 이 방식으로 `main`의 변경 사항을 공개하려면 새 빌드 결과를 `gh-pages` 브랜치에 올려야 한다.

### Vite 빌드를 자동화하는 방법

1. `vite.config.js`에 `base: '/safetyCalculator/'`를 설정한다.
2. **Settings → Pages**의 **Source**를 **GitHub Actions**로 선택한다. 이 모드에서는 Pages 화면의 Branch와 Folder 선택란이 사라진다.
3. `.github/workflows/deploy.yml`에 `main`에 변경 사항이 올라오면 `npm ci`와 `npm run build`를 실행하고, 기본 빌드 결과인 `dist/`를 업로드해 Pages에 게시하도록 설정한다. [Vite 공식 워크플로 예제](https://vite.dev/guide/static-deploy.html#github-pages)

## 배포 결과 확인

- **Actions**에서 최신 실행을 열고 배포 단계까지 성공했는지 확인한다. 실패했다면 처음 실패한 단계의 로그를 확인한다.
- **Visit site**에서 FuSaAppLambda 로그인 화면을 열고 정적 자산이 로드되는지 확인한다. 로그인 후 **시스템 → SysML**을 열어 모델을 편집하고 프로젝트 JSON을 저장한 뒤 다시 연다. [SysML 검증 항목](./GitHubPage_Subbase.md#5-배포-후-확인)
- Vite로 배포하는 safetyCalculator가 빈 화면을 표시하면 빌드 결과가 게시됐는지와 `base`가 저장소 이름과 일치하는지 확인한다. [Vite 배포 문서](https://vite.dev/guide/static-deploy.html#github-pages)
- **Settings → Pages**가 열리지 않으면 해당 저장소에 관리자 또는 유지관리 권한이 있는 계정으로 로그인했는지 확인한다. GitHub Free에서는 공개 저장소에서 Pages를 사용할 수 있다. [GitHub Pages 공식 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
