---
name: jira-dashboard-orchestrator
description: Jira Dashboard 프로젝트의 모든 작업을 조율하는 오케스트레이터. 새 기능 추가, 버그 수정, 개선 사항, 배포 변경, 문서 업데이트, 리팩토링 등 Jira Dashboard 관련 모든 요청에 사용. "다시 실행", "재실행", "업데이트", "수정", "보완", "이전 결과 개선" 등 후속 작업도 처리. Jira, Dashboard, 대시보드, Issue, OAuth, Vercel, Docker 배포, Odoo 연동, ULNN 차트 등 키워드 포함 시 반드시 트리거.
---

# Jira Dashboard 오케스트레이터

Jira Dashboard 프로젝트의 전문 에이전트 팀을 조율하여 요청을 완수한다.

## 실행 모드

**에이전트 팀** - 6명의 전문가가 협업하여 작업 수행

## 팀 구성

1. **Analyst** (`analyst`) - 요구사항 분석
2. **Frontend Developer** (`frontend-developer`) - HTML/JS/Tailwind UI 개발
3. **Backend Developer** (`backend-developer`) - Node.js API, 인증, 프록시
4. **DevOps Engineer** (`devops-engineer`) - Docker, Vercel, 환경 설정
5. **Integrator** (`integrator`) - 시스템 통합 및 경계면 검증
6. **QA Engineer** (`qa-engineer`) - 품질 보증 및 테스트

## 워크플로우

### Phase 0: 컨텍스트 확인

작업 시작 전 기존 산출물 확인:

```bash
ls _workspace/*.md 2>/dev/null
```

**실행 모드 결정**:
- `_workspace/` 존재 + 사용자가 부분 수정 요청 → **부분 재실행** (해당 에이전트만 재호출)
- `_workspace/` 존재 + 사용자가 새 입력 제공 → **새 실행** (기존 `_workspace/`를 `_workspace_prev_YYYYMMDD_HHMMSS/`로 이동)
- `_workspace/` 미존재 → **초기 실행**

부분 재실행 시:
1. 기존 요구사항 파일 읽기
2. 사용자 피드백을 요구사항에 반영
3. 영향받는 에이전트만 재호출 (예: Frontend만 수정 필요 시 Frontend만 호출)

### Phase 1: 요구사항 분석

**실행 모드**: 에이전트 팀

**팀 생성**:
```javascript
TeamCreate({
  team_name: "jira-dashboard-team",
  members: ["analyst", "frontend-developer", "backend-developer", "devops-engineer", "integrator", "qa-engineer"]
})
```

**작업**:
1. Analyst에게 분석 요청 전달
2. Analyst가 `_workspace/01_requirements.md` 생성
3. 요구사항이 모호하면 Analyst가 오케스트레이터에게 질의 → 오케스트레이터가 사용자에게 확인 → 답변을 Analyst에게 전달

**데이터 전달**: `_workspace/01_requirements.md` 파일

### Phase 2: 병렬 개발

**실행 모드**: 에이전트 팀 (병렬 작업)

요구사항 분석 결과에 따라 필요한 에이전트만 호출:

**조건부 실행**:
- Frontend 변경 필요 시 → Frontend Developer 호출
- Backend 변경 필요 시 → Backend Developer 호출
- 배포 변경 필요 시 → DevOps Engineer 호출

**팀 통신**:
- Frontend ↔ Backend: API 계약 합의
- Backend ↔ DevOps: 환경 변수 조율
- 각 에이전트는 `SendMessage`로 실시간 소통

**데이터 전달**:
- Backend Developer → `_workspace/02_backend_api_contract.md` (API 계약)
- Frontend Developer → `_workspace/02_frontend_changes.md`
- Backend Developer → `_workspace/03_backend_changes.md`
- DevOps Engineer → `_workspace/04_devops_changes.md`

### Phase 3: 통합

**실행 모드**: 에이전트 팀

**작업**:
1. Integrator가 모든 산출물 읽기
2. 데이터 흐름, API 계약, 환경 설정 일관성 검증
3. 이슈 발견 시 담당 에이전트에게 `SendMessage`로 수정 요청
4. 수정 완료 시 재검증
5. `_workspace/05_integration_report.md` 생성

**데이터 전달**: `_workspace/05_integration_report.md` 파일

### Phase 4: 품질 보증

**실행 모드**: 에이전트 팀

**작업**:
1. QA Engineer가 통합 보고서 및 요구사항 읽기
2. 기능 테스트, 경계면 교차 비교, 회귀 테스트 수행
3. 버그 발견 시 담당 에이전트에게 `SendMessage`로 수정 요청
4. 수정 완료 시 재테스트
5. 모든 인수 조건 충족 시 `_workspace/06_qa_report.md` 생성

**데이터 전달**: `_workspace/06_qa_report.md` 파일

### Phase 5: 완료 보고

**작업**:
1. 모든 산출물 요약
2. 변경된 파일 목록
3. 테스트 방법
4. 다음 단계 제안 (배포, 추가 기능 등)

**팀 정리**:
```javascript
TeamDelete("jira-dashboard-team")
```

## 데이터 전달 프로토콜

**전략**: 파일 기반 + 메시지 기반 + 태스크 기반

- **파일**: 산출물은 `_workspace/` 디렉토리에 저장
- **메시지**: 실시간 질의/응답, 이슈 보고는 `SendMessage`
- **태스크**: Phase 간 의존성은 순차 실행으로 관리 (TeamCreate가 자동 조율)

