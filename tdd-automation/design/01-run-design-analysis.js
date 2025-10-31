// tdd-automation/design/01-run-design-analysis.js (최종 보강 버전)
import fs from 'fs';
import path from 'path';
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js';
import { SYSTEM_PROMPT_DESIGN } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url';

// --- [✅ 추가] 현재 파일 경로 및 에이전트 이름 정의 ---
const __filename = fileURLToPath(import.meta.url);
const agentName = '1-1. 기능 설계 (질문 생성)';

// --- (준비 1) PRD ---
// [✅ 보강] 사용자가 제공한 최신 필수 스펙으로 교체
const newFeatureSpec = readFileContent('./tdd-automation/logs/input-feature-spec.md');

// --- (준비 2) 헬퍼 함수 및 컨텍스트 ---
const readFileContent = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn(`[Context]: ${filePath} 파일 없음. 진행에 영향 줄 수 있음.`);
      return `// [파일 없음] ${filePath}`;
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

function getProjectContext() {
  const config = JSON.parse(readFileContent('./tdd-automation/config.json'));
  const contextFiles = config.designAnalysis.contextFiles;

  let context = '[프로젝트 주요 파일 컨텍스트]\n';
  contextFiles.forEach(filePath => {
    const content = readFileContent(filePath);
    context += `---\n[${filePath}]\n${content}\n`;
  });
  context += '---';

  return context;
}

// --- (실행) ---
async function runDesignAnalysis() {
  console.log(`--- ${agentName} 시작 ---`);
  let success = false;
  let outputFilePath = path.join('tdd-automation', 'logs', 'output-01-questions.txt');
  let selfReviewOutput = { rating: 0, wellDone: 'N/A', needsImprovement: 'N/A' };

  try {
    const projectContext = getProjectContext();
    const userPrompt = `
[기존 프로젝트 컨텍스트]
${projectContext}
[새로운 기능 요구사항]
${newFeatureSpec}

[지시]
1. 당신의 임무(기능 설계)에 따라, 위 정보를 바탕으로 이 기능을 개발하기 위해 명확히 해야 할 **기술적인 질문 리스트 (Markdown 형식)**를 생성해주세요.
2. **질문 리스트 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (질문 생성 시 프로젝트 분석을 잘한 부분, 스펙 준수 여부)
**고려하지 못한 점:** (놓치거나 모호하게 남긴 부분)
\`\`\`
`;
    const rawResponse = await runAgent(SYSTEM_PROMPT_DESIGN, userPrompt);

    // [✅ 수정] 질문과 자가 평가 데이터를 응답에서 분리
    const reviewSeparator = '## 🤖 에이전트 자가 평가';
    const [questions, reviewBlock] = rawResponse.split(reviewSeparator, 2);

    if (reviewBlock) {
      // 자가 평가 데이터 파싱 (정규식 사용)
      const ratingMatch = reviewBlock.match(/점수:\s*(\d+)/i);
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
    } else {
      console.warn('⚠️ 경고: AI 응답에서 자가 평가 블록을 찾을 수 없어 질문 전체를 저장합니다.');
    }

    // 질문만 파일에 저장 (코드 블록 정리 포함)
    const cleanedQuestions = (questions || rawResponse)
      .replace(/^```(markdown)?\s*[\r\n]/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    // 로그 폴더 생성 확인
    const logDir = path.dirname(outputFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    await fs.promises.writeFile(outputFilePath, cleanedQuestions);
    console.log('--- 질문 생성 완료 ---');
    console.log(
      `👉 ${path.relative(process.cwd(), outputFilePath)} 파일을 확인하고 답변을 준비해주세요.`
    );
    success = true; // 성공 플래그 설정
  } catch (error) {
    console.error('1단계 질문 생성 중 최종 오류 발생.'); // success는 false 유지
  } finally {
    // [✅ 수정] 체크리스트 생성 및 저장
    const relativeOutputPath = path.relative(process.cwd(), outputFilePath);

    // 최종 results 객체 생성
    const finalResults = {
      success,
      outputFilePath: outputFilePath,
      rating: selfReviewOutput.rating,
      wellDone: selfReviewOutput.wellDone,
      needsImprovement: selfReviewOutput.needsImprovement,
    };

    const checklistItems = [
      'PRD 및 프로젝트 컨텍스트 분석 수행 시도 (6개 핵심 파일 참조)',
      '기능 구현에 필요한 기술적 질문 리스트 생성 시도',
      `산출물(${relativeOutputPath}) 생성 시도`,
      `AI 자가 평가 점수: ${selfReviewOutput.rating}/10점 기록 시도`, // 자가 평가 점수 기록
    ];

    // saveAgentChecklist 호출
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// 스크립트 실행
runDesignAnalysis();
