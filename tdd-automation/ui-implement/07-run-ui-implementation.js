// tdd-automation/07-run-ui-implementation.js (UI Implementation Step)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js'; // runAgent.js (재시도 로직 포함 버전) 필요
import { SYSTEM_PROMPT_UI_IMPLEMENTATION } from '../core/agent_prompts.js'; // agent_prompts.js (UI 프롬프트 추가 버전) 필요

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
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`[FS]: 디렉토리 생성됨: ${destDir}`);
      }
    }

    let existingContent = '';
    if (fs.existsSync(absolutePath)) {
      existingContent = fs.readFileSync(absolutePath, 'utf8');
    }

    if (existingContent.trim() !== content.trim()) {
      fs.writeFileSync(absolutePath, content);
      console.log(`[FS]: 파일 저장됨 (변경됨): ${filePath}`);
      run(`git add "${filePath}"`);
      try {
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
          run(`git commit -m "$GIT_COMMIT_MSG"`, false); // 실패해도 계속
        } else {
          // 그 외 git diff 에러
          console.warn(`    ⚠️ [Git 경고]: 스테이징 확인 오류. 커밋 시도. (${error.message})`);
          process.env.GIT_COMMIT_MSG = commitMessage;
          run(`git commit -m "$GIT_COMMIT_MSG"`, false); // 에러에도 커밋 시도
        }
      }
    } else {
      console.log(`[FS]: 파일 내용 동일하여 저장/커밋 건너<0xEB><0x9B><0x81>: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 파일 저장/커밋 중 오류: ${filePath}`, error);
    throw error;
  }
}

/** 파일 내용 안전하게 읽기 */
const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      if (!optional) {
        // 필수 파일
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else {
        // 선택적 파일
        console.warn(
          `[Context]: 선택적 UI 파일 ${filePath} 없음. AI가 구조를 생성해야 할 수 있음.`
        );
        return `// [정보] 파일 ${filePath} 없음. AI가 전체 구조를 생성해야 할 수 있음.`;
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
  'src/utils/repeatUtils.ts', // UI에서 직접 사용하진 않지만 참고용
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

// --- [6. UI 구현 에이전트] 실행 ---
async function runUiImplementation() {
  console.log('--- 6단계: [UI 구현 에이전트] 실행 시작 ---');

  // 1. 공통 컨텍스트 로드
  const specMarkdown = readFileContent('./tdd-automation/output-02-feature-spec.md');
  const logicContext = getLogicContext();

  // 2. 수정 대상 UI 컴포넌트 파일 목록 (실제 프로젝트에 맞게 수정 필요)
  const uiTasks = [
    {
      uiPath: 'src/components/EventFormModal.tsx', // 예시 경로
      instruction:
        '명세서 6.1항 및 5항(UI/UX)에 따라, 이벤트 생성/수정 폼에 반복 설정 UI(타입 선택, 종료일 등)를 추가하고 `useEventForm` 훅과 연결합니다.',
      commitMessage: `feat(ui): [TDD 6/6] EventFormModal 반복 설정 UI 구현`,
    },
    {
      uiPath: 'src/components/CalendarDayCell.tsx', // 예시 경로
      instruction:
        '명세서 2항 및 5항(UI/UX)에 따라, `useCalendarView` 훅에서 전달받은 이벤트 목록을 렌더링하고, 이벤트 데이터의 `seriesId` 유무를 확인하여 반복 아이콘을 표시하는 로직을 추가합니다.',
      commitMessage: `feat(ui): [TDD 6/6] CalendarDayCell 반복 아이콘 표시 구현`,
    },
    {
      uiPath: 'src/components/EventOperationModals.tsx', // 예시 경로 (모달 관리 컴포넌트가 있다면)
      instruction:
        "명세서 6.2항/6.3항 및 5항(UI/UX)에 따라, `useEventOperations` 훅에서 반환된 상태(`isConfirmModalOpen`)와 함수(`confirmSingleAction`, `confirmAllAction`, `cancelAction`)를 사용하여 '해당 일정만?' 확인 모달을 구현하고 상호작용 로직을 연결합니다.",
      commitMessage: `feat(ui): [TDD 6/6] 수정/삭제 확인 모달 구현`,
    },
    // 필요에 따라 추가 UI 작업 정의
  ];

  // 3. 작업 순차 실행
  for (const task of uiTasks) {
    console.log(`\n--- [UI 작업 시작] ${path.basename(task.uiPath)} ---`);

    // 3a. 기존 UI 컴포넌트 코드 로드 (optional=true)
    const existingUiCode = readFileContent(task.uiPath, true);

    // 3b. 프롬프트 구성
    const prompt = `
[1. 최종 기능 명세서]
${specMarkdown}

[2. 관련 로직 파일 컨텍스트]
${logicContext}

[3. 수정 대상 UI 컴포넌트: ${task.uiPath}]
${existingUiCode}

[지시]
당신은 'UI 구현 에이전트'입니다. React 컴포넌트 전문가입니다.
[1. 최종 명세서]와 [2. 로직 컨텍스트]를 기반으로,
**${task.instruction}**
위 지시에 따라 [3. UI 컴포넌트] 코드를 수정하거나 생성하여,
**'${task.uiPath}' 파일의 완성된 전체 코드**를 반환하세요.
(로직 파일은 절대 수정하지 마세요. UI 컴포넌트만 수정합니다.)
`;

    // 3c. AI 실행 및 코드 정리
    const rawCode = await runAgent(SYSTEM_PROMPT_UI_IMPLEMENTATION, prompt);
    const finalUiCode = cleanAiCodeResponse(rawCode);

    // 3d. 파일 저장 및 커밋 (변경 시에만)
    saveFileAndCommit(task.uiPath, finalUiCode, task.commitMessage);
  }

  console.log('\n--- 6단계 (UI 구현) 완료 ---');
  console.log(
    '✅ UI 코드가 생성/수정되었습니다. 실제 화면에서 동작을 확인하고 필요시 수동으로 조정하세요.'
  );
  console.log('➡️ (선택) UI 테스트를 작성하거나, [7단계: 리팩토링]을 진행할 수 있습니다.');
}

// --- 스크립트 실행 ---
runUiImplementation();
