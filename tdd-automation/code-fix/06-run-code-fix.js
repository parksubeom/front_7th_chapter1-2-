// tdd-automation/06-run-code-fix.js (Fix/Debug Step - Final Version)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js'; // runAgent.js (재시도 로직 포함 버전) 필요
import { SYSTEM_PROMPT_CODE_WRITE } from '../core/agent_prompts.js'; // agent_prompts.js (최종 보강 버전, 실패 로그 처리 규칙 포함) 필요

// --- 1. 헬퍼 함수 정의 (통합 완료) ---

function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|ts|js)?\s*[\r\n]/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  return cleaned;
}

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
    // 실패 시 에러 객체 또는 출력 반환
    return { success: false, output: errorOutput };
  }
}

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
    // saveFileAndCommit 실패는 치명적이므로 중단
    process.exit(1);
  }
}

const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      if (!optional) {
        // 필수 파일인 경우
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else {
        // 선택적 파일인 경우
        console.warn(`[Context]: 선택적 파일 ${filePath} 없음.`);
        return `// [정보] 파일 ${filePath} 없음.`;
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

// --- 2. [코드 수정 에이전트] 실행 ---

const TEST_LOG_PATH = './tdd-automation/test-failure-log.txt'; // 실패 로그 파일 경로

async function runCodeFix() {
  console.log('--- 5단계: [코드 수정 에이전트] 실행 (Debugging) ---');

  // 1. 공통 컨텍스트 로드
  const specMarkdown = readFileContent('./tdd-automation/output-02-feature-spec.md');
  let projectContext = getProjectContext(); // 현재 코드 상태 포함
  const failureLog = readFileContent(TEST_LOG_PATH); // 실패 로그

  if (failureLog.includes('파일 없음') || failureLog.length < 10) {
    // 로그 유효성 검사 강화
    console.error('\n❌ 치명적 오류: 유효한 테스트 실패 로그 파일을 찾을 수 없습니다.');
    console.log(
      "👉 'pnpm test > ./tdd-automation/test-failure-log.txt || true' 명령어를 먼저 실행해야 합니다."
    );
    return;
  }

  // 2. 수정 대상 파일 목록 (4단계와 동일)
  const filesToFix = [
    // 순서 중요: 타입 -> 의존성 낮은 유틸 -> 훅 순서
    'src/types.ts',
    'src/utils/repeatUtils.ts',
    'src/hooks/useEventForm.ts',
    'src/hooks/useCalendarView.ts',
    'src/hooks/useEventOperations.ts',
  ];

  for (const codePath of filesToFix) {
    // 수정 대상 파일이 실제로 존재하는지 확인 (4단계에서 생성되었어야 함)
    if (!fs.existsSync(codePath)) {
      console.warn(`[Skip]: 수정 대상 파일 ${codePath} 이(가) 없습니다. 4단계 실행을 확인하세요.`);
      continue;
    }

    console.log(`\n... [수정 작업] ${path.basename(codePath)} 파일 재검토 및 수정 중 ...`);

    // 관련 테스트 파일 경로 추정 (이전 답변에서 수정된 로직)
    let testPath;
    if (codePath === 'src/types.ts') {
      testPath = './src/__tests__/unit/repeatUtils.spec.ts'; // 대표 테스트 파일
      console.log(`    ℹ️ types.ts 수정: 대표 테스트 파일(${testPath}) 참조`);
    } else if (codePath === 'src/utils/repeatUtils.ts') {
      testPath = './src/__tests__/unit/repeatUtils.spec.ts';
    } else if (codePath === 'src/hooks/useEventForm.ts') {
      testPath = './src/__tests__/hooks/medium.useEventOperations.spec.ts'; // 연관 테스트 파일
      console.log(`    ℹ️ useEventForm.ts 수정: 연관 테스트 파일(${testPath}) 참조`);
    } else if (codePath === 'src/hooks/useCalendarView.ts') {
      testPath = './src/__tests__/hooks/easy.useCalendarView.spec.ts';
    } else if (codePath === 'src/hooks/useEventOperations.ts') {
      testPath = './src/__tests__/hooks/medium.useEventOperations.spec.ts';
    } else {
      console.error(`❌ 오류: ${codePath}에 대한 테스트 파일 경로를 결정할 수 없습니다.`);
      continue; // 이 파일 건너뛰기
    }

    let failingTestCode; // scope 확장
    try {
      failingTestCode = readFileContent(testPath); // 필수 파일로 처리
    } catch (e) {
      // readFileContent가 이미 에러 처리 및 종료
      continue; // 다음 task로
    }

    const prompt = `
[1. 최종 명세서]
${specMarkdown}
[2. 전체 프로젝트 컨텍스트 (현재 코드 상태)]
${projectContext}
[3. 테스트 실패 로그 (가장 중요!)]
${failureLog}

[4. 이 파일의 기존 코드 (수정 대상): ${codePath}]
${readFileContent(codePath)}

[5. 관련 테스트 코드 (수정 금지)]
${failingTestCode}

[지시]
당신은 '코드 수정 에이전트'입니다. 제공된 **[3. 테스트 실패 로그]** 와
[5. 관련 테스트 코드]를 최우선으로 분석하여, 오직 **[4. 이 파일의 기존 코드]** 만 수정하여
테스트를 통과(GREEN)시키도록 코드를 수정하십시오.
(특히 실패 로그에 명시된 타입 오류, 인자 불일치, 로직 오류 등을 수정하십시오.)
**수정된 파일의 완성된 전체 코드**만을 반환하세요.
`;

    // 3. AI 에이전트 실행
    const rawCode = await runAgent(SYSTEM_PROMPT_CODE_WRITE, prompt); // 코드 작성 프롬프트 재활용
    const fixedCode = cleanAiCodeResponse(rawCode);

    // 4. 파일 덮어쓰기 및 커밋 (변경 시에만)
    saveFileAndCommit(
      codePath,
      fixedCode,
      `fix(tdd): [TDD 4.5] ${path.basename(codePath)} 자동 버그 수정 시도 (GREEN 목표)` // 커밋 메시지 변경
    );

    // [중요] 컨텍스트 업데이트: 다음 파일 수정을 위해 최신 코드로 업데이트
    projectContext = getProjectContext();
  }

  console.log('\n--- 5단계 (수정 시도) 완료 ---');
  console.log(
    "✅ [중요] 'pnpm test'를 실행하여 모든 테스트가 '통과(GREEN)'하는지 다시 확인하세요!"
  );
  console.log('➡️ 테스트 통과를 확인했다면 최종 [6단계: 리팩토링]을 요청해주세요.');
}

// --- 스크립트 실행 ---
runCodeFix();
