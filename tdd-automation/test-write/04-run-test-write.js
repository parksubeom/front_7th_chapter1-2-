// tdd-automation/04-run-test-write.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js'; // runAgent.js (재시도 로직 포함 버전) 필요
import { SYSTEM_PROMPT_TEST_WRITE } from '../core/agent_prompts.js'; // agent_prompts.js (최종 보강 버전) 필요

// --- 1. 헬퍼 함수: AI 코드 정리 ---
/**
 * AI가 반환한 텍스트에서 ```typescript ... ``` 마크다운을 제거합니다.
 * @param {string} aiResponse - AI의 원본 응답 텍스트.
 * @returns {string} 순수한 코드 텍스트.
 */
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return ''; // 빈 응답 처리
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|ts|js)?\s*[\r\n]/im, '') // 시작 태그 (대소문자 무시, 여러 줄)
    .replace(/```\s*$/im, '') // 끝 태그 (대소문자 무시, 여러 줄)
    .trim();
  return cleaned;
}

// --- 2. 헬퍼 함수: 쉘 명령어 실행 (Git) ---
/**
 * 쉘 명령어를 동기적으로 실행합니다. 에러 발생 시 종료합니다.
 * @param {string} command - 실행할 명령어 (예: 'git add .').
 */
function run(command) {
  console.log(`[Run]: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', encoding: 'utf8' });
  } catch (error) {
    console.error(`❌ 명령어 실행 실패: ${command}`, error.stderr || error.message);
    process.exit(1); // 에러 시 파이프라인 중단
  }
}

// --- 3. 헬퍼 함수: 파일 저장 및 커밋 ---
/**
 * 내용을 파일에 저장하고 Git에 커밋합니다. 필요 시 디렉토리를 생성합니다.
 * @param {string} filePath - 프로젝트 루트 기준 파일 저장 경로.
 * @param {string} content - 파일에 쓸 내용.
 * @param {string} commitMessage - Git 커밋 메시지.
 */
function saveFileAndCommit(filePath, content, commitMessage) {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath); // 절대 경로 확인
    const destDir = path.dirname(absolutePath);

    // 디렉토리가 없으면 생성
    if (!fs.existsSync(destDir)) {
      // mkdirSync에 전달할 경로는 현재 작업 디렉토리 기준 상대 경로가 더 안전할 수 있습니다.
      const relativeDestDir = path.relative(process.cwd(), destDir);
      // 상대 경로 디렉토리가 존재하지 않는 경우 생성
      if (relativeDestDir && !fs.existsSync(relativeDestDir)) {
        fs.mkdirSync(relativeDestDir, { recursive: true });
        console.log(`[FS]: 디렉토리 생성됨: ${relativeDestDir}`);
      } else if (!relativeDestDir) {
        // destDir이 루트이거나 이미 존재하는 경우 (절대 경로로 생성 시도)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
          console.log(`[FS]: 디렉토리 생성됨: ${destDir}`);
        }
      }
    }

    // 절대 경로로 파일 쓰기 (덮어쓰기)
    fs.writeFileSync(absolutePath, content);
    console.log(`[FS]: 파일 저장됨: ${filePath}`);

    // 상대 경로로 Git 작업 수행
    run(`git add "${filePath}"`); // 경로에 공백 가능성 대비 따옴표 사용
    process.env.GIT_COMMIT_MSG = commitMessage; // 여러 줄 메시지 위해 환경 변수 사용
    run(`git commit -m "$GIT_COMMIT_MSG"`);
  } catch (error) {
    console.error(`❌ 파일 저장 또는 커밋 실패: ${filePath}`, error);
    process.exit(1); // 에러 시 파이프라인 중단
  }
}

// --- 4. 헬퍼 함수: 파일 내용 안전하게 읽기 ---
/**
 * 파일 내용을 안전하게 읽습니다. 필수 파일 누락 시 치명적 오류로 종료합니다.
 * @param {string} filePath - 프로젝트 루트 기준 파일 경로.
 * @returns {string} 파일 내용 또는 에러 상황 처리.
 */
const readFileContent = (filePath) => {
  try {
    // 현재 작업 디렉토리 기준 상대 경로 확인
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    // 오류가 "파일 없음"인지 확인
    if (e.code === 'ENOENT') {
      // 필수 파일: 명세서, 타입 정의, 테스트 셸 파일
      if (
        filePath.includes('output-02-feature-spec.md') ||
        filePath.includes('src/types.ts') ||
        filePath.includes('.spec.')
      ) {
        console.error(
          `❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다. 이전 단계를 확인하세요.`
        );
        process.exit(1);
      }
      // 기타 컨텍스트 파일 (유틸리티, 설정) - 경고 후 빈 문자열 반환
      else {
        console.warn(
          `[Context]: 선택적 컨텍스트 파일 ${filePath} 을(를) 찾을 수 없습니다. 해당 정보 없이 진행합니다.`
        );
        return `// [정보] 파일 ${filePath} 없음.`;
      }
    } else {
      // 기타 읽기 오류 (권한 등)
      console.error(`❌ 치명적 오류: 파일 ${filePath} 을(를) 읽을 수 없습니다.`, e.message);
      process.exit(1);
    }
  }
};

