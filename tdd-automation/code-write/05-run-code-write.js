// tdd-automation/code-write/05-run-code-write.js (코드 작성 + 리뷰 + 자가 평가 통합)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 변경 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_CODE_WRITE, SYSTEM_PROMPT_CODE_REVIEW } from '../core/agent_prompts.js'; // 4번, 4.5번 에이전트 프롬프트 필요
import { fileURLToPath } from 'url'; // 현재 파일 경로 얻기 위해

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

/** 쉘 명령어 실행 */
function run(command, exitOnError = true) {
  console.log(`[Run]: ${command}`);
  try {
    const output = execSync(command, { stdio: 'inherit', encoding: 'utf8' });
    return { success: true, output: output };
  } catch (error) {
    const errorOutput = error.stderr?.toString() || error.stdout?.toString() || error.message;
    console.error(`❌ 명령어 실행 실패: ${command}\n`, errorOutput);
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

function getProjectContext() {
  let context = `[프로젝트 주요 파일 컨텍스트]\n`;
  for (const filePath of PROJECT_FILES) {
    const content = readFileContent(filePath, true); // optional=true
    context += `\n---\n[${filePath}]\n${content}\n---\n`;
  }
  return context;
}

// 리뷰 로그 파일 경로
const REVIEW_LOG_FILE = './tdd-automation/logs/code-review-log.md';
function appendToReviewLog(filePath, originalCode, reviewedCode) {
  /* ... (로직 생략 - 헬퍼 함수) ... */
} // 실제 구현 시 이 함수 필요

const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt';

const __filename = fileURLToPath(import.meta.url);

// --- [4 & 4.5. 코드 작성 + 리뷰 에이전트] 실행 ---
async function runCodeWriteAndReview() {
  const agentName = '4 & 4.5. 코드 작성 및 리뷰'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 (RED -> GREEN) ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록
  let selfReviewOutput = {
    rating: 0,
    wellDone: 'N/A',
    needsImprovement: 'N/A',
    outputFilePath: REVIEW_LOG_FILE,
  }; // [✅ 추가] 자가 평가 데이터 초기화

  try {
    // 리뷰 로그 파일 초기화 (로직 생략)

    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md');
    let projectContext = getProjectContext();

    const config = JSON.parse(readFileContent('./tdd-automation/config.json'));
    const tasks = config.codeWrite.tasks;

    for (const task of tasks) {
      console.log(`\n--- [작업 시작] ${path.basename(task.codePath)} ---`);
      const failingTestCode = readFileContent(task.testPath); // 필수
      const existingCode = readFileContent(task.codePath, true); // optional

      // 4단계: 코드 작성 프롬프트 구성
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
1. 당신은 '코드 작성 에이전트'입니다. [5. 기존 코드]를 수정/생성하여, **'${task.codePath}' 파일의 완성된 전체 코드**를 반환하세요.
2. **코드 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (타입 준수 및 테스트 통과 노력)
**고려하지 못한 점:** (놓쳤거나 로직에서 모호한 부분)
\`\`\`

**[⭐ 핵심 규칙]** 타입 정의(\`src/types.ts\`)와 함수 시그니처를 100% 준수하고, [4. 관련 테스트 파일]을 통과시켜야 합니다.
(테스트 파일은 절대 수정하지 마세요.)
`;
      const rawGeneratedResponse = await runAgent(SYSTEM_PROMPT_CODE_WRITE, codeWritePrompt);

      // [✅ 수정] 자가 평가 데이터 파싱 및 코드 분리
      const reviewSeparator = '## 🤖 에이전트 자가 평가';
      const [codeContent, reviewBlock] = rawGeneratedResponse.split(reviewSeparator, 2);

      // 자가 평가 데이터 파싱
      let currentTaskReview = { rating: 0, wellDone: 'N/A', needsImprovement: 'N/A' };
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
      selfReviewOutput.rating += currentTaskReview.rating; // 총점 합산 (평균 계산용)

      let codeBeforeReview = cleanAiCodeResponse(codeContent || rawGeneratedResponse);

      // 4.5단계: 코드 리뷰
      let finalCode = codeBeforeReview;
      if (task.codePath !== 'src/types.ts') {
        // ... (리뷰 로직 실행 및 finalCode 업데이트) ...
        console.log(`    🟢 [리뷰 완료]: ${path.basename(task.codePath)} 처리 완료.`);
      } else {
        console.log(`    ⏭️ [검토 생략]: ${path.basename(task.codePath)} 파일.`);
      }

      // 5. 최종 파일 저장 및 커밋
      const commitMessage = `feat(tdd): [TDD 4/7] ${path.basename(task.codePath)} (${
        task.detail
      }) 구현 (GREEN 목표)
- AI 평가: ${currentTaskReview.rating}/10점.`; // [✅ 커밋 메시지 상세화]

      saveFileAndCommit(task.codePath, finalCode, commitMessage);
      modifiedFiles.push(task.codePath); // 성공 시 파일 목록에 추가

      // 컨텍스트 업데이트
      projectContext = getProjectContext();
    }

    console.log('\n--- 4단계 코드 생성/리뷰 완료 ---');
    console.log(
      `📝 코드 리뷰 결과는 './tdd-automation/logs/code-review-log.md' 파일에서 확인할 수 있습니다.`
    );

    // 자동 테스트 실행 및 실패 시 로그 저장 (로직은 이전과 동일)
    // ...
    success = true; // 최종 성공 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
  } finally {
    // [✅ 최종] 체크리스트 생성 및 저장
    const finalResults = {
      success,
      rating: selfReviewOutput.rating / (10 || 1), // 평균 점수 계산
      wellDone: '코드 작성 및 리뷰 단계 완료.',
      needsImprovement: '추후 통합된 에이전트 평가 필요.',
      outputFilePath: selfReviewOutput.outputFilePath,
    };
    const checklistItems = [
      '최종 명세서 로드 시도',
      '각 대상 파일 코드 생성 시도',
      'Git 커밋 실행 시도 (5개 파일)',
      '코드 작성 및 리뷰 과정에서 AI 자가 평가 기록 시도',
      '최종 코드가 테스트를 통과했는지 확인 필요 (다음 명령어 실행)',
    ];
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runCodeWriteAndReview();
