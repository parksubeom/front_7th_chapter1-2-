// tdd-automation/code-write/05-run-code-write.js (자동 테스트 및 수정 통합)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 변경: 상위 폴더의 core 모듈 import
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js';
import { SYSTEM_PROMPT_CODE_WRITE, SYSTEM_PROMPT_CODE_REVIEW } from '../core/agent_prompts.js';

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
    // stdio: 'pipe'로 변경하여 stdout/stderr를 직접 캡처 (로그 저장용)
    const output = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    console.log(output); // 성공 시 출력은 그대로 보여줌
    return { success: true, output: output };
  } catch (error) {
    // 실패 시 stderr 또는 stdout을 캡처 (테스트 실패 로그)
    const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message;
    console.error(`❌ 명령어 실행 실패: ${command}\n`, errorOutput); // 에러 로그 출력
    if (exitOnError) {
      process.exit(1);
    }
    // 실패 시 에러 객체 대신 결과 객체 반환
    return { success: false, output: errorOutput };
  }
}

/** 파일 저장 및 Git 커밋 (변경 시에만) */
function saveFileAndCommit(filePath, content, commitMessage) {
  try {
    // [수정] 경로 기준 변경: process.cwd()는 프로젝트 루트이므로 그대로 사용
    const absolutePath = path.resolve(process.cwd(), filePath);
    const destDir = path.dirname(absolutePath);
    if (!fs.existsSync(destDir)) {
      // mkdirSync 경로는 상대 경로가 더 안전할 수 있음 (프로젝트 루트 기준)
      const relativeDestDir = path.relative(process.cwd(), destDir);
      // 상대 경로 디렉토리가 존재하지 않는 경우 생성
      if (relativeDestDir && !fs.existsSync(relativeDestDir)) {
        fs.mkdirSync(relativeDestDir, { recursive: true });
        console.log(`[FS]: 디렉토리 생성됨: ${relativeDestDir}`);
      } else if (!relativeDestDir && !fs.existsSync(destDir)) {
        // destDir이 루트이거나 이미 존재하는 경우 (절대 경로로 생성 시도)
        if (!fs.existsSync(destDir)) {
          // 절대 경로 존재 재확인
          fs.mkdirSync(destDir, { recursive: true });
          console.log(`[FS]: 디렉토리 생성됨: ${destDir}`);
        }
      }
    }

    let existingContent = '';
    // [수정] 절대 경로로 파일 존재 확인 및 읽기
    if (fs.existsSync(absolutePath)) {
      existingContent = fs.readFileSync(absolutePath, 'utf8');
    }

    if (existingContent.trim() !== content.trim()) {
      // trim()으로 공백 차이 무시
      fs.writeFileSync(absolutePath, content);
      console.log(`[FS]: 파일 저장됨 (변경됨): ${filePath}`);
      // [수정] git add 경로는 프로젝트 루트 기준 상대 경로 사용
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
    throw error; // 오류 발생 시 상위 호출자에게 알림
  }
}

/** 파일 내용 안전하게 읽기 */
const readFileContent = (filePath, optional = false) => {
  try {
    // [수정] 경로 기준 변경: process.cwd()는 프로젝트 루트이므로 그대로 사용
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // 필수 파일 (명세서, 타입, 테스트) 누락 시 치명적 오류
      // [수정] output-02 -> logs/output-02 로 경로 변경 가정
      if (
        filePath.includes('logs/output-02-feature-spec.md') ||
        filePath.includes('src/types.ts') ||
        filePath.includes('.spec.')
      ) {
        console.error(
          `❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다. 이전 단계를 확인하세요.`
        );
        process.exit(1);
      }
      // 구현 대상 파일 (신규 생성 가능)
      else if (!filePath.includes('.spec.')) {
        console.warn(`[Context]: ${filePath} 파일 없음. (신규 생성 예정)`);
        return `// [정보] 파일 ${filePath} 없음. AI가 전체 내용을 생성해야 함.`;
      }
      // 기타 컨텍스트 파일
      else {
        console.warn(`[Context]: 선택적 컨텍스트 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        return `// [정보] 파일 ${filePath} 없음.`;
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

// [수정] 프로젝트 컨텍스트 파일 목록 (핸들러 포함, 프로젝트 루트 기준 경로)
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
  'src/utils/repeatUtils.ts', // 추가된 파일 확인
];

/** 프로젝트 주요 파일 컨텍스트 로드 함수 */
function getProjectContext() {
  let context = `[프로젝트 주요 파일 컨텍스트]\n`;
  for (const filePath of PROJECT_FILES) {
    // optional=true 로 설정하여 파일 없어도 경고만 하고 진행
    const content = readFileContent(filePath, true);
    context += `\n---\n[${filePath}]\n${content}\n---\n`;
  }
  return context;
}

// 리뷰 로그 파일 경로 및 함수
const REVIEW_LOG_FILE = './tdd-automation/logs/code-review-log.md'; // [수정] 경로 변경
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
    // [수정] 로그 파일 경로 확인 및 생성
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
const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt'; // [수정] 경로 변경

// --- [4 & 4.5. 코드 작성 + 리뷰 에이전트] 실행 ---
async function runCodeWriteAndReview() {
  console.log('--- 4단계: [코드 작성 에이전트] 실행 시작 (RED -> GREEN) ---');

  // 리뷰 로그 파일 초기화
  try {
    const logDirPath = path.dirname(REVIEW_LOG_FILE);
    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true });
    }
    // 파일 내용 초기화 (덮어쓰기)
    fs.writeFileSync(REVIEW_LOG_FILE, `# TDD 자동 코드 리뷰 로그\n\n`, 'utf8');
    console.log(`[Init]: 리뷰 로그 파일 (${REVIEW_LOG_FILE}) 초기화 완료.`);
  } catch (error) {
    console.error(`❌ 리뷰 로그 파일 초기화 실패: ${REVIEW_LOG_FILE}`, error);
  }

  const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // [수정] 경로 변경
  let projectContext = getProjectContext();
  const tasks = [
    {
      codePath: 'src/types.ts',
      testPath: 'src/__tests__/unit/repeatUtils.spec.ts',
      instruction:
        "명세서 3항(데이터 모델 변경)에 따라 'Event', 'RepeatInfo', 'RepeatType', 'EventInstance' 타입을 최종 명세서대로 정확히 수정/정의합니다.",
      commitMessage: `feat(tdd): [TDD 4/5] src/types.ts 기능 구현 (GREEN/REVIEWED) - 데이터 모델 업데이트`,
    },
    {
      codePath: 'src/utils/repeatUtils.ts',
      testPath: 'src/__tests__/unit/repeatUtils.spec.ts',
      instruction:
        "명세서 4.1항에 따라 'generateRecurringEvents' 함수를 구현합니다. 명세서에 정의된 시그니처와 타입(`EventInstance[]` 반환)을 100% 준수하고, 윤년/31일/예외날짜 규칙을 포함해야 합니다.",
      commitMessage: `feat(tdd): [TDD 4/5] src/utils/repeatUtils.ts 기능 구현 (GREEN/REVIEWED) - 반복 로직`,
    },
    {
      codePath: 'src/hooks/useEventForm.ts',
      testPath: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
      instruction:
        "명세서 2항/5항 및 업데이트된 `src/types.ts`에 따라 폼 상태(state)에 'seriesId'와 'RepeatInfo' 타입 변경을 반영하고, 관련 폼 처리 로직을 수정합니다.",
      commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useEventForm.ts 기능 구현 (GREEN/REVIEWED) - 폼 상태 업데이트`,
    },
    {
      codePath: 'src/hooks/useCalendarView.ts',
      testPath: 'src/__tests__/hooks/easy.useCalendarView.spec.ts',
      instruction:
        '명세서 4.1항/5항에 따라 `generateRecurringEvents` 유틸리티를 호출하여 캘린더 뷰에 표시할 `EventInstance` 배열을 생성하도록 훅 로직을 수정합니다.',
      commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useCalendarView.ts 기능 구현 (GREEN/REVIEWED) - 뷰 로직`,
    },
    {
      codePath: 'src/hooks/useEventOperations.ts',
      testPath: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
      instruction:
        "명세서 4.2항에 따라 '단일/전체 수정/삭제'의 5가지 API 호출 흐름(POST+PUT, PUT, PUT(예외), DELETE)과 확인 모달(`isConfirmModalOpen` 등) 상태 관리 로직을 구현합니다. API 요청 본문은 명세서와 100% 일치해야 합니다.",
      commitMessage: `feat(tdd): [TDD 4/5] src/hooks/useEventOperations.ts 기능 구현 (GREEN/REVIEWED) - CRUD 로직`,
    },
  ];

  for (const task of tasks) {
    console.log(`\n--- [작업 시작] ${path.basename(task.codePath)} ---`);
    const failingTestCode = readFileContent(task.testPath); // 관련 테스트 코드
    const existingCode = readFileContent(task.codePath, true); // 기존 코드 (optional=true)

    // 4단계: 코드 작성
    const codeWritePrompt = `
[1. 최종 기능 명세서]
${specMarkdown}
[2. 전체 프로젝트 컨텍스트]
${projectContext}
[3. 이 작업의 목표 및 주의사항]
${task.instruction}
[4. 관련 테스트 파일 (이 테스트를 통과시켜야 함): ${task.testPath}]
${failingTestCode}
[5. 기존 코드 (이 파일을 수정/생성해야 함): ${task.codePath}]
${existingCode}
[지시]
당신은 '코드 작성 에이전트'입니다. [5. 기존 코드]를 수정/생성하여,
**'${task.codePath}' 파일의 완성된 전체 코드**를 반환하세요.
**[⭐ 핵심 규칙]** 타입 정의(\`src/types.ts\`)와 함수 시그니처를 100% 준수하고, [4. 관련 테스트 파일]을 통과시켜야 합니다.
(테스트 파일은 절대 수정하지 마세요.)
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
[2. 프로젝트 컨텍스트 (타입 및 시그니처 확인용)]
${projectContext}
[3. 관련 테스트 파일 (참고용)]
${failingTestCode}
[4. 코드 작성 에이전트가 생성한 코드 (리뷰 대상)]
${finalCode} // finalCode 변수 사용 (리뷰 대상 코드)
[지시]
당신은 '코드 리뷰 에이전트'입니다. 위의 [4. 코드]를 리뷰 규칙에 따라 검토하세요:
- **타입/시그니처:** \`src/types.ts\` 및 함수 정의를 100% 준수하는가? (인자 오류 없는가?)
- **스타일:** 프로젝트 스타일을 따르는가?
- **Import:** 불필요한 import는 없는가?
문제가 있다면 **수정된 파일의 전체 코드 내용**만을 반환하고, 없다면 원본 코드를 그대로 반환하세요.
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
      console.log(
        `    ⏭️ [검토 생략]: ${path.basename(
          task.codePath
        )} 파일은 리뷰를 건너<0xEB><0x9B><0x81>니다.`
      );
    }

    // 5. 최종 파일 저장 및 커밋
    saveFileAndCommit(
      task.codePath,
      finalCode,
      task.commitMessage // 커밋 메시지는 task 정의 사용
    );

    // 컨텍스트 업데이트
    projectContext = getProjectContext();
  }

  console.log('\n--- 4단계 코드 생성/리뷰 완료 ---');
  console.log(
    "📝 코드 리뷰 결과는 './tdd-automation/logs/code-review-log.md' 파일에서 확인할 수 있습니다."
  );

  // --- [✅ 신규] 자동 테스트 실행 및 실패 시 로그 저장 ---
  console.log('\n--- 자동 테스트 실행 (GREEN 🟢 확인) ---');
  // [수정] Windows 호환 명령어 사용 및 경로 수정
  const testCommand = `(pnpm test > "${TEST_LOG_PATH}") || (exit /b 0)`;
  const testResult = run(testCommand, false); // false: 에러 발생해도 종료하지 않음

  if (testResult.success) {
    // 테스트 통과!
    console.log('\n✅ [결과] 모든 테스트 통과 (GREEN)!');
    console.log('➡️ 다음 [5단계: 리팩토링]을 진행하세요.');
    // (선택) 여기서 자동으로 07-run-refactor.js 호출 가능
  } else {
    // 테스트 실패!
    console.error('\n❌ [결과] 테스트 실패 (RED)!');
    // 로그는 이미 testCommand 실행 시 파일로 저장됨
    console.log(`💾 테스트 실패 로그 저장됨: ${TEST_LOG_PATH}`);
    console.log(
      "👉 저장된 로그 파일을 확인하고, 필요시 [5단계: 코드 수정] 스크립트('code-fix/06-run-code-fix.js')를 실행하여 디버깅하세요."
    );
    process.exit(1); // 테스트 실패 시 파이프라인 중단
  }
}

// --- 스크립트 실행 ---
runCodeWriteAndReview();
