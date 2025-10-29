// tdd-automation/test-write/04-run-test-write.js (체크리스트 추가)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_TEST_WRITE } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

// --- 1. 헬퍼 함수: AI 코드 정리 ---
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|ts|js)?\s*[\r\n]/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  return cleaned;
}

// --- 2. 헬퍼 함수: 쉘 명령어 실행 (Git) ---
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

// --- 3. 헬퍼 함수: 파일 저장 및 커밋 ---
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

// --- 4. 헬퍼 함수: 파일 내용 안전하게 읽기 ---
const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // [수정] logs 폴더 경로 반영
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isTypesFile = filePath.includes('src/types.ts');
      // [수정] .spec 파일은 이 단계에서 필수로 존재해야 함
      const isTestSpecFile = filePath.includes('.spec.');

      if (!optional && (isSpecFile || isTypesFile || isTestSpecFile)) {
        // 필수로 간주되는 파일
        console.error(
          `❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다. 이전 단계를 확인하세요.`
        );
        process.exit(1);
      } else if (optional) {
        // 선택적 파일
        console.warn(`[Context]: 선택적 파일 ${filePath} 없음.`);
        return `// [정보] 파일 ${filePath} 없음.`;
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

const __filename = fileURLToPath(import.meta.url); // [✅ 추가] 현재 스크립트 파일 경로

// --- [3. 테스트 코드 작성 에이전트] 실행 ---
async function runTestWrite() {
  const agentName = '3. 테스트 코드 작성 (로직 구현)'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 (RED - Logic) ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록

  try {
    // [✅ 추가] 메인 로직을 try 블록으로 감쌈
    // 1. 최종 명세서 로드 (필수)
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // [수정] 경로 변경

    // 2. 핵심 컨텍스트 로드: 타입, 테스트 유틸리티, API 핸들러 (필수)
    const typesContext = readFileContent('src/types.ts');
    const setupTestsContext = readFileContent('src/setupTests.ts', true); // optional=true
    const handlersContext = readFileContent('src/__mocks__/handlers.ts', true); // optional=true
    const handlersUtilsContext = readFileContent('src/__mocks__/handlersUtils.ts', true); // optional=true
    const testUtilsGeneralContext = readFileContent('src/__tests__/utils.ts', true); // optional=true
    const dateUtilsContext = readFileContent('src/utils/dateUtils.ts', true); // optional=true
    const eventUtilsContext = readFileContent('src/utils/eventUtils.ts', true); // optional=true

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
      // 2단계에서 생성/수정된 빈 셸 파일 존재 확인 (필수)
      if (!fs.existsSync(testPath)) {
        console.error(
          `❌ 오류: 빈 테스트 셸 파일 ${testPath} 이(가) 없습니다. 2단계를 먼저 실행하세요.`
        );
        // 이 경우, 성공 플래그를 false로 두고 finally에서 처리되도록 함
        throw new Error(`Prerequisite file missing: ${testPath}`);
      }

      console.log(`\n... ${path.basename(testPath)} 파일의 테스트 로직 구현 중 ...`);

      // 3a. '빈 껍데기' 테스트 코드 읽기
      const emptyTestCode = readFileContent(testPath); // 필수 파일

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
- 제공된 컨텍스트(특히 \`src/types.ts\`, \`handlers.ts\`)의 타입/시그니처를 100% 준수해야 합니다.
- Mock 데이터는 \`src/types.ts\` 정의와 정확히 일치해야 합니다.
- API 모킹에는 \`handlers.ts\`/\`handlersUtils.ts\` 를 최우선 활용하세요.
- 명세서 요구사항(엣지 케이스 포함)을 빠짐없이 검증하세요.
`;

      // 3c. AI 에이전트 실행 및 응답 정리
      const rawFilledCode = await runAgent(SYSTEM_PROMPT_TEST_WRITE, prompt);
      const filledTestCode = cleanAiCodeResponse(rawFilledCode);

      // 3d. 파일 덮어쓰기 및 커밋 (변경 시에만)
      saveFileAndCommit(
        testPath, // 기존 파일 경로에 덮어쓰기
        filledTestCode,
        `test(tdd): [TDD 3/5] ${path.basename(testPath)} 테스트 로직 구현`
      );
      modifiedFiles.push(testPath); // 성공 시 파일 목록에 추가
    }

    console.log('\n--- 3단계 완료 ---');
    console.log(
      "✅ [중요] 'pnpm test'를 실행하여 테스트가 '실패(RED)'하는지 확인하고 로그를 저장하세요!"
    );
    console.log(
      '   명령어: (pnpm test > ./tdd-automation/logs/test-failure-log.txt) || (exit /b 0)'
    );
    console.log('➡️ 테스트 실패를 확인했다면 다음 [4단계: 코드 작성]을 요청해주세요.');
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
    // success 플래그는 false 유지 (finally에서 처리)
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const checklistItems = [
      '최종 명세서 로드 시도',
      '타입, 테스트 유틸리티, 핸들러 컨텍스트 로드 시도',
      "각 테스트 파일의 빈 'it' 블록에 테스트 로직 구현 시도",
      '구현 시 타입 및 시그니처 준수 시도 (AI 확인 필요)',
      '구현 시 Mock 데이터 타입 일치 검증 시도 (AI 확인 필요)',
      '구현 시 API Mock 핸들러 활용 시도 (AI 확인 필요)',
      '변경된 테스트 파일 Git 커밋 실행 시도',
    ];
    // outputFilePath 대신 변경된 파일 목록 전달
    saveAgentChecklist(agentName, __filename, { success, modifiedFiles }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runTestWrite();
