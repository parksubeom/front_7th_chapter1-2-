// tdd-automation/test-write/04-run-test-write.js (체크리스트 + 자가 평가 통합)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_TEST_WRITE } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

// [추가] 정규 표현식: it(...) 블록의 내용(테스트 제목)을 추출
const TEST_TITLE_REGEX = /it\s*\(['"](.+?)['"]/g;

// --- 1. 헬퍼 함수 정의 ---

/** AI 응답에서 코드 블록 마크다운 제거 */
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|ts|js)?\s*[\r\n]/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  return cleaned;
}

/** 쉘 명령어 실행 (Git) */
function run(command, exitOnError = true) {
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

/** 파일 저장 및 커밋 */
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

// --- 4. 헬퍼 함수: 파일 내용 안전하게 읽기 ---
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
        // 선택적 파일 (컨텍스트)
        console.warn(`[Context]: 선택적 파일 ${filePath} 없음.`);
        return `// [정보] 파일 ${filePath} 없음.`;
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

/** [✅ 추가] 테스트 요약 Markdown 포맷터 */
function formatTestSummary(summaryArray) {
  let md = `# 📝 3단계 테스트 로직 구현 요약\n\n`;
  md += `이 문서는 TDD 3단계에서 로직이 구현된 테스트 파일 및 케이스의 목록입니다. 이 테스트들은 현재 구현 코드가 없어 실패(RED) 상태여야 합니다.\n\n`;

  summaryArray.forEach((item) => {
    md += `---\n`;
    md += `## 🧪 ${path.basename(item.path)} \n`;
    md += `**목적:** ${item.detail}\n\n`;
    md += `**▶️ 구현된 테스트 케이스 (${item.titles.length}개):**\n`;
    item.titles.forEach((title, index) => {
      md += `* [x] ${title}\n`;
    });
    md += '\n';
  });

  return md;
}

const __filename = fileURLToPath(import.meta.url); // [✅ 추가] 현재 스크립트 파일 경로
const TEST_LOG_PATH = './tdd-automation/logs/test-failure-log.txt'; // 로그 경로 정의

// --- [3. 테스트 코드 작성 에이전트] 실행 ---
async function runTestWrite() {
  const agentName = '3. 테스트 코드 작성 (로직 구현)'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 (RED - Logic) ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경된 파일 목록 기록
  let selfReviewOutput = {
    rating: 0,
    wellDone: 'N/A',
    needsImprovement: 'N/A',
    outputFilePath: TEST_LOG_PATH,
  }; // [✅ 수정] 자가 평가 데이터 구조 초기화
  const createdTestsSummary = []; // [✅ 추가] 테스트 요약 배열

  try {
    // 1. 최종 명세서 로드 (필수)
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md');

    // 2. 핵심 컨텍스트 로드: 타입, 테스트 유틸리티, API 핸들러 (필수)
    const typesContext = readFileContent('src/types.ts');
    const fullTestContext = `
[src/types.ts - 타입 정의]
${typesContext}
[src/setupTests.ts - 테스트 설정]
${readFileContent('src/setupTests.ts', true)}
[src/__mocks__/handlers.ts - API Mock 핸들러]
${readFileContent('src/__mocks__/handlers.ts', true)}
[src/__mocks__/handlersUtils.ts - Mock 핸들러 유틸]
${readFileContent('src/__mocks__/handlersUtils.ts', true)}
[src/__tests__/utils.ts - 일반 테스트 유틸]
${readFileContent('src/__tests__/utils.ts', true)}
[src/utils/dateUtils.ts - 날짜 유틸리티]
${readFileContent('src/utils/dateUtils.ts', true)}
[src/utils/eventUtils.ts - 이벤트 유틸리티]
${readFileContent('src/utils/eventUtils.ts', true)}
`;

    // 3. 로직을 채워야 할 테스트 파일 목록
    const testTargets = [
      {
        path: './src/__tests__/unit/repeatUtils.spec.ts',
        detail: "'generateRecurringEvents' 함수용",
      },
      {
        path: './src/__tests__/hooks/medium.useEventOperations.spec.ts',
        detail: '반복 일정 수정/삭제용',
      },
      { path: './src/__tests__/hooks/easy.useCalendarView.spec.ts', detail: '반복 일정 렌더링용' },
    ];

    for (const target of testTargets) {
      const testPath = target.path;

      // 2단계에서 생성/수정된 빈 셸 파일 존재 확인 (필수)
      if (!fs.existsSync(testPath)) {
        console.error(
          `❌ 오류: 빈 테스트 셸 파일 ${testPath} 이(가) 없습니다. 2단계를 먼저 실행하세요.`
        );
        throw new Error(`Prerequisite file missing: ${testPath}`);
      }

      console.log(`\n... ${path.basename(testPath)} 파일의 테스트 로직 구현 중 ...`);

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
1. 당신은 '테스트 코드 작성 에이전트'입니다. [빈 테스트 파일 셸](${testPath})의 비어있는 'it' 블록 내부를 실제 테스트 로직(Mock 데이터 생성, 함수 호출, \`expect\` 단언문)으로 채우세요.
2. **코드 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (Mock 데이터 정확성, API 핸들러 활용도 등)
**고려하지 못한 점:** (놓치거나 모호하게 남긴 부분)
\`\`\`

**[⭐ 핵심 규칙]**
- 제공된 컨텍스트의 타입/시그니처를 100% 준수하여 테스트 코드를 작성해야 합니다. 기본적인 타입 에러나 인자 누락을 발생시키는 코드를 작성하지 마세요.
- **최종 결과물은 테스트 코드와 자가 평가 블록을 모두 포함해야 합니다.**
`;

      // 3c. AI 에이전트 실행 및 응답 분리
      const rawResponse = await runAgent(SYSTEM_PROMPT_TEST_WRITE, prompt);
      const reviewSeparator = '## 🤖 에이전트 자가 평가';
      const [testCodeContent, reviewBlock] = rawResponse.split(reviewSeparator, 2);

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

      // 테스트 코드 내용 정리 (코드 블록 정리)
      const finalTestCode = cleanAiCodeResponse(testCodeContent || rawResponse);

      // [✅ 커밋 메시지 개선] - 파일 목적 및 AI 평가 정보 포함
      const commitMessage = `test(tdd): [TDD 3/5] ${path.basename(testPath)} 로직 구현 (RED)

- **목적:** '${target.detail}' 로직 검증을 위한 실제 테스트 코드를 채움.
- **AI 평가:** ${currentTaskReview.rating}/10점.`;

      // 파일 저장 및 커밋
      saveFileAndCommit(
        testPath, // 기존 파일 경로에 덮어쓰기
        finalTestCode,
        commitMessage
      );
      modifiedFiles.push(testPath); // 성공 시 파일 목록에 추가

      // [✅ 테스트 요약 배열 업데이트]
      const regex = new RegExp(TEST_TITLE_REGEX, 'g');
      let match;
      const testCaseTitles = [];
      const contentWithoutReview = testCodeContent || rawResponse;

      while ((match = regex.exec(contentWithoutReview)) !== null) {
        testCaseTitles.push(match[1]);
      }

      if (testCaseTitles.length > 0) {
        createdTestsSummary.push({
          path: testPath,
          detail: target.detail,
          titles: testCaseTitles,
          review: currentTaskReview,
        });
      }
    }

    // 4. [✅ 신규] 테스트 요약 파일 생성 및 저장 (모든 파일의 결과 포함)
    const summaryMarkdown = formatTestSummary(createdTestsSummary);
    const summaryFilePath = path.join('tdd-automation', 'logs', 'tests_implemented_summary.md');
    const logDir = path.dirname(summaryFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    await fs.promises.writeFile(summaryFilePath, summaryMarkdown);
    selfReviewOutput.outputFilePath = summaryFilePath;
    console.log(`💾 테스트 요약 저장됨: ${path.relative(process.cwd(), summaryFilePath)}`);

    console.log('\n--- 3단계 완료 ---');
    console.log("✅ [다음 확인] 'pnpm test'를 실행하세요. 모든 테스트가 실패(RED)해야 정상입니다.");
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정 (코드가 성공적으로 작성됨)
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
  } finally {
    // [✅ 최종] 체크리스트 생성 및 저장
    const finalResults = {
      success,
      rating: selfReviewOutput.rating / (10 || 1), // 평균 점수 계산
      wellDone: '테스트 로직 구현 완료',
      needsImprovement: '다음 단계에서 테스트 실패 분석 필요',
      outputFilePath: selfReviewOutput.outputFilePath,
    };
    const checklistItems = [
      '최종 명세서 및 컨텍스트 로드 시도',
      '각 테스트 파일의 빈 셸에 테스트 로직 구현 시도',
      'Mock 데이터 및 시그니처 준수 노력 (AI 확인)',
      'Git 커밋 실행 시도 (3개 파일)',
    ];
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1);
    }
  }
}

// --- 스크립트 실행 ---
runTestWrite();
