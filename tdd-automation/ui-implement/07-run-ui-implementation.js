// tdd-automation/ui-implement/07-run-ui-implementation.js (UI Implementation + Type Error Fix)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_UI_IMPLEMENTATION } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // 현재 파일 경로 얻기 위해

// --- 1. 헬퍼 함수 정의 (통합 완료) ---

/** AI 응답에서 코드 블록 마크다운 제거 */
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|jsx|tsx)?\s*[\r\n]/im, '') // jsx/tsx 추가
    .replace(/```\s*$/im, '')
    .trim();
  return cleaned;
}

/** 쉘 명령어 실행 */
function run(command, exitOnError = true) {
  console.log(`[Run]: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf8' });
    return { success: true, output: '' }; // 성공 시
  } catch (error) {
    const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message;
    console.error(`❌ 명령어 실행 실패: ${command}`, errorOutput);
    if (exitOnError) {
      process.exit(1);
    }
    return { success: false, output: errorOutput }; // 실패 시 출력 반환
  }
}

/** 파일 저장 및 Git 커밋 (변경 시에만) */
function saveFileAndCommit(filePath, content, commitMessage) {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const destDir = path.dirname(absolutePath);
    if (!fs.existsSync(destDir)) {
      const relativeDestDir = path.relative(process.cwd(), destDir);
      if (relativeDestDir && !fs.existsSync(relativeDestDir)) {
        fs.mkdirSync(relativeDestDir, { recursive: true });
        console.log(`[FS]: 디렉토리 생성됨: ${relativeDestDir}`);
      } else if (!relativeDestDir && !fs.existsSync(destDir)) {
        if (!fs.existsSync(destDir)) {
          // 절대 경로 존재 재확인
          fs.mkdirSync(destDir, { recursive: true });
          console.log(`[FS]: 디렉토리 생성됨: ${destDir}`);
        }
      }
    }

    let existingContent = '';
    try {
      // 파일 읽기 실패 방어
      if (fs.existsSync(absolutePath)) {
        existingContent = fs.readFileSync(absolutePath, 'utf8');
      }
    } catch (readError) {
      console.warn(`    ⚠️ [FS 경고]: 기존 파일 ${filePath} 읽기 실패. (${readError.message})`);
      existingContent = ''; // 읽기 실패 시 빈 내용으로 간주
    }

    if (existingContent.trim() !== content.trim()) {
      // trim()으로 공백 차이 무시
      fs.writeFileSync(absolutePath, content);
      console.log(`[FS]: 파일 저장됨 (변경됨): ${filePath}`);
      run(`git add "${filePath}"`);
      try {
        // 변경사항 있으면 1 반환, 없으면 에러 없이 종료
        execSync('git diff --staged --quiet --exit-code');
        console.log(
          `    ⚠️ [Git Skip]: ${path.basename(
            filePath
          )} 변경 사항 없어 커밋 건너<0xEB><0x9B><0x81>.`
        );
      } catch (error) {
        if (error.status === 1) {
          // 변경사항 있음
          process.env.GIT_COMMIT_MSG = commitMessage;
          run(`git commit -m "$GIT_COMMIT_MSG"`, false); // 실패해도 계속 진행하도록 false 전달
        } else {
          // 그 외 git diff 에러
          console.warn(`    ⚠️ [Git 경고]: 스테이징 확인 오류. 커밋 시도. (${error.message})`);
          process.env.GIT_COMMIT_MSG = commitMessage;
          run(`git commit -m "$GIT_COMMIT_MSG"`, false); // 에러에도 커밋 시도 (실패해도 계속)
        }
      }
    } else {
      console.log(`[FS]: 파일 내용 동일하여 저장/커밋 건너<0xEB><0x9B><0x81>: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 파일 저장/커밋 중 오류: ${filePath}`, error);
    throw error; // 오류 발생 시 상위 호출자에게 알림
  }
}

