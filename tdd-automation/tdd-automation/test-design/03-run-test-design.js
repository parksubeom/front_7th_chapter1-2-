// tdd-automation/test-design/03-run-test-design.js (체크리스트 + 자가 평가 통합)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_TEST_DESIGN } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // 현재 파일 경로 얻기 위해

// [추가] 정규 표현식: it(...) 블록의 내용(테스트 제목)을 추출
const TEST_TITLE_REGEX = /it\s*\(['"](.+?)['"]/g;

// --- 1. 헬퍼 함수 정의 ---

/** AI 응답에서 코드 블록 마크다운 제거 및 타입 구문 정리 */
function cleanAiCodeResponse(aiResponse) {
  if (!aiResponse) return '';
  const cleaned = aiResponse
    .replace(/^```(typescript|javascript|ts|js)?\s*[\r\n]/im, '') // 시작 태그 제거
    .replace(/```\s*$/im, '') // 끝 태그 제거
    .trim()
    // [✅ JavaScript 환경 고려 수정] 불필요한 TypeScript 구문 제거
    .replace(/: React\.FC<[^>]+>/g, '') // 예: : React.FC<MyProps>
    .replace(/:\s*\w+\s*\[\]/g, ' = []') // 예: : Event[] -> = []
    .replace(/:\s*\w+\s*/g, '') // 예: : string -> 제거
    .replace(/as\s*\w+/g, '') // 예: as RepeatType -> 제거
    .replace(/interface\s*|export\s*interface\s*/g, 'const '); // JS 환경을 고려한 타입 구문 정리
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
      if (fs.existsSync(absolutePath)) {
        existingContent = fs.readFileSync(absolutePath, 'utf8');
      }
    } catch (readError) {
      console.warn(`    ⚠️ [FS 경고]: 기존 파일 ${filePath} 읽기 실패. (${readError.message})`);
      existingContent = '';
    }

    if (existingContent.trim() !== content.trim()) {
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
          run(`git commit -m "$GIT_COMMIT_MSG"`, false);
        } else {
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

// --- 4. 헬퍼 함수: 파일 내용 안전하게 읽기 ---
const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isTypesFile = filePath.includes('src/types.ts');

      if (!optional && (isSpecFile || isTypesFile)) {
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else if (optional) {
        console.warn(`[Context]: 선택적 파일 ${filePath} 없음.`);
        return `// [정보] 파일 ${filePath} 없음.`;
      } else {
        // optional=false 인데 필수 파일 아님 (테스트 셸은 이 단계에서 생성 대상)
        console.error(
          `❌ 치명적 오류: 테스트 파일 ${filePath} 을(를) 찾을 수 없습니다. (2단계 실행 시도 실패)`
        );
        process.exit(1);
      }
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

/** [✅ 추가] 테스트 요약 Markdown 포맷터 */
function formatTestSummary(summaryArray) {
  let md = `# 📊 2단계 테스트 설계 요약 (RED 셸)\n\n`;
  md += `이 문서는 TDD 2단계에서 생성된 테스트 파일 및 케이스의 목록입니다. 이 목록은 3단계(테스트 로직 구현)의 작업 목표가 됩니다.\n\n`;

  summaryArray.forEach((item) => {
    md += `---\n`;
    md += `## 🧪 ${path.basename(item.path)} \n`;
    md += `**목적:** ${item.detail}\n\n`;
    md += `**▶️ 생성된 테스트 케이스 (${item.titles.length}개):**\n`;
    item.titles.forEach((title, index) => {
      md += `* [ ] ${title}\n`;
    });
    md += '\n';
  });

  return md;
}

const __filename = fileURLToPath(import.meta.url); // 현재 스크립트 파일 경로

// --- [2. 테스트 설계 에이전트] 실행 ---
async function runTestDesign() {
  const agentName = '2. 테스트 설계 (빈 셸)';
  console.log(`--- ${agentName} 시작 (RED - Shell) ---`);
  let success = false;
  const modifiedFiles = [];
  let selfReviewOutput = {
    rating: 0,
    wellDone: 'N/A',
    needsImprovement: 'N/A',
    outputFilePath: 'N/A',
  }; // [✅ 수정] 자가 평가 데이터 구조 변경

  // [✅ 신규] 테스트 요약 파일 경로 정의
  const summaryFilePath = path.join('tdd-automation', 'logs', 'tests_created_summary.md');
  const createdTestsSummary = [];

  try {
    // 1. 최종 명세서 로드 (필수)
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md');

    // 2. 핵심 컨텍스트 로드
    const typesContext = readFileContent('src/types.ts');
    const testSetupContext = `
[src/types.ts - 이벤트 모델 정의]
${typesContext}
[setupTests.ts - 공통 설정]
${readFileContent('src/setupTests.ts', true)}
[src/__tests__/utils.ts - 테스트 유틸리티]
${readFileContent('src/__tests__/utils.ts', true)}
[src/utils/dateUtils.ts - 기존 날짜 유틸리티]
${readFileContent('src/utils/dateUtils.ts', true)}
`;

    // 3. 대상 테스트 파일 정의
    const targets = [
      {
        path: 'src/__tests__/unit/repeatUtils.spec.ts',
        promptDetail: "'generateRecurringEvents' 함수용",
        existing: false,
      },
      {
        path: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
        promptDetail: '반복 일정 수정/삭제용',
        existing: true,
      },
      {
        path: 'src/__tests__/hooks/easy.useCalendarView.spec.ts',
        promptDetail: '반복 일정 렌더링용',
        existing: true,
      },
    ];

    for (const target of targets) {
      console.log(`\n... ${path.basename(target.path)} 빈 테스트 셸 생성 중 ...`);

      const existingCode = target.existing
        ? readFileContent(target.path, true)
        : '// [정보] 새 파일입니다...';

      // [✅ 수정] AI에게 자가 평가를 요청하는 프롬프트 구성
      const prompt = `
[1. 최종 기능 명세서]
${specMarkdown}
[2. 테스트 설정 & 타입 컨텍스트]
${testSetupContext}
${
  target.existing
    ? `[3. 기존 테스트 파일: ${target.path}]\n${existingCode}`
    : '[3. 신규 테스트 파일]'
}

[지시]
1. 위 컨텍스트를 기반으로, **${
        target.promptDetail
      }**을(를) 테스트하기 위한 **빈 테스트 케이스**를 생성하세요. (describe/it 블록만)
2. **테스트 셸 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (설계 적합성, 시그니처 준수 노력 등)
**고려하지 못한 점:** (놓쳤거나 모호하게 남긴 부분)
\`\`\`

**[⭐ 핵심 규칙]**
- **빈 테스트 셸**만 생성하고, **절대로 Mock 데이터나 테스트 로직(expect 등)을 미리 작성하지 마십시오.**
- **JavaScript 파일 환경입니다.** 생성된 코드에는 불필요한 TypeScript 타입 선언이나 형 변환(Type Casting)을 포함하지 마십시오.
- 함수의 시그니처와 타입을 100% 준수해야 합니다.
- **최종 결과물은 셸 내용과 자가 평가 블록을 모두 포함해야 합니다.**
`;

      // AI 에이전트 실행 및 응답 분리
      const rawResponse = await runAgent(SYSTEM_PROMPT_TEST_DESIGN, prompt);
      const reviewSeparator = '## 🤖 에이전트 자가 평가';
      const [testShellContent, reviewBlock] = rawResponse.split(reviewSeparator, 2);

      // 자가 평가 데이터 파싱 (로직은 이전 답변과 동일)
      if (reviewBlock) {
        const ratingMatch =
          reviewBlock.match(/点数:\s*(\d+)/i) || reviewBlock.match(/점수:\s*(\d+)/i); // 언어 혼동 대비
        const wellDoneMatch =
          reviewBlock.match(/잘한 점:\s*([\s\S]*?)\n###/i) ||
          reviewBlock.match(/잘한 점:\s*([\s\S]*)/i);
        const needsImprovementMatch = reviewBlock.match(/고려하지 못한 점:\s*([\s\S]*)/i);

        selfReviewOutput.rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
        selfReviewOutput.wellDone = wellDoneMatch
          ? wellDoneMatch[1].trim()
          : '평가 텍스트를 찾을 수 없음';
        selfReviewOutput.needsImprovement = needsImprovementMatch
          ? needsImprovementMatch[1].trim()
          : '평가 텍스트를 찾을 수 없음';
      }

      // 테스트 셸 내용 정리 (코드 블록 정리 및 TS 제거)
      const finalTestShell = cleanAiCodeResponse(testShellContent || rawResponse)
        // [✅ JS 구문 정리] AI가 자주 넣는 TypeScript 전용 구문 제거 시도
        .replace(/: React\.FC<[^>]+>/g, '')
        .replace(/:\s*\w+\s*\[\]/g, ' = []')
        .replace(/:\s*\w+\s*/g, '')
        .replace(/as\s*\w+/g, '')
        .replace(/interface\s*|export\s*interface\s*/g, 'const ');

      // [✅ 커밋 메시지 개선] - 파일 목적 포함
      const commitMessage = `test(tdd): [TDD 2/5] ${path.basename(target.path)} (${
        target.promptDetail
      }) 테스트 셸 ${target.existing ? '추가' : '생성'} (RED)`;

      // 파일 저장 및 커밋
      saveFileAndCommit(
        target.path,
        finalTestShell,
        commitMessage // 개선된 커밋 메시지 사용
      );
      modifiedFiles.push(target.path);

      // [✅ 신규] 생성된 테스트 케이스 제목 추출 및 기록
      let match;
      const testCaseTitles = [];
      // 정규식은 exec 호출마다 lastIndex가 업데이트되므로, 새 복사본을 만들어 사용해야 루프가 멈추지 않음
      const regex = new RegExp(TEST_TITLE_REGEX, 'g');
      const contentWithoutReview = testShellContent || rawResponse;

      while ((match = regex.exec(contentWithoutReview)) !== null) {
        testCaseTitles.push(match[1]);
      }

      if (testCaseTitles.length > 0) {
        createdTestsSummary.push({
          path: target.path,
          detail: target.promptDetail,
          titles: testCaseTitles,
        });
      }
    }

    // 4. [✅ 신규] 테스트 요약 파일 생성 및 저장
    const summaryMarkdown = formatTestSummary(createdTestsSummary);
    const logDir = path.dirname(summaryFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    await fs.promises.writeFile(summaryFilePath, summaryMarkdown);
    console.log(`💾 테스트 요약 저장됨: ${path.relative(process.cwd(), summaryFilePath)}`);

    console.log('\n--- 2단계 완료 ---');
    console.log(
      "✅ [다음 확인] 'pnpm test'를 실행하세요. 빈 테스트들은 통과(pass)하거나 스킵(skip)되어야 합니다."
    );
    console.log('➡️ 준비가 되면 [3단계: 테스트 코드 작성]을 요청해주세요.');
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
  } finally {
    // [✅ 최종] 체크리스트 생성 및 저장
    const finalResults = {
      success,
      rating: selfReviewOutput.rating,
      wellDone: selfReviewOutput.wellDone,
      needsImprovement: selfReviewOutput.needsImprovement,
      outputFilePath: summaryFilePath,
    };
    const checklistItems = [
      '최종 명세서 로드 시도',
      '타입 및 테스트 설정 컨텍스트 로드 시도',
      '각 테스트 파일의 빈 테스트 셸 생성/수정 시도',
      '생성 시 Mock 데이터/로직 제외 시도 (AI 확인 필요)',
      `테스트 케이스 요약 파일(${path.basename(summaryFilePath)}) 생성 완료`,
      'Git 커밋 실행 시도 (변경 시)',
    ];
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runTestDesign();