// --- [3. 테스트 코드 작성 에이전트] 실행 ---
async function runTestWrite() {
  console.log('--- 3단계: [테스트 코드 작성 에이전트] 실행 시작 (RED - Logic) ---');

  // 1. 최종 명세서 로드 (필수)
  const specMarkdown = readFileContent('./tdd-automation/output-02-feature-spec.md');

  // 2. 핵심 컨텍스트 로드: 타입, 테스트 유틸리티, API 핸들러 (필수)
  const typesContext = readFileContent('src/types.ts');
  const setupTestsContext = readFileContent('src/setupTests.ts');
  const handlersContext = readFileContent('src/__mocks__/handlers.ts');
  const handlersUtilsContext = readFileContent('src/__mocks__/handlersUtils.ts');
  const testUtilsGeneralContext = readFileContent('src/__tests__/utils.ts');
  const dateUtilsContext = readFileContent('src/utils/dateUtils.ts'); // 테스트 로직 작성 시 필요
  const eventUtilsContext = readFileContent('src/utils/eventUtils.ts'); // 필요할 수 있음

  const fullTestContext = `
[src/types.ts - 타입 정의]
${typesContext}

[src/setupTests.ts - 테스트 설정]
${setupTestsContext}

[src/__mocks__/handlers.ts - API Mock 핸들러]
${handlersContext}

[src/__mocks__/handlersUtils.ts - Mock 핸들러 유틸]
${handlersUtilsContext}

[src/__tests__/utils.ts - 일반 테스트 유틸]
${testUtilsGeneralContext}

[src/utils/dateUtils.ts - 날짜 유틸리티]
${dateUtilsContext}

[src/utils/eventUtils.ts - 이벤트 유틸리티]
${eventUtilsContext}
`;

  // 3. 로직을 채워야 할 테스트 파일 목록
  const testPaths = [
    './src/__tests__/unit/repeatUtils.spec.ts',
    './src/__tests__/hooks/medium.useEventOperations.spec.ts',
    './src/__tests__/hooks/easy.useCalendarView.spec.ts',
  ];

  for (const testPath of testPaths) {
    // 2단계에서 생성/수정된 빈 셸 파일이 존재하는지 확인
    if (!fs.existsSync(testPath)) {
      console.error(
        `❌ 오류: 빈 테스트 셸 파일 ${testPath} 이(가) 없습니다. 2단계를 먼저 실행하세요.`
      );
      continue; // 다음 파일로 건너뛰기
    }

    console.log(`\n... ${path.basename(testPath)} 파일의 테스트 로직 구현 중 ...`);

    // 3a. '빈 껍데기' 테스트 코드 읽기
    const emptyTestCode = readFileContent(testPath);

    // 3b. AI에게 전달할 프롬프트 구성
    const prompt = `
[1. 최종 기능 명세서]
${specMarkdown}

[2. 테스트 유틸리티, 타입 및 핸들러 컨텍스트]
${fullTestContext}

[3. 빈 테스트 파일 셸: ${testPath}]
${emptyTestCode}

[지시]
당신은 '테스트 코드 작성 에이전트'입니다.
[빈 테스트 파일 셸](${testPath})의 비어있는 'it' 블록 내부를
실제 테스트 로직(Mock 데이터 생성, 함수 호출, \`vi.spyOn\` 또는 컨텍스트의 MSW 핸들러 사용, \`expect\` 단언문)으로 채워주세요.

**[⭐ 핵심 규칙]**
- 제공된 컨텍스트(특히 \`src/types.ts\`, \`handlers.ts\`, 유틸리티)에 정의된 **모든 함수와 타입의 인자 시그니처를 100% 준수**하여 테스트 코드를 작성해야 합니다. 기본적인 타입 에러나 인자 누락을 발생시키는 코드를 작성하지 마세요.
- 모든 Mock 데이터(예: \`Event\` 객체)는 \`src/types.ts\` 정의와 **정확히 일치**해야 합니다.
- API 모킹에는 \`handlers.ts\` 와 \`handlersUtils.ts\` 를 **최우선으로 활용**하세요.
- 명세서의 요구사항(엣지 케이스 포함)을 **빠짐없이 검증**하는 테스트 로직을 작성하세요.
`;

    // 3c. AI 에이전트 실행 및 응답 정리
    const rawFilledCode = await runAgent(SYSTEM_PROMPT_TEST_WRITE, prompt);
    const filledTestCode = cleanAiCodeResponse(rawFilledCode);

    // 3d. 파일 덮어쓰기 및 커밋
    saveFileAndCommit(
      testPath, // 기존 파일 경로에 덮어쓰기
      filledTestCode,
      `test(tdd): [TDD 3/5] ${path.basename(testPath)} 테스트 로직 구현

      AI '테스트 코드 작성 에이전트'가
      '${testPath}'의 빈 케이스들을 실제 테스트 로직으로 채웁니다.`
    );
  }

  console.log('\n--- 3단계 완료 ---');
  console.log(
    "✅ [중요] 'pnpm test'를 실행하여 테스트가 '실패(RED)'하는지 확인하고 로그를 저장하세요!"
  );
  console.log('   명령어: pnpm test > ./tdd-automation/test-failure-log.txt || true');
  console.log('➡️ 테스트 실패를 확인했다면 다음 [4단계: 코드 작성]을 요청해주세요.');
}

// --- 스크립트 실행 ---
runTestWrite();
