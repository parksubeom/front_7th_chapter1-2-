// tdd-automation/code-fix/06-run-code-fix.js (체크리스트 + 자가 평가 통합)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_CODE_WRITE } from '../core/agent_prompts.js'; // 코드 작성 프롬프트 재활용
import { fileURLToPath } from 'url'; // 현재 파일 경로 얻기 위해

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
        fs.mkdirSync(destDir, { recursive: true });
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
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isFailureLog = filePath.includes('logs/test-failure-log.txt');
      const isTypesFile = filePath.includes('src/types.ts');
      const isCodeFile =
        !filePath.includes('.spec.') && !isSpecFile && !isFailureLog && filePath.startsWith('src/');
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

const __filename = fileURLToPath(import.meta.url); // 현재 스크립트 파일 경로

// --- 2. [코드 수정 에이전트] 실행 ---

const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt'; // 실패 로그 경로

async function runCodeFix() {
  const agentName = '5. 코드 수정 (디버깅)'; // 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 ---`);
  let success = false; // 실행 성공 여부 플래그
  const modifiedFiles = []; // 변경된 파일 목록 기록
  const allTaskReviews = []; // [✅ 추가] 개별 작업 평가를 저장할 배열

  try {
    // 1. 공통 컨텍스트 로드
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // 명세서
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
      if (codePath.includes('types.ts') || codePath.includes('repeatUtils.ts')) {
        testPath = './src/__tests__/unit/repeatUtils.spec.ts';
      } else if (
        codePath.includes('useEventForm.ts') ||
        codePath.includes('useEventOperations.ts')
      ) {
        testPath = './src/__tests__/hooks/medium.useEventOperations.spec.ts';
      } else if (codePath.includes('useCalendarView.ts')) {
        testPath = './src/__tests__/hooks/easy.useCalendarView.spec.ts';
      } else {
        continue;
      }

      // 테스트 파일 존재 확인
      if (!fs.existsSync(testPath)) {
        console.error(`❌ 오류: 관련 테스트 파일(${testPath})을 찾을 수 없습니다.`);
        continue;
      }
      const failingTestCode = readFileContent(testPath); // 실패하는 테스트 코드

      // 프롬프트 구성 (실패 로그 및 자가 평가 요청 포함)
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

**[⭐ Typescript 및 타입 안전성 최종 규칙]**
1. **Types.ts의 역할:** Types.ts 파일은 데이터 모델의 최종 정의입니다. **해당 파일에 대한 수정은 타입을 확장하는 것만 허용**하며, 기존 타입 필드를 삭제하거나 과도하게 수정하여 다른 파일의 타입 안전성을 해치는 것은 절대 금지입니다.
2. **인자/Props 정확성:** 실패 로그에 명시된 타입 오류, 인자 불일치(Argument count mismatch), 혹은 Props 에러가 발생했다면, **호출부**와 **타입 정의**를 세심하게 비교하여 오류를 수정하십시오.

**수정된 파일의 완성된 전체 코드**만을 반환하세요.

**[⭐ 핵심 규칙]** 수정된 코드 다음에 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요.
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (디버깅 성공 및 테스트 통과 노력)
**고려하지 못한 점:** (놓쳤거나, 다른 파일을 수정했어야 했을 부분)
\`\`\`
`;

      // 3. AI 에이전트 실행
      const rawGeneratedResponse = await runAgent(SYSTEM_PROMPT_CODE_WRITE, prompt);

      // [✅ 추가] 자가 평가 데이터 파싱 및 코드 분리
      const reviewSeparator = '## 🤖 에이전트 자가 평가';
      const [codeContent, reviewBlock] = rawGeneratedResponse.split(reviewSeparator, 2);

      let currentTaskReview = {
        rating: 0,
        wellDone: 'N/A',
        needsImprovement: 'N/A',
        file: codePath,
      };
      if (reviewBlock) {
        const ratingMatch = reviewBlock.match(/점수:\s*(\d+)/i);
        // 잘한 점과 고려하지 못한 점 파싱 로직
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
      allTaskReviews.push(currentTaskReview); // 배열에 저장

      const fixedCode = cleanAiCodeResponse(codeContent || rawGeneratedResponse); // 코드 부분만 추출

      // 4. 파일 덮어쓰기 및 커밋 (변경 시에만)
      const commitMessage = `fix(tdd): [TDD 5/5] ${path.basename(
        codePath
      )} 자동 버그 수정 시도 (GREEN 목표)
- AI 평가: ${currentTaskReview.rating}/10점.
- 실패 분석: ${currentTaskReview.needsImprovement.substring(0, 100)}...`; // [✅ 커밋 메시지 상세화]

      saveFileAndCommit(codePath, fixedCode, commitMessage);
      modifiedFiles.push(codePath); // 성공 시 파일 목록에 추가

      // [중요] 컨텍스트 업데이트: 다음 파일 수정을 위해 최신 코드로 업데이트
      projectContext = getProjectContext();
    }

    console.log('\n--- 5단계 (수정 시도) 완료 ---');
    console.log(
      "✅ [중요] 'pnpm test'를 실행하여 모든 테스트가 '통과(GREEN)'하는지 다시 확인하세요!"
    );
    success = true; // 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
  } finally {
    // [✅ 최종] 체크리스트 생성 및 저장
    const totalRating = allTaskReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating =
      allTaskReviews.length > 0 ? (totalRating / allTaskReviews.length).toFixed(1) : 0;

    const checklistItems = [
      '최종 명세서 로드 시도',
      '프로젝트 컨텍스트 로드 시도',
      '테스트 실패 로그 파일 로드 및 유효성 검사 시도',
      `실패 로그 기반으로 ${allTaskReviews.length}개 파일 코드 수정 시도`,
      '수정 시 타입 및 시그니처 준수 시도 (AI 확인 필요)',
      '변경된 코드 파일 Git 커밋 실행 시도 (변경 시)',
      `AI 평균 자가 평가 점수: ${averageRating}/10점`,
      '수정 완료 후, 최종적으로 테스트 통과(GREEN) 확인 필요.',
    ];

    const finalResults = {
      success,
      rating: averageRating, // 평균 점수 사용
      wellDone: success
        ? '테스트 실패 로그를 분석하여 버그 수정에 성공했습니다.'
        : '테스트를 통과하지 못하여 추가적인 디버깅이 필요합니다.',
      needsImprovement: `수정 대상 파일 목록: ${modifiedFiles.join(', ')}`,
      detailedReviews: allTaskReviews, // 상세 리뷰 데이터 추가
      outputFilePath: TEST_LOG_PATH,
    };

    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runCodeFix();
