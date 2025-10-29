// tdd-automation/code-fix/06-run-code-fix.js (체크리스트 추가)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_CODE_WRITE } from '../core/agent_prompts.js'; // 코드 작성 프롬프트 재활용
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

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
  // exitOnError 추가
  console.log(`[Run]: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf8' });
    return { success: true, output: '' };
  } catch (error) {
    const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message;
    console.error(`❌ 명령어 실행 실패: ${command}`, errorOutput);
    if (exitOnError) {
      process.exit(1);
    }
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

const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // [수정] logs 폴더 경로 반영
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      // [수정] 실패 로그 파일 경로 반영
      const isFailureLog = filePath.includes('logs/test-failure-log.txt');
      const isTypesFile = filePath.includes('src/types.ts');
      // 수정 대상 코드 파일은 필수
      const isCodeFile =
        !filePath.includes('.spec.') && !isSpecFile && !isFailureLog && filePath.startsWith('src/');
      // 테스트 파일도 이 단계에서는 필수
      const isTestFile = filePath.includes('.spec.');

      // 필수 파일 누락 시 오류 처리 강화
      if (!optional && (isSpecFile || isTypesFile || isFailureLog || isCodeFile || isTestFile)) {
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else if (optional) {
        // 선택적 컨텍스트 파일
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
  'src/utils/repeatUtils.ts',
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

const __filename = fileURLToPath(import.meta.url); // [✅ 추가] 현재 스크립트 파일 경로

// --- 2. [코드 수정 에이전트] 실행 ---

const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt'; // [수정] 경로 변경

async function runCodeFix() {
  const agentName = '5. 코드 수정 (디버깅)'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록

  try {
    // [✅ 추가] 메인 로직을 try 블록으로 감쌈
    // 1. 공통 컨텍스트 로드
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // [수정] 경로 변경
    let projectContext = getProjectContext(); // 현재 코드 상태 포함
    const failureLog = readFileContent(TEST_LOG_PATH); // 실패 로그 (필수)

    // 로그 파일 유효성 검사 강화
    if (failureLog.includes('파일 없음') || failureLog.length < 10) {
      console.error('\n❌ 치명적 오류: 유효한 테스트 실패 로그 파일을 찾을 수 없습니다.');
      console.log(`👉 '${TEST_LOG_PATH}' 파일이 존재하고 내용이 있는지 확인하세요.`);
      throw new Error('Missing or invalid test failure log.'); // 에러를 던져 finally에서 처리
    }

    // 2. 수정 대상 파일 목록
    const filesToFix = [
      'src/types.ts',
      'src/utils/repeatUtils.ts',
      'src/hooks/useEventForm.ts',
      'src/hooks/useCalendarView.ts',
      'src/hooks/useEventOperations.ts',
    ];

    for (const codePath of filesToFix) {
      // 수정 대상 파일 존재 확인
      if (!fs.existsSync(codePath)) {
        console.warn(
          `[Skip]: 수정 대상 파일 ${codePath} 이(가) 없습니다. 4단계 실행을 확인하세요.`
        );
        continue;
      }

      console.log(`\n... [수정 작업] ${path.basename(codePath)} 파일 재검토 및 수정 중 ...`);

      // 관련 테스트 파일 경로 추정 (경로 규칙에 따라)
      let testPath;
      if (codePath === 'src/types.ts') {
        testPath = './src/__tests__/unit/repeatUtils.spec.ts';
      } else if (codePath === 'src/utils/repeatUtils.ts') {
        testPath = './src/__tests__/unit/repeatUtils.spec.ts';
      } else if (codePath === 'src/hooks/useEventForm.ts') {
        testPath = './src/__tests__/hooks/medium.useEventOperations.spec.ts';
      } else if (codePath === 'src/hooks/useCalendarView.ts') {
        testPath = './src/__tests__/hooks/easy.useCalendarView.spec.ts';
      } else if (codePath === 'src/hooks/useEventOperations.ts') {
        testPath = './src/__tests__/hooks/medium.useEventOperations.spec.ts';
      } else {
        continue;
      } // 해당 없으면 건너뛰기

      // 테스트 파일 존재 확인
      if (!fs.existsSync(testPath)) {
        console.error(`❌ 오류: 관련 테스트 파일(${testPath})을 찾을 수 없습니다.`);
        continue; // 이 파일 건너뛰기
      }
      const failingTestCode = readFileContent(testPath); // 실패하는 테스트 코드

      // 프롬프트 구성 (실패 로그 포함)
      const prompt = `
[1. 최종 명세서]
${specMarkdown}
[2. 전체 프로젝트 컨텍스트 (현재 코드 상태)]
${projectContext}
[3. 테스트 실패 로그 (가장 중요!)]
${failureLog}
[4. 이 파일의 기존 코드 (수정 대상): ${codePath}]
${readFileContent(codePath)} // 현재 파일 내용 로드
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
        `fix(tdd): [TDD 5/5] ${path.basename(codePath)} 자동 버그 수정 시도 (GREEN 목표)` // 커밋 메시지 변경
      );
      modifiedFiles.push(codePath); // 성공 시 파일 목록에 추가

      // [중요] 컨텍스트 업데이트: 다음 파일 수정을 위해 최신 코드로 업데이트
      projectContext = getProjectContext();
    }

    console.log('\n--- 5단계 (수정 시도) 완료 ---');
    console.log(
      "✅ [중요] 'pnpm test'를 실행하여 모든 테스트가 '통과(GREEN)'하는지 다시 확인하세요!"
    );
    console.log(
      '➡️ 테스트 통과를 확인했다면 최종 [6단계: UI 구현] 또는 [7단계: 리팩토링]을 요청해주세요.'
    );
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
    // success 플래그는 false 유지 (finally에서 처리)
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const checklistItems = [
      '최종 명세서 로드 시도',
      '프로젝트 컨텍스트 로드 시도',
      '테스트 실패 로그 파일 로드 및 유효성 검사 시도',
      '실패 로그 기반으로 각 대상 파일 코드 수정 시도 (types.ts, repeatUtils.ts, useEventForm.ts, useCalendarView.ts, useEventOperations.ts)',
      '수정 시 타입 및 시그니처 준수 시도 (AI 확인 필요)',
      '변경된 코드 파일 Git 커밋 실행 시도 (변경 시)',
    ];
    // outputFilePath 대신 변경된 파일 목록 전달
    saveAgentChecklist(agentName, __filename, { success, modifiedFiles }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runCodeFix();
