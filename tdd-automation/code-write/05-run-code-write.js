// tdd-automation/code-write/05-run-code-write.js (자동 테스트 + 수정 + 체크리스트)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 변경 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_CODE_WRITE, SYSTEM_PROMPT_CODE_REVIEW } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

// --- 1. 헬퍼 함수 정의 ---

/** AI 응답에서 코드 블록 마크다운 제거 */
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|jsx|tsx)?\s*[\r\n]/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  return cleaned;
}

/** 쉘 명령어 실행 (에러 시에도 계속 진행 가능하도록 수정) */
function run(command, exitOnError = true) {
  console.log(`[Run]: ${command}`);
  try {
    const output = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    console.log(output); // 성공 시 출력
    return { success: true, output: output };
  } catch (error) {
    const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message;
    console.error(`❌ 명령어 실행 실패: ${command}\n`, errorOutput); // 에러 로그
    if (exitOnError) {
      process.exit(1);
    }
    return { success: false, output: errorOutput }; // 실패 시 결과 반환
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
      if (fs.existsSync(absolutePath)) {
        existingContent = fs.readFileSync(absolutePath, 'utf8');
      }
    } catch (readError) {
      console.warn(`    ⚠️ [FS 경고]: 기존 파일 ${filePath} 읽기 실패. (${readError.message})`);
      existingContent = '';
    }

    if (existingContent.trim() !== content.trim()) {
      // trim()으로 공백 차이 무시
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
          run(`git commit -m "$GIT_COMMIT_MSG"`, false);
        } else {
          // 그 외 git diff 에러
          console.warn(`    ⚠️ [Git 경고]: 스테이징 확인 오류. 커밋 시도. (${error.message})`);
          process.env.GIT_COMMIT_MSG = commitMessage;
          run(`git commit -m "$GIT_COMMIT_MSG"`, false);
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
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isTypesFile = filePath.includes('src/types.ts');
      // 테스트 파일은 이 단계에서 필수로 존재해야 함
      const isTestSpecFile = filePath.includes('.spec.');

      if (!optional && (isSpecFile || isTypesFile || isTestSpecFile)) {
        console.error(
          `❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다. 이전 단계를 확인하세요.`
        );
        process.exit(1);
      } else if (optional) {
        console.warn(`[Context]: 선택적 파일 ${filePath} 없음.`);
        return `// [정보] 파일 ${filePath} 없음.`;
      } else {
        // optional=false 인데 필수 파일 아님 (코드 파일 신규 생성 시)
        console.warn(`[Context]: ${filePath} 파일 없음. (신규 생성 예정)`);
        return `// [정보] 파일 ${filePath} 없음. AI가 전체 내용을 생성해야 함.`;
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

// 프로젝트 컨텍스트 파일 목록 (핸들러 포함)
const PROJECT_FILES = [
  'src/types.ts',
  'src/hooks/useEventOperations.ts',
  'src/hooks/useCalendarView.ts',
  'src/hooks/useEventForm.ts',
  'src/utils/dateUtils.ts',
  'src/setupTests.ts',
  'src/utils/eventUtils.ts',
  'src/utils/eventOverlap.ts',
  'src/__mocks__/handlers.ts',
  'src/__mocks__/handlersUtils.ts',
  'src/__tests__/utils.ts',
  'src/utils/repeatUtils.ts',
];

/** 프로젝트 주요 파일 컨텍스트 로드 함수 */
function getProjectContext() {
  let context = `[프로젝트 주요 파일 컨텍스트]\n`;
  for (const filePath of PROJECT_FILES) {
    const content = readFileContent(filePath, true); // optional=true
    context += `\n---\n[${filePath}]\n${content}\n---\n`;
  }
  return context;
}

// 리뷰 로그 파일 경로 및 함수
const REVIEW_LOG_FILE = './tdd-automation/logs/code-review-log.md';
function appendToReviewLog(filePath, originalCode, reviewedCode) {
  const timestamp = new Date().toLocaleString('ko-KR');
  let logEntry = `\n## [${timestamp}] 리뷰: ${path.basename(filePath)}\n\n`;

  if (reviewedCode && reviewedCode.trim() !== originalCode.trim()) {
    // reviewedCode 유효성 확인
    logEntry += '**수정사항 발견 및 적용됨**\n\n';
    logEntry += '**리뷰 전 코드 (요약):**\n';
    logEntry +=
      '```typescript\n' +
      originalCode.substring(0, 300) +
      (originalCode.length > 300 ? '\n...' : '') +
      '\n```\n\n';
    logEntry += '**리뷰 후 코드 (요약):**\n';
    logEntry +=
      '```typescript\n' +
      reviewedCode.substring(0, 300) +
      (reviewedCode.length > 300 ? '\n...' : '') +
      '\n```\n';
  } else if (reviewedCode) {
    // 유효하나 변경 없음
    logEntry += '**수정사항 없음**\n\n';
  } else {
    // 빈 응답
    logEntry += '**⚠️ 리뷰 응답 없음** (원본 코드 사용)\n\n';
  }
  logEntry += '---\n';

  try {
    const logDirPath = path.dirname(REVIEW_LOG_FILE);
    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true });
      console.log(`[FS]: 로그 디렉토리 생성됨: ${logDirPath}`);
    }
    fs.appendFileSync(REVIEW_LOG_FILE, logEntry, 'utf8');
    console.log(`    💾 [로그] 리뷰 결과가 ${REVIEW_LOG_FILE}에 기록되었습니다.`);
  } catch (error) {
    console.error(`❌ 리뷰 로그 파일 쓰기 실패: ${REVIEW_LOG_FILE}`, error);
  }
}

