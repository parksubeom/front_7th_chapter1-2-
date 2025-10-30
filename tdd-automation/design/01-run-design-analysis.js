// tdd-automation/design/01-run-design-analysis.js (ReferenceError 및 체크리스트 복구)
import fs from 'fs';
import path from 'path';
// [✅ 수정] path 모듈과 fileURLToPath 추가
import { fileURLToPath } from 'url';
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js';
import { SYSTEM_PROMPT_DESIGN } from '../core/agent_prompts.js';

// --- [✅ 추가] 현재 파일 경로 및 에이전트 이름 정의 ---
const __filename = fileURLToPath(import.meta.url);
const agentName = '1-1. 기능 설계 (질문 생성)';

// --- (준비 1) PRD ---
const newFeatureSpec = `
### 필수 스펙 (반복 일정 기능)
- 1. 반복 유형 선택
  - [ ] 일정 생성 또는 수정 시 반복 유형을 선택할 수 있다.
  - [ ] 반복 유형은 다음과 같다: 매일, 매주, 매월, 매년
    - [ ] 31일에 매월을 선택한다면 → 매월 마지막이 아닌, 31일에만 생성하세요.
    - [ ] 윤년 29일에 매년을 선택한다면 → 29일에만 생성하세요!
  - [ ] 반복일정은 일정 겹침을 고려하지 않는다.
2. 반복 일정 표시
    - [ ] 캘린더 뷰에서 반복 일정을 아이콘을 넣어 구분하여 표시한다.
3. 반복 종료
    - [ ] 반복 종료 조건을 지정할 수 있다.
    - [ ] 옵션: 특정 날짜까지
      - 예제 특성상, 2025-12-31까지 최대 일자를 만들어 주세요.
4. **반복 일정 수정**
    1. [ ] ‘해당 일정만 수정하시겠어요?’ 라는 텍스트에서 ‘예’라고 누르는 경우 단일 수정
      - [ ] 반복일정을 수정하면 단일 일정으로 변경됩니다.
      - [ ] 반복일정 아이콘도 사라집니다.
    2. [ ] ‘해당 일정만 수정하시겠어요?’ 라는 텍스트에서 ‘아니오’라고 누르는 경우 전체 수정
      - [ ] 이 경우 반복 일정은 유지됩니다.
      - [ ] 반복일정 아이콘도 유지됩니다.
5. **반복 일정 삭제**
    1. [ ] ‘해당 일정만 삭제하시겠어요?’ 라는 텍스트에서 ‘예’라고 누르는 경우 단일 수정
      - [ ] 해당 일정만 삭제합니다.
    2. [ ] ‘해당 일정만 삭제하시겠어요?’ 라는 텍스트에서 ‘아니오’라고 누르는 경우 전체 수정
      - [ ] 반복 일정의 모든 일정을 삭제할 수 있다.
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
__mocks__/  __tests__/  apis/  App.tsx  components/  hooks/  main.tsx  setupTests.ts  types.ts  utils/  vite-env.d.ts

src/__mocks__:
handlers.ts  handlersUtils.ts  response/

src/__mocks__/response:
events.json  realEvents.json

src/__tests__:
hooks/  medium.integration.spec.tsx  unit/  utils.ts

src/__tests__/hooks:
easy.useCalendarView.spec.ts  easy.useSearch.spec.ts  medium.useEventOperations.spec.ts  medium.useNotifications.spec.ts

src/__tests__/unit:
easy.dateUtils.spec.ts     easy.eventUtils.spec.ts     easy.notificationUtils.spec.ts  repeatUtils.spec.ts
easy.eventOverlap.spec.ts  easy.fetchHolidays.spec.ts  easy.timeValidation.spec.ts

src/apis:
fetchHolidays.ts

src/components:
CalendarDayCell.tsx  EventFormModal.tsx  EventOperationModals.tsx

src/hooks:
useCalendarView.ts  useEventForm.ts  useEventOperations.ts  useNotifications.ts  useSearch.ts

src/utils:
dateUtils.ts  eventOverlap.ts  eventUtils.ts  notificationUtils.ts  repeatUtils.ts  timeValidation.ts
  `; // AI가 꼭 봐야 하는 핵심 파일 4개

  const typesContent = readFileContent('src/types.ts');
  const eventOpsContent = readFileContent('src/hooks/useEventOperations.ts');
  const dateUtilsContent = readFileContent('src/utils/dateUtils.ts');
  const eventFormContent = readFileContent('src/hooks/useEventForm.ts');

  return `
${fileStructure}
---
[핵심 파일 1: src/types.ts]
${typesContent}
---
[핵심 파일 2: src/hooks/useEventOperations.ts]
${eventOpsContent}
---
[핵심 파일 3: src/utils/dateUtils.ts]
${dateUtilsContent}
---
[핵심 파일 4: src/hooks/useEventForm.ts]
${eventFormContent}
---
`;
}

// --- (실행) ---
async function runDesignAnalysis() {
  console.log(`--- ${agentName} 시작 ---`);
  // [✅ 수정] outputFilePath와 success 플래그를 try/catch/finally 블록 바깥에 선언
  let success = false;
  let outputFilePath = path.join('tdd-automation', 'logs', 'output-01-questions.txt'); // 초기 경로 설정

  try {
    const projectContext = getProjectContext();
    const userPrompt = `
[기존 프로젝트 컨텍스트]
${projectContext}
[새로운 기능 요구사항]
${newFeatureSpec}
[지시]
당신의 임무(기능 설계)에 따라, 위 정보를 바탕으로 이 기능을 개발하기 위해
내가(사용자가) 답변해야 할 '구체적인 질문 리스트'를 마크다운 형식으로 생성해주세요.
`;
    const questions = await runAgent(SYSTEM_PROMPT_DESIGN, userPrompt);
    // [보강] 질문을 저장하기 전에 코드 블록 정리
    const cleanedQuestions = questions
      .replace(/^```(markdown)?\s*[\r\n]/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    // 로그 폴더 생성 확인 (path.join 사용)
    const logDir = path.dirname(outputFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    await fs.promises.writeFile(outputFilePath, cleanedQuestions);
    console.log('--- 질문 생성 완료 ---');
    // [✅ 수정] path.relative를 사용하여 로그 경로 출력
    console.log(
      `👉 ${path.relative(process.cwd(), outputFilePath)} 파일을 확인하고 답변을 준비해주세요.`
    );
    success = true; // 성공 플래그 설정
  } catch (error) {
    console.error('1단계 질문 생성 중 최종 오류 발생.'); // success는 false 유지
  } finally {
    // [✅ 수정] 체크리스트 생성 및 저장
    const relativeOutputPath = path.relative(process.cwd(), outputFilePath); // 상대 경로 계산
    const checklistItems = [
      'PRD 및 프로젝트 컨텍스트 분석 수행 시도',
      '기능 구현에 필요한 기술적 질문 리스트 생성 시도',
      `산출물(${relativeOutputPath}) 생성 시도`,
    ];

    // saveAgentChecklist 호출 시 __filename 사용 (현재 파일 경로)
    saveAgentChecklist(agentName, __filename, { success, outputFilePath }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// 스크립트 실행
runDesignAnalysis();
