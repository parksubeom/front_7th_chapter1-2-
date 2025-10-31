// tdd-automation/design/01-run-design-analysis.js (최종 보강 버전)
import fs from 'fs';
import path from 'path';
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js';
import { SYSTEM_PROMPT_DESIGN } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url';

// --- [✅ 추가] 현재 파일 경로 및 에이전트 이름 정의 ---
const __filename = fileURLToPath(import.meta.url);
const agentName = '1-1. 기능 설계 (질문 생성)';

// --- (준비 1) PRD ---
// [✅ 보강] 사용자가 제공한 최신 필수 스펙으로 교체
const newFeatureSpec = `
# 📖 반복 일정 기능: 필수 스펙 및 구현 가이드

## 1. 반복 유형 선택

-   [ ] 일정 생성 또는 수정 시 반복 유형을 선택할 수 있다.
-   [ ] 반복 유형은 다음과 같다: 매일, 매주, 매월, 매년
-   [ ] **특수 규칙 (31일/윤년):**
    -   [ ] 31일에 매월을 선택한다면 → **매월 마지막 날이 아닌**, 31일에만 생성해야 한다.
        * **구현 예시:** \`Event.date\`가 '2025-01-31'이고 \`repeat.type\`이 'monthly'인 경우, 2월에는 생성되지 않고(날짜 없음), 3월 31일에는 생성된다.
    -   [ ] 윤년 2월 29일에 매년을 선택한다면 → **윤년에만** 생성해야 한다.
        * **구현 예시:** \`Event.date\`가 '2024-02-29'이고 \`repeat.type\`이 'yearly'인 경우, 2025년/2026년/2027년에는 생성되지 않고, 다음 윤년인 '2028-02-29'에 생성된다.
-   [ ] 반복일정은 일정 겹침을 고려하지 않는다. (겹침 검사 로직(\`eventOverlap.ts\`)을 이 기능 구현 시에는 호출하지 않는다.)

## 2. 반복 일정 표시

-   [ ] 캘린더 뷰에서 반복 일정을 아이콘(예: 🔄)을 넣어 구분하여 표시한다.
-   [ ] **데이터 기준:** 렌더링되는 이벤트 객체(\`EventInstance\`)의 \`seriesId\` 필드가 \`string\`이고 \`null\`이 아닌 경우 아이콘을 표시한다.

## 3. 반복 종료

-   [ ] 반복 종료 조건을 지정할 수 있다.
-   [ ] 옵션: 특정 날짜까지 (\`RepeatInfo.endDate\`)
    -   **제약:** UI(\`useEventForm\` 훅)는 사용자가 \`2025-12-31\`을 초과하는 날짜를 선택하지 못하도록 **유효성 검사**를 수행한다.
    -   **구현 예시:** \`endDate\`가 '2025-11-30'이면, 12월 1일의 반복 일정은 생성되지 않는다.

## 4. 반복 일정 수정

#### 4.1. '예' 선택 시 (단일 수정)

-   [ ] 반복일정을 수정하면 **독립된 단일 일정**으로 변경된다.
-   [ ] **아이콘이 사라진다.**
-   [ ] **구현 상세 (2단계 API 호출):**
    1.  **\`POST /api/events\`:** 수정된 내용으로 **새로운 \`Event\` 객체**를 생성한다. 이 객체의 \`seriesId\`는 **\`null\`**로 설정한다. (이로 인해 2번 스펙에 따라 아이콘이 사라짐)
    2.  **\`PUT /api/events/{seriesId}\`:** 원본 이벤트(Master)의 \`exceptionDates\` 배열에 이 일정의 날짜(예: '2025-10-30')를 추가하여 예외 처리한다.

#### 4.2. '아니오' 선택 시 (전체 수정)

-   [ ] 이 경우 **반복 일정(시리즈) 전체**가 수정된다.
-   [ ] **아이콘이 유지**된다.
-   [ ] **구현 상세 (단일 API 호출):**
    1.  **\`PUT /api/events/{seriesId}\`:** \`seriesId\`를 기준으로 원본 이벤트의 \`title\` 등 내용 자체를 수정한다. \`seriesId\`는 변경되지 않으므로 아이콘이 유지된다.

## 5. 반복 일정 삭제

#### 5.1. '예' 선택 시 (단일 삭제)

-   [ ] 해당 일정만 삭제된다. (데이터는 보존하고 예외 처리)
-   [ ] **구현 상세 (수정 API 호출):**
    1.  **\`DELETE\`가 아님.** \`PUT /api/events/{seriesId}\`를 호출한다.
    2.  **요청 본문:** \`{ "addExceptionDate": "YYYY-MM-DD" }\` 형식으로 삭제할 날짜를 전송하여, 원본 이벤트의 \`exceptionDates\`에 추가한다.

#### 5.2. '아니오' 선택 시 (전체 삭제)

-   [ ] 반복 일정의 모든 일정을 삭제할 수 있다.
-   [ ] **구현 상세 (삭제 API 호출):**
    1.  **\`DELETE /api/events/{seriesId}\`**를 호출하여 원본(Master) 이벤트를 DB에서 완전히 삭제한다.
`;