**파일명 컨벤션**:
```
_workspace/
├── 01_requirements.md          # Analyst
├── 02_backend_api_contract.md  # Backend (API 계약)
├── 02_frontend_changes.md      # Frontend
├── 03_backend_changes.md       # Backend
├── 04_devops_changes.md        # DevOps
├── 05_integration_report.md    # Integrator
└── 06_qa_report.md             # QA
```

## 에러 핸들링

### 에이전트 실패
- **1회 재시도**: 같은 에이전트에게 에러 메시지와 함께 재요청
- **2회 실패**: 다른 접근 시도 또는 사용자에게 에스컬레이션

### API 계약 불일치
- Integrator가 발견 시 양쪽(Frontend, Backend)에게 수정 요청
- 합의 후 재통합

### QA 실패
- Critical 버그: 담당 에이전트가 수정 후 QA 재실행
- Major 버그: 수정 후 재실행
- Minor 버그: 보고만 하고 진행 (사용자 판단)

### 환경 문제
- DevOps가 해결 불가 시 사용자에게 환경 확인 요청

## 팀 크기 가이드라인

**6명 팀** (중규모 작업)
- Analyst: 1개 작업 (요구사항 분석)
- Frontend/Backend/DevOps: 각 3-5개 작업
- Integrator: 1개 작업 (통합)
- QA: 5-10개 테스트 시나리오

## 예시 실행

### 예시 1: 새 기능 추가

**사용자 요청**: "ULNN 차트에 부서별 필터 추가해줘"

**Phase 0**: `_workspace/` 없음 → 초기 실행

**Phase 1**:
```javascript
TeamCreate({team_name: "jira-dashboard-team", members: [...]})
SendMessage({to: "analyst", content: "사용자 요청: ULNN 차트에 부서별 필터 추가"})
// Analyst가 _workspace/01_requirements.md 생성
```

**Phase 2**:
```javascript
// 요구사항 확인 후 Frontend만 필요
SendMessage({to: "frontend-developer", content: "요구사항 파일 확인 후 UI 개발"})
SendMessage({to: "backend-developer", content: "API 변경 필요 여부 확인"})
// Backend: "API 변경 없음, 기존 데이터 재사용 가능" 응답
// Frontend: _workspace/02_frontend_changes.md 생성
```

**Phase 3**:
```javascript
SendMessage({to: "integrator", content: "Frontend 산출물 통합 검증"})
// Integrator: _workspace/05_integration_report.md 생성
```

**Phase 4**:
```javascript
SendMessage({to: "qa-engineer", content: "QA 시작"})
// QA: _workspace/06_qa_report.md 생성
```

**Phase 5**:
```javascript
TeamDelete("jira-dashboard-team")
// 사용자에게 완료 보고
```

### 예시 2: 버그 수정

**사용자 요청**: "로그인 후 무한 리다이렉트 발생"

**Phase 0**: `_workspace/` 없음 → 초기 실행

**Phase 1**: Analyst가 버그 재현 단계와 영향 범위 분석

**Phase 2**: Backend Developer가 인증 로직 수정

**Phase 3**: Integrator가 인증 흐름 검증

**Phase 4**: QA가 로그인/로그아웃 시나리오 테스트

**Phase 5**: 완료 보고

### 예시 3: 부분 재실행

**사용자 요청**: "ULNN 차트 색상을 파란색으로 바꿔줘" (이전에 ULNN 필터 추가 작업 완료)

**Phase 0**: 
```bash
ls _workspace/*.md  # 파일들 존재 확인
# 부분 재실행 모드
```

**Phase 1**: 
- 기존 `_workspace/01_requirements.md` 읽기
- 색상 변경 요구사항 추가
- Analyst 건너뜀 (요구사항 명확)

**Phase 2**:
- Frontend Developer만 호출 (색상 변경은 Frontend만 관련)
- Backend/DevOps 건너뜀

**Phase 3**: Integrator가 Frontend 변경만 검증

**Phase 4**: QA가 UI만 재테스트

**Phase 5**: 완료 보고

## 후속 작업 지원

오케스트레이터 description에 후속 키워드 포함:
- "다시 실행", "재실행", "업데이트", "수정", "보완"
- "이전 결과 기반으로", "결과 개선"

Phase 0에서 컨텍스트 확인으로 초기/후속/부분 재실행 판별.

## 테스트 시나리오

### 시나리오 1: 정상 흐름 (새 기능)
1. 사용자가 새 기능 요청
2. Analyst가 요구사항 분석
3. Frontend/Backend가 병렬 개발
4. Integrator가 통합
5. QA가 검증
6. 완료 보고

### 시나리오 2: API 불일치 발견
1. Phase 3에서 Integrator가 API 계약 불일치 발견
2. Frontend와 Backend에게 수정 요청
3. 합의 후 재개발
4. 재통합
5. QA 진행

### 시나리오 3: QA 실패
1. Phase 4에서 QA가 Critical 버그 발견
2. 담당 에이전트에게 수정 요청
3. 수정 완료 후 QA 재실행
4. 통과 시 완료 보고

## 주의사항

1. **모든 Agent 호출에 `model: "opus"` 명시**
2. **에이전트 정의 파일 기반** - Agent 도구의 prompt에 역할 직접 넣지 않음
3. **Phase 간 팀 유지** - 같은 팀으로 전체 워크플로우 진행 (재구성 불필요)
4. **파일 보존** - `_workspace/` 중간 산출물은 삭제하지 않음 (사후 검증용)
5. **사용자 확인 최소화** - 에이전트 팀이 자체 조율하므로 오케스트레이터는 최종 결과만 보고