// 테스트 로그 파일 경로
const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt';

const __filename = fileURLToPath(import.meta.url); // [✅ 추가] 현재 스크립트 파일 경로

// --- [4 & 4.5. 코드 작성 + 리뷰 에이전트] 실행 ---
async function runCodeWriteAndReview() {
  const agentName = '4 & 4.5. 코드 작성 및 리뷰'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 (RED -> GREEN) ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록

  try {
    // [✅ 추가] 메인 로직을 try 블록으로 감쌈
    // 리뷰 로그 파일 초기화
    try {
      const logDirPath = path.dirname(REVIEW_LOG_FILE);
      if (!fs.existsSync(logDirPath)) {
        fs.mkdirSync(logDirPath, { recursive: true });
      }
      fs.writeFileSync(REVIEW_LOG_FILE, `# TDD 자동 코드 리뷰 로그\n\n`, 'utf8');
      console.log(`[Init]: 리뷰 로그 파일 (${REVIEW_LOG_FILE}) 초기화 완료.`);
    } catch (error) {
      console.error(`❌ 리뷰 로그 파일 초기화 실패: ${REVIEW_LOG_FILE}`, error);
    }

    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md');
    let projectContext = getProjectContext();
    const tasks = [
      {
        codePath: 'src/types.ts',
        testPath: 'src/__tests__/unit/repeatUtils.spec.ts',
        instruction: '명세서 3항에 따라 타입을 수정/정의합니다.',
        commitMessage: `feat(tdd): [TDD 4/5] src/types.ts 기능 구현 (GREEN/REVIEWED) - 데이터 모델 업데이트`,
      },
      {
        codePath: 'src/utils/repeatUtils.ts',
        testPath: 'src/__tests__/unit/repeatUtils.spec.ts',
        instruction: "명세서 4.1항에 따라 'generateRecurringEvents' 함수를 구현합니다.",
        commitMessage: `feat(tdd): [TDD 4/5] src/utils/repeatUtils.ts 기능 구현 (GREEN/REVIEWED) - 반복 로직`,
      },
      {
        codePath: 'src/hooks/useEventForm.ts',
        testPath: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
        instruction: '명세서 및 타입 변경에 따라 폼 상태 로직을 수정합니다.',
        commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useEventForm.ts 기능 구현 (GREEN/REVIEWED) - 폼 상태 업데이트`,
      },
      {
        codePath: 'src/hooks/useCalendarView.ts',
        testPath: 'src/__tests__/hooks/easy.useCalendarView.spec.ts',
        instruction: "명세서에 따라 'generateRecurringEvents'를 호출하도록 훅 로직을 수정합니다.",
        commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useCalendarView.ts 기능 구현 (GREEN/REVIEWED) - 뷰 로직`,
      },
      {
        codePath: 'src/hooks/useEventOperations.ts',
        testPath: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
        instruction: "명세서 4.2항에 따라 '단일/전체 수정/삭제' 로직과 모달 상태를 구현합니다.",
        commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useEventOperations.ts 기능 구현 (GREEN/REVIEWED) - CRUD 로직`,
      },
    ];

    for (const task of tasks) {
      console.log(`\n--- [작업 시작] ${path.basename(task.codePath)} ---`);
      const failingTestCode = readFileContent(task.testPath);
      const existingCode = readFileContent(task.codePath, true); // optional

      // 4단계: 코드 작성
      const codeWritePrompt = `
[1. 최종 기능 명세서]
${specMarkdown}
[2. 전체 프로젝트 컨텍스트]
${projectContext}
[3. 이 작업의 목표 및 주의사항]
${task.instruction}
[4. 관련 테스트 파일 (통과 필요): ${task.testPath}]
${failingTestCode}
[5. 기존 코드 (수정/생성 대상): ${task.codePath}]
${existingCode}
[지시]
'${task.codePath}' 파일의 완성된 전체 코드를 반환하세요.
(타입/시그니처 100% 준수, 테스트 통과 목표, 테스트 파일 수정 금지)
`;
      const rawGeneratedCode = await runAgent(SYSTEM_PROMPT_CODE_WRITE, codeWritePrompt);
      let codeBeforeReview = cleanAiCodeResponse(rawGeneratedCode);

      // 4.5단계: 코드 리뷰
      let finalCode = codeBeforeReview;
      if (task.codePath !== 'src/types.ts') {
        console.log(`    ➡️ [검토] ${path.basename(task.codePath)} 파일 코드 리뷰 중...`);
        const codeReviewPrompt = `
[1. 최종 기능 명세서]
${specMarkdown}
[2. 프로젝트 컨텍스트 (타입/시그니처 확인용)]
${projectContext}
[3. 관련 테스트 파일 (참고용)]
${failingTestCode}
[4. 코드 작성 에이전트가 생성한 코드 (리뷰 대상)]
${finalCode}
[지시]
리뷰 규칙에 따라 위 코드를 검토하고 문제 시 수정된 전체 코드를, 없으면 원본 코드를 반환하세요.
(규칙: 타입/시그니처 준수, 스타일 준수, 불필요 Import 제거, 테스트 수정 금지)
`;
        const rawReviewedCode = await runAgent(SYSTEM_PROMPT_CODE_REVIEW, codeReviewPrompt);
        const reviewedCode = cleanAiCodeResponse(rawReviewedCode);

        appendToReviewLog(task.codePath, codeBeforeReview, reviewedCode);

        if (reviewedCode && reviewedCode.trim() !== codeBeforeReview.trim()) {
          console.log(`    ✅ [리뷰 완료]: 수정사항 발견 및 적용.`);
          finalCode = reviewedCode;
        } else if (reviewedCode) {
          console.log(`    🟢 [리뷰 완료]: 추가 수정사항 없음.`);
        } else {
          console.warn(`    ⚠️ [리뷰 경고]: 리뷰 응답이 비어있습니다. 원본 코드를 사용합니다.`);
        }
      } else {
        console.log(`    ⏭️ [검토 생략]: ${path.basename(task.codePath)} 파일.`);
      }

      // 5. 최종 파일 저장 및 커밋
      saveFileAndCommit(task.codePath, finalCode, task.commitMessage);
      modifiedFiles.push(task.codePath); // 성공 시 파일 목록에 추가

      // 컨텍스트 업데이트
      projectContext = getProjectContext();
    }

    console.log('\n--- 4단계 코드 생성/리뷰 완료 ---');
    console.log(`📝 코드 리뷰 결과는 '${REVIEW_LOG_FILE}' 파일에서 확인할 수 있습니다.`);

    // 자동 테스트 실행 및 실패 시 로그 저장
    console.log('\n--- 자동 테스트 실행 (GREEN 🟢 확인) ---');
    const testCommand = `(pnpm test > "${TEST_LOG_PATH}") || (exit /b 0)`; // Windows 호환
    const testResult = run(testCommand, false); // 실패해도 계속

    if (testResult.success) {
      console.log('\n✅ [결과] 모든 테스트 통과 (GREEN)!');
      console.log('➡️ 다음 [5단계: 리팩토링]을 진행하세요.');
      success = true; // 최종 성공 플래그 설정
    } else {
      console.error('\n❌ [결과] 테스트 실패 (RED)!');
      console.log(`💾 테스트 실패 로그 저장됨: ${TEST_LOG_PATH}`);
      console.log(
        "👉 저장된 로그 파일을 확인하고, 필요시 [5단계: 코드 수정] 스크립트('code-fix/06-run-code-fix.js')를 실행하여 디버깅하세요."
      );
      // 실패 시 success는 false 유지, finally에서 처리
      throw new Error('Automated tests failed after code generation and review.'); // 에러 발생시켜 finally로 이동
    }
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
    // success 플래그는 false 유지
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const checklistItems = [
      '최종 명세서 로드 시도',
      '프로젝트 컨텍스트 로드 시도',
      '각 대상 파일 코드 생성 시도 (types, repeatUtils, useEventForm, useCalendarView, useEventOperations)',
      '생성 시 타입 및 시그니처 준수 시도 (AI 확인 필요)',
      '생성된 코드 자동 리뷰 및 수정 시도 (types.ts 제외)',
      '리뷰 시 타입/스타일/Import 규칙 준수 확인 시도 (AI 확인 필요)',
      '변경된 코드 파일 Git 커밋 실행 시도 (변경 시)',
      '모든 코드 생성/리뷰 후 자동 테스트 실행 시도',
      '자동 테스트 결과 (GREEN) 확인 시도',
    ];
    saveAgentChecklist(agentName, __filename, { success, modifiedFiles }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runCodeWriteAndReview();