// --- (준비 2) 헬퍼 함수 및 컨텍스트 ---
const readFileContent = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn(`[Context]: ${filePath} 파일 없음. 진행에 영향 줄 수 있음.`);
      return `// [파일 없음] ${filePath}`;
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

function getProjectContext() {
  const fileStructure = `
[프로젝트 파일 구조 (ls -R src)]
src:
App.tsx         __tests__       hooks           setupTests.ts   utils
__mocks__       apis            main.tsx        types.ts        vite-env.d.ts

src/__mocks__:
handlers.ts             handlersUtils.ts        response

src/__mocks__/response:
events.json     realEvents.json

src/__tests__:
hooks                           unit
medium.integration.spec.tsx     utils.ts

src/__tests__/hooks:
easy.useCalendarView.spec.ts            medium.useEventOperations.spec.ts
easy.useSearch.spec.ts                  medium.useNotifications.spec.ts

src/__tests__/unit:
easy.dateUtils.spec.ts          easy.fetchHolidays.spec.ts
easy.eventOverlap.spec.ts       easy.notificationUtils.spec.ts
easy.eventUtils.spec.ts         easy.timeValidation.spec.ts

src/apis:
fetchHolidays.ts

src/hooks:
useCalendarView.ts      useEventOperations.ts   useSearch.ts
useEventForm.ts         useNotifications.ts

src/utils:
dateUtils.ts            eventUtils.ts           timeValidation.ts
eventOverlap.ts         notificationUtils.ts
  `; // [✅ 6개 핵심 파일로 확장]

  const typesContent = readFileContent('src/types.ts');
  const eventOpsContent = readFileContent('src/hooks/useEventOperations.ts');
  const eventFormContent = readFileContent('src/hooks/useEventForm.ts');
  const dateUtilsContent = readFileContent('src/utils/dateUtils.ts');

  // [✅ 추가 1] 캘린더 뷰 훅 (반복 일정 표시 로직 통합 지점)
  const calendarViewContent = readFileContent('src/hooks/useCalendarView.ts');
  // [✅ 추가 2] 일정 겹침 유틸 (반복 일정 겹침 미고려 스펙 처리 참고)
  const eventOverlapContent = readFileContent('src/utils/eventOverlap.ts');

  return `
${fileStructure}
---
[핵심 파일 1: src/types.ts - 데이터 모델]
${typesContent}
---
[핵심 파일 2: src/hooks/useEventOperations.ts - CRUD/API 로직]
${eventOpsContent}
---
[핵심 파일 3: src/hooks/useEventForm.ts - 폼/유효성 로직]
${eventFormContent}
---
[핵심 파일 4: src/utils/dateUtils.ts - 날짜 유틸]
${dateUtilsContent}
---
[핵심 파일 5: src/hooks/useCalendarView.ts - 캘린더 뷰 로직]
${calendarViewContent}
---
[핵심 파일 6: src/utils/eventOverlap.ts - 일정 겹침 로직]
${eventOverlapContent}
---
[핵심 파일 7: server.js - api 설계 시 참고 모델]
${eventOverlapContent}
---
`;
}

