// tdd-automation/ui-implement/06-run-ui-implementation.js (UI Implementation + Checklist)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_UI_IMPLEMENTATION } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

// --- 1. 헬퍼 함수 정의 ---

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
      // [수정] logs 폴더 경로 반영
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      // 로직 파일은 필수
      const isLogicFile = LOGIC_FILES.includes(filePath);

      if (!optional && (isSpecFile || isLogicFile)) {
        // 필수로 간주되는 파일
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else if (optional) {
        // 선택적 파일 (UI 컴포넌트)
        console.warn(
          `[Context]: 선택적 UI 파일 ${filePath} 없음. AI가 구조를 생성해야 할 수 있음.`
        );
        return `// [정보] 파일 ${filePath} 없음. AI가 전체 구조를 생성해야 함. React 컴포넌트 기본 구조 포함하세요.`;
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
  'src/utils/dateUtils.ts', // UI 구현 시 날짜 포맷팅 등 필요
];

/** UI 구현에 필요한 로직 컨텍스트 로드 함수 */
function getLogicContext() {
  let context = `[관련 로직 파일 컨텍스트]\n`;
  for (const filePath of LOGIC_FILES) {
    // 로직 파일은 필수이므로 optional=false (기본값)
    const content = readFileContent(filePath);
    context += `\n---\n[${filePath}]\n${content}\n---\n`;
  }
  return context;
}

const __filename = fileURLToPath(import.meta.url); // [✅ 추가] 현재 스크립트 파일 경로

// --- [6. UI 구현 에이전트] 실행 ---
async function runUiImplementation() {
  const agentName = '6. UI 구현'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록

  try {
    // [✅ 추가] 메인 로직을 try 블록으로 감쌈
    // 1. 공통 컨텍스트 로드
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // [수정] 경로 변경
    const logicContext = getLogicContext();

    // 2. 수정 대상 UI 컴포넌트 파일 목록 (✅ 실제 프로젝트 경로로 수정 필수!)
    const uiTasks = [
      {
        uiPath: 'src/components/EventFormModal.tsx', // 예시 경로
        instruction:
          '명세서 6.1항 및 5항(UI/UX)에 따라, 폼에 반복 설정 UI 추가 및 `useEventForm` 훅 연결.',
        commitMessage: `feat(ui): [TDD 6/7] EventFormModal 반복 설정 UI 구현`, // 단계 번호 수정
      },
      {
        uiPath: 'src/components/CalendarDayCell.tsx', // 예시 경로
        instruction:
          '명세서 2항 및 5항(UI/UX)에 따라, `useCalendarView` 훅 데이터 사용 및 `seriesId` 기반 반복 아이콘 표시 로직 추가.',
        commitMessage: `feat(ui): [TDD 6/7] CalendarDayCell 반복 아이콘 표시 구현`,
      },
      {
        uiPath: 'src/components/EventOperationModals.tsx', // 예시 경로
        instruction:
          '명세서 6.2항/6.3항, 5항(UI/UX), 답변 15번 참조하여, `useEventOperations` 훅 상태/함수 사용 확인 모달 UI 및 로직 구현.',
        commitMessage: `feat(ui): [TDD 6/7] 수정/삭제 확인 모달 구현`,
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
당신은 'UI 구현 에이전트'입니다. React 컴포넌트 전문가입니다.
[1. 최종 명세서]와 [2. 로직 컨텍스트]를 기반으로, **${task.instruction}**
위 지시에 따라 [3. UI 컴포넌트] 코드를 수정/생성하여 **'${task.uiPath}' 파일의 완성된 전체 코드**를 반환하세요.
(로직 파일은 절대 수정하지 마세요. UI 컴포넌트만 수정합니다.)
`;
      const rawCode = await runAgent(SYSTEM_PROMPT_UI_IMPLEMENTATION, prompt);
      const finalUiCode = cleanAiCodeResponse(rawCode);

      // 파일 저장 및 커밋 (변경 시에만)
      saveFileAndCommit(task.uiPath, finalUiCode, task.commitMessage);
      modifiedFiles.push(task.uiPath); // 성공 시 파일 목록에 추가
    }

    console.log('\n--- 6단계 (UI 구현) 완료 ---');
    console.log(
      '✅ UI 코드가 생성/수정되었습니다. 실제 화면에서 동작을 확인하고 필요시 수동으로 조정하세요.'
    );
    console.log('➡️ (선택) UI 테스트를 작성하거나, 최종 [7단계: 리팩토링]을 진행할 수 있습니다.');
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
    // success 플래그는 false 유지 (finally에서 처리)
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const checklistItems = [
      '최종 명세서 로드 시도',
      '관련 로직 파일 컨텍스트 로드 시도',
      '각 대상 UI 컴포넌트 코드 생성/수정 시도 (EventFormModal, CalendarDayCell, EventOperationModals 등)',
      '생성/수정 시 명세서의 UI/UX 요구사항 반영 시도 (AI 확인 필요)',
      '생성/수정 시 관련 Hooks 로직과 연동 시도 (AI 확인 필요)',
      '변경된 UI 파일 Git 커밋 실행 시도 (변경 시)',
    ];
    // outputFilePath 대신 변경된 파일 목록 전달
    saveAgentChecklist(agentName, __filename, { success, modifiedFiles }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runUiImplementation();