/** 파일 내용 안전하게 읽기 */
const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isLogicFile = LOGIC_FILES.includes(filePath);

      if (!optional && (isSpecFile || isLogicFile)) {
        // 필수 파일
        console.error(`❌ 치명적 오류: 필수 로직/명세 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else if (optional) {
        // 선택적 파일 (UI 컴포넌트)
        console.warn(
          `[Context]: 선택적 UI 파일 ${filePath} 없음. AI가 구조를 생성해야 할 수 있음.`
        );
        return `// [정보] 파일 ${filePath} 없음. AI가 React 컴포넌트 기본 구조를 생성해야 함.`;
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

// 프로젝트 컨텍스트 파일 목록 (UI 구현에 필요한 로직 파일 위주)
const LOGIC_FILES = [
  'src/types.ts',
  'src/hooks/useEventForm.ts',
  'src/hooks/useCalendarView.ts',
  'src/hooks/useEventOperations.ts',
  'src/utils/repeatUtils.ts',
  'src/utils/dateUtils.ts',
];

/** UI 구현에 필요한 로직 컨텍스트 로드 함수 */
function getLogicContext() {
  let context = `[관련 로직 파일 컨텍스트]\n`;
  for (const filePath of LOGIC_FILES) {
    const content = readFileContent(filePath); // 로직 파일은 필수
    context += `\n---\n[${filePath}]\n${content}\n---\n`;
  }
  return context;
}

const __filename = fileURLToPath(import.meta.url); // 현재 스크립트 파일 경로

// --- [6. UI 구현 에이전트] 실행 ---
async function runUiImplementation() {
  const agentName = '6. UI 구현'; // 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 ---`);
  let success = false; // 실행 성공 여부 플래그
  const modifiedFiles = []; // 변경된 파일 목록 기록
  const allTaskReviews = []; // 자가 평가 기록

  try {
    // 1. 공통 컨텍스트 로드
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // 명세서
    const logicContext = getLogicContext();

    // 2. 수정 대상 UI 컴포넌트 파일 목록 (✅ App.tsx에 모든 책임을 집중)
    const uiTasks = [
      {
        uiPath: 'src/App.tsx',
        instruction: `
        **[최종 통합 책임 및 인라인 구현]** 당신은 'App.tsx' 파일 내에서 다음 모든 UI/UX 스펙을 통합하고 구현해야 합니다.

        **[⭐ 핵심 수정 지시 (TS2345 & TS2554 해결)]**
        1.  **TS2554 (useSearch 인자 오류):** \`useSearch\` 훅 호출 시, [2. 로직 컨텍스트]의 시그니처를 **반드시 확인**하여 3개의 인자(\`viewEvents\`, \`currentDate\`, \`viewType\`)를 모두 전달해야 합니다.
        2.  **TS2345 (null/undefined 오류):** \`EventFormModal\`이 \`eventToEdit?: ... | undefined\` Props를 받으므로, \`App.tsx\` 내부의 \`editingEvent\` 상태를 \`useState<Event | EventInstance | undefined>(undefined)\`로 선언하여 **타입 일관성을 100%** 맞추십시오. (\`null\` 사용 금지)
        
        **[기존 지시]**
        1. **폼 모달 UI 구현:** 기존 '일정 추가' 모달의 내용(TextFields, Selects) 내부에 **반복 설정 UI** (타입 선택 드롭다운, 간격 입력, 종료일 TextField)를 **인라인으로 구현**하고 \`useEventForm\` 훅과 연결하십시오.
        2. **반복 아이콘 연결:** 캘린더 렌더링 로직을 수정하여, 각 셀의 이벤트 렌더링 부분에 **\`event.seriesId\` 유무를 확인**하여 **반복 아이콘(예: 🔄)**을 표시하는 로직을 **직접 삽입**하십시오.
        3. **확인 모달 구현:** \`useEventOperations\` 훅에서 반환된 모달 상태와 액션 함수를 사용하여 **수정/삭제 확인 모달**의 UI를 **App.tsx 내부에 인라인으로 구현**하고 조건부 렌더링 하십시오.

        **[⭐ 핵심 규칙]**
        - **외부 UI 컴포넌트 import 금지:** \`EventFormModal\`, \`CalendarDayCell\` 등 별도 컴포넌트를 import하지 마십시오. 모든 UI 코드를 \`App.tsx\` 내에서 구현하십시오.
        - **레이아웃 보존:** 기존의 주된 레이아웃 구조(Grid, Stack 등)와 스타일은 절대 변경하거나 제거하지 마십시오. 새로운 기능의 UI 요소만 추가하고 연결해야 합니다.
        - **타입 안전성:** Props 에러와 Type 에러를 유발하는 코드는 절대 작성하지 마십시오.`,
        commitMessage: `feat(ui): [TDD 6/7] App.tsx 단독 수정으로 모든 반복 기능 UI 통합 구현 (타입 에러 수정)`,
      },
    ];

    // 3. 작업 순차 실행
    for (const task of uiTasks) {
      console.log(`\n--- [UI 작업 시작] 대상 파일: ${task.uiPath} ---`);
      const existingUiCode = readFileContent(task.uiPath, true); // optional=true

      const prompt = `
[1. 최종 기능 명세서 (특히 UI/UX 섹션)]
${specMarkdown}
[2. 관련 로직 파일 컨텍스트 (Hooks, Types, Utils)]
${logicContext}
[3. 수정 대상 UI 컴포넌트: ${task.uiPath}]
${existingUiCode}
[지시]
1. 당신은 'UI 구현 에이전트'입니다. [1. 최종 명세서]와 [2. 로직 컨텍스트]를 기반으로, **${task.instruction}**
2. 위 지시에 따라 [3. UI 컴포넌트] 코드를 수정/생성하여 **'${task.uiPath}' 파일의 완성된 전체 코드**를 반환하세요.
3. **코드 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (명세 준수 및 Hooks 연결 노력, 타입 에러 수정)
**고려하지 못한 점:** (놓쳤거나, 다른 컴포넌트와의 통합 문제)
\`\`\`
(로직 파일은 절대 수정하지 마세요. UI 컴포넌트만 수정합니다.)
`;

      // 3c. AI 실행 및 응답 분리
      const rawGeneratedResponse = await runAgent(SYSTEM_PROMPT_UI_IMPLEMENTATION, prompt);
      const reviewSeparator = '## 🤖 에이전트 자가 평가';
      const [codeContent, reviewBlock] = rawGeneratedResponse.split(reviewSeparator, 2);

      let currentTaskReview = {
        rating: 0,
        wellDone: 'N/A',
        needsImprovement: 'N/A',
        file: task.uiPath,
      };
      if (reviewBlock) {
        const ratingMatch = reviewBlock.match(/점수:\s*(\d+)/i);
        const wellDoneMatch =
          reviewBlock.match(/잘한 점:\s*([\s\S]*?)\n###/i) ||
          reviewBlock.match(/잘한 점:\s*([\s\S]*)/i);
        const needsImprovementMatch = reviewBlock.match(/고려하지 못한 점:\s*([\s\S]*)/i);

        currentTaskReview.rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
        currentTaskReview.wellDone = wellDoneMatch
          ? wellDoneMatch[1].trim()
          : '평가 텍스트를 찾을 수 없음';
        currentTaskReview.needsImprovement = needsImprovementMatch
          ? needsImprovementMatch[1].trim()
          : '평가 텍스트를 찾을 수 없음';
      }
      allTaskReviews.push(currentTaskReview);

      const finalUiCode = cleanAiCodeResponse(codeContent || rawGeneratedResponse);

      // 3d. 파일 저장 및 커밋 (변경 시에만)
      const commitMessage = `${task.commitMessage}
- AI 평가: ${currentTaskReview.rating}/10점.
- 자가 회고: ${currentTaskReview.needsImprovement.substring(0, 100)}...`;

      saveFileAndCommit(task.uiPath, finalUiCode, commitMessage);
      modifiedFiles.push(task.uiPath); // 성공 시 파일 목록에 추가
    }

    console.log('\n--- 6단계 (UI 구현) 완료 ---');
    console.log(
      '✅ UI 코드가 생성/수정되었습니다. 실제 화면에서 동작을 확인하고 필요시 수동으로 조정하세요.'
    );
    console.log('➡️ (선택) UI 테스트를 작성하거나, 최종 [7단계: 리팩토링]을 진행할 수 있습니다.');
    success = true; // 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const totalRating = allTaskReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating =
      allTaskReviews.length > 0 ? (totalRating / allTaskReviews.length).toFixed(1) : 0;

    const checklistItems = [
      '최종 명세서 및 로직 파일 컨텍스트 로드 시도',
      'App.tsx 파일에 모든 반복 기능 UI (폼, 모달, 아이콘) 인라인 구현 시도',
      'TS2345 (null/undefined) 및 TS2554 (useSearch 인자) 타입 에러 수정 시도',
      'UI 컴포넌트가 관련 Hooks 로직과 연동되었는지 확인 시도 (AI 확인 필요)',
      'Git 커밋 실행 시도 (변경 시)',
      `AI 평균 자가 평가 점수: ${averageRating}/10점`,
    ];

    const finalResults = {
      success,
      rating: averageRating,
      wellDone: success
        ? 'UI 컴포넌트 생성 및 통합 작업 완료.'
        : 'UI 통합 과정에서 오류가 발생했습니다.',
      needsImprovement: `수정 대상 파일 목록: ${modifiedFiles.join(', ')}`,
      detailedReviews: allTaskReviews,
    };

    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runUiImplementation();
