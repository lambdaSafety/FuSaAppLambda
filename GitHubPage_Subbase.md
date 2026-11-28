# WebLambda 배포, Supabase 인증과 프로젝트 저장

## 1. 구성과 선택 기준

작업공간은 `docs/`의 HTML, CSS와 JavaScript로 실행한다. GitHub Pages는 화면과 계산 코드를 제공하고 Supabase Auth는 이메일·비밀번호를 확인한다. SysML 편집과 프로젝트 JSON 저장·열기가 구현되어 있다. Supabase 웹 저장을 활성화하려면 4절의 마이그레이션을 운영 프로젝트에 적용한다. [작업공간](./docs/index.html) · [SysML 기능 안내](./feature01_sysml.md) · [지수 분포 계산 API](./ExpoDist_API.md)

| 구분 | GitHub Pages | Cloudflare Pages |
|---|---|---|
| 무료 배포 | GitHub Free에서는 공개 저장소 사용 | 공개·비공개 GitHub 저장소 연결 가능 |
| 기본 주소 | `https://<owner>.github.io/<repo>/` | `https://<project>.pages.dev/` |
| 서버 코드 | 외부 백엔드 연동 | Pages Functions 사용 가능 |
| 배포 미리보기 | 브랜치별 미리보기 별도 구성 | 브랜치·PR 미리보기 URL 지원 |

공개 저장소의 비상업용 시제품은 GitHub Pages에서 배포할 수 있다. 비공개 저장소의 배포에는 Cloudflare Pages의 Git 연동을 검토한다. 두 서비스에서 브라우저가 받아 실행하는 JavaScript는 사용자가 볼 수 있다. GitHub Pages의 사용 범위는 공식 이용 제한을 따른다.

Supabase Free의 데이터베이스 한도는 500 MB이고 월간 활성 사용자 한도는 50,000명이다. 1주일간 활동이 없으면 프로젝트가 일시 중지될 수 있다. 저장 용량은 전체 프로젝트의 JSON 크기를 기준으로 추산한다.

[GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [GitHub Pages 이용 제한](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [Cloudflare Pages Git 연동](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Supabase 요금제](https://supabase.com/pricing)

## 2. GitHub Pages 배포

1. GitHub 공개 저장소의 `main` 브랜치에 `docs/` 전체를 올린다. `index.html`이 참조하는 작업공간, 지수 분포, SysML의 JS와 CSS를 함께 올린다. 현재 파일은 별도 빌드 없이 게시할 수 있다.
2. 저장소의 **Settings → Pages**에서 **Deploy from a branch → main → /docs**를 선택한다.
3. 배포가 끝나면 Pages에 표시된 사이트 주소로 접속한다. HTML의 JS와 CSS 참조에는 프로젝트 사이트 하위 경로에서도 작동하는 상대 경로를 사용한다.

DB 스키마는 4절에서 별도로 적용한다. 저장소와 사이트 주소 및 Pages 설정 확인은 배포 절차 문서를 참고한다. [GitHub Pages 배포 방법](<./github_page_배포 방법.md>)

[GitHub Pages 게시 소스 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 3. Supabase 이메일·비밀번호 로그인

로그인 화면은 `docs/index.html`의 `createClient()` 설정으로 Supabase Auth에 연결한다. [로그인 페이지](./docs/index.html)

| 항목 | 값 |
| --- | --- |
| Project URL | 로그인 페이지의 `createClient()`에 지정한 프로젝트 주소 |
| Publishable key | 로그인 페이지의 `createClient()`에 지정한 공개 키 |

1. Supabase 프로젝트 대시보드에서 **Authentication → Users**로 이동한다.
2. 테스트용 이메일과 새 비밀번호로 사용자 한 명을 추가한다. 대시보드에서 직접 만든 테스트 사용자는 이메일 확인을 완료된 상태로 설정할 수 있다.
3. 배포 URL에서 로그인 화면을 열고 등록한 이메일과 비밀번호를 입력한다.
4. 로그인하면 프로젝트 목록이나 마지막으로 작업한 SysML 프로젝트가 열린다. 헤더에서 계정 이메일을 확인할 수 있고, 로그아웃을 누르면 로그인 화면에 돌아간다.

브라우저는 Project URL과 Publishable key를 사용한다. Secret key와 `service_role` 키는 서버 측 설정에서 관리한다. 시험 계정 비밀번호와 개인 연결 메모는 저장소 밖의 로컬 공간에 보관한다.

[Supabase 이메일·비밀번호 인증](https://supabase.com/docs/guides/auth/passwords)

### 선택 사항으로 Google 로그인 추가

현재 화면은 이메일·비밀번호 로그인을 제공한다. Google 로그인을 추가할 때는 다음 절차를 따른다.

1. 연결할 Supabase 프로젝트의 Project URL과 Publishable key를 확인한다. Google Client Secret은 Supabase의 Google Provider 설정에서 관리한다.
2. Supabase **Authentication → URL Configuration**에서 Site URL을 실제 Pages 주소로 지정한다. 앱이 `redirectTo`로 사용할 배포 주소와 로컬 개발 주소를 Redirect URLs에 등록한다. 예시는 `https://<owner>.github.io/<repo>/`, `http://localhost:5173/`이다.
3. Google Cloud에서 웹 애플리케이션 OAuth 클라이언트를 만든다. **Authorized redirect URIs**에는 Supabase의 Google Provider 설정 화면에 표시된 콜백 URL을 등록한다. 일반적인 형태는 `https://<project-ref>.supabase.co/auth/v1/callback`이다.
4. Supabase에서 Google Provider를 활성화하고 Google Client ID와 Client Secret을 입력한다. Google 앱이 테스트 상태라면 로그인할 계정을 테스트 사용자로 등록한다.
5. 프런트엔드에서 Supabase JS 클라이언트를 초기화하고 `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl } })`를 호출한다. `appUrl`은 2단계에서 등록한 주소다.

[Google 로그인](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [API 키](https://supabase.com/docs/guides/getting-started/api-keys)

## 4. SysML 프로젝트 저장과 접근 제어

1. Supabase 대시보드에 관리자 계정으로 로그인한다. 로그인 페이지가 사용하는 프로젝트를 열고 **SQL Editor**로 이동한다.
2. [SysML 프로젝트 마이그레이션](./supabase/migrations/202611250001_sysml_projects.sql) 전체를 새 쿼리에 붙여넣고 한 번 실행한다.
3. 작업공간에 테스트 사용자로 로그인한다. 프로젝트를 열고 **Supabase 저장**을 누른 뒤 `저장 완료`와 리비전이 표시되는지 확인한다. [SysML 기능 안내](./feature01_sysml.md)

`projects`는 모든 SysML 모델과 다이어그램을 프로젝트 단위 JSONB로 저장한다. `workspace_state`는 계정별로 마지막 프로젝트를 가리킨다. 행 수준 보안(RLS)은 소유 계정의 데이터만 읽고 쓸 수 있게 한다. `save_sysml_project` 함수는 서버 리비전을 확인하고 프로젝트 데이터와 복원 위치를 한 트랜잭션에서 갱신한다. [Supabase 행 단위 접근 제어](https://supabase.com/docs/guides/database/postgres/row-level-security)

`Supabase에 프로젝트 저장용 마이그레이션을 적용해야 합니다.`가 표시되면 로그인 페이지가 연결하는 프로젝트에 위 마이그레이션을 적용했는지 확인한다. 로그인 세션에서 브라우저 초안과 프로젝트 JSON을 사용할 수 있다.

## 5. 배포 후 확인

### 검증 상태

Edge에서 모델 편집과 프로젝트 JSON 저장·열기를 확인했다. 저장과 재로그인 복원은 모의 Supabase로 확인했다. 마이그레이션 실행, 리비전 충돌, 계정 간 접근 차단은 로컬 PostgreSQL에서 검증했다. 운영 Supabase 마이그레이션 적용과 배포 URL에서의 저장·복원 검증은 남아 있다.

### 배포 URL에서 확인할 항목

- [ ] Pages URL에서 로그인 화면이 열리고 정적 자산이 로드된다.
- [ ] Supabase에 등록한 테스트 사용자로 로그인하면 프로젝트 화면과 계정 이메일이 표시된다.
- [ ] 메뉴가 각각의 화면을 열고 상단 **뒤로가기**가 직전에 방문한 메뉴로 돌아간다. SysML의 **실행 취소**는 편집을 되돌린다.
- [ ] 확률의 지수 분포 화면에서 기본 결과와 그래프 3개가 표시되고 입력을 변경해 다시 계산할 수 있다.
- [ ] 지수분포2에서 기본사상 모델을 선택하고 동일한 모델·입력을 사용한 지수 분포 비교 화면과 확률 및 Frequency가 일치하는지 확인한다.
- [ ] 모바일 메뉴 버튼으로 사이드바를 열고 메뉴를 선택한다.
- [ ] 새로고침 후 세션이 복원되고 로그아웃하면 로그인 화면이 표시된다.
- [ ] 프로젝트에 SysML 모델 두 개를 넣어 **Supabase 저장**을 누른다. 다른 브라우저에서 같은 계정으로 로그인해 프로젝트, 마지막으로 저장한 모델, 배치와 선 스타일이 복원되는지 확인한다.
- [ ] 프로젝트 JSON 파일을 저장하고 다시 열면 두 모델이 새 프로젝트로 복원된다.
- [ ] 계정 B의 세션에서는 계정 A의 프로젝트가 목록에 표시되지 않으며, ID를 지정해도 읽거나 쓸 수 없다.
- [ ] 비로그인 상태에서 프로젝트 저장과 조회가 차단된다.
- [ ] Google 로그인을 추가한 경우 인증 후 Pages 주소로 돌아오는지 확인한다.