// --- (실행) ---
async function runDesignAnalysis() {
  console.log(`--- ${agentName} 시작 ---`);
  let success = false;
  let outputFilePath = path.join('tdd-automation', 'logs', 'output-01-questions.txt');
  let selfReviewOutput = { rating: 0, wellDone: 'N/A', needsImprovement: 'N/A' };

  try {
    const projectContext = getProjectContext();
    const userPrompt = `
[기존 프로젝트 컨텍스트]
${projectContext}
[새로운 기능 요구사항]
${newFeatureSpec}

[지시]
1. 당신의 임무(기능 설계)에 따라, 위 정보를 바탕으로 이 기능을 개발하기 위해 명확히 해야 할 **기술적인 질문 리스트 (Markdown 형식)**를 생성해주세요.
2. **질문 리스트 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (질문 생성 시 프로젝트 분석을 잘한 부분, 스펙 준수 여부)
**고려하지 못한 점:** (놓치거나 모호하게 남긴 부분)
\`\`\`
`;
    const rawResponse = await runAgent(SYSTEM_PROMPT_DESIGN, userPrompt);

    // [✅ 수정] 질문과 자가 평가 데이터를 응답에서 분리
    const reviewSeparator = '## 🤖 에이전트 자가 평가';
    const [questions, reviewBlock] = rawResponse.split(reviewSeparator, 2);

    if (reviewBlock) {
      // 자가 평가 데이터 파싱 (정규식 사용)
      const ratingMatch = reviewBlock.match(/점수:\s*(\d+)/i);
      const wellDoneMatch =
        reviewBlock.match(/잘한 점:\s*([\s\S]*?)\n###/i) ||
        reviewBlock.match(/잘한 점:\s*([\s\S]*)/i);
      const needsImprovementMatch = reviewBlock.match(/고려하지 못한 점:\s*([\s\S]*)/i);

      selfReviewOutput.rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
      selfReviewOutput.wellDone = wellDoneMatch
        ? wellDoneMatch[1].trim()
        : '평가 텍스트를 찾을 수 없음';
      selfReviewOutput.needsImprovement = needsImprovementMatch
        ? needsImprovementMatch[1].trim()
        : '평가 텍스트를 찾을 수 없음';
    } else {
      console.warn('⚠️ 경고: AI 응답에서 자가 평가 블록을 찾을 수 없어 질문 전체를 저장합니다.');
    }

    // 질문만 파일에 저장 (코드 블록 정리 포함)
    const cleanedQuestions = (questions || rawResponse)
      .replace(/^```(markdown)?\s*[\r\n]/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    // 로그 폴더 생성 확인
    const logDir = path.dirname(outputFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    await fs.promises.writeFile(outputFilePath, cleanedQuestions);
    console.log('--- 질문 생성 완료 ---');
    console.log(
      `👉 ${path.relative(process.cwd(), outputFilePath)} 파일을 확인하고 답변을 준비해주세요.`
    );
    success = true; // 성공 플래그 설정
  } catch (error) {
    console.error('1단계 질문 생성 중 최종 오류 발생.'); // success는 false 유지
  } finally {
    // [✅ 수정] 체크리스트 생성 및 저장
    const relativeOutputPath = path.relative(process.cwd(), outputFilePath);

    // 최종 results 객체 생성
    const finalResults = {
      success,
      outputFilePath: outputFilePath,
      rating: selfReviewOutput.rating,
      wellDone: selfReviewOutput.wellDone,
      needsImprovement: selfReviewOutput.needsImprovement,
    };

    const checklistItems = [
      'PRD 및 프로젝트 컨텍스트 분석 수행 시도 (6개 핵심 파일 참조)',
      '기능 구현에 필요한 기술적 질문 리스트 생성 시도',
      `산출물(${relativeOutputPath}) 생성 시도`,
      `AI 자가 평가 점수: ${selfReviewOutput.rating}/10점 기록 시도`, // 자가 평가 점수 기록
    ];

    // saveAgentChecklist 호출
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// 스크립트 실행
runDesignAnalysis();
