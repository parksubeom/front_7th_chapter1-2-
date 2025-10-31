// tdd-automation/design/02-run-design-spec.js (최종 수정본 - 자가 평가 통합)
import fs from 'fs';
import path from 'path'; // path 모듈 import
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // checklistUtils.js 필요
import { SYSTEM_PROMPT_DESIGN } from '../core/agent_prompts.js'; // agent_prompts.js 필요
import { fileURLToPath } from 'url'; // 현재 파일 경로를 얻기 위해

// --- [✅ 추가] 현재 파일 경로 및 에이전트 이름 정의 ---
const __filename = fileURLToPath(import.meta.url);
const agentName = '1-2. 기능 설계 (최종 명세서)';

// --- (준비 1) PRD 및 컨텍스트 (01 스크립트와 동일한 내용) ---
const newFeatureSpec = readFileContent('./tdd-automation/logs/input-feature-spec.md');
const readFileContent = (filePath) => {
  try {
    // 프로젝트 루트 기준 경로 사용
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn(`[Context]: ${filePath} 파일 없음.`);
      return `// [파일 없음] ${filePath}`; // 에러 대신 정보 반환
    } else {
      console.error(`❌ 치명적 오류: 파일 ${filePath} 읽기 실패.`, e.message);
      process.exit(1);
    }
  }
};

function getProjectContext() {
  const config = JSON.parse(readFileContent('./tdd-automation/config.json'));
  const contextFiles = config.designSpec.contextFiles;

  let context = '[프로젝트 주요 파일 컨텍스트]\n';
  contextFiles.forEach(filePath => {
    const content = readFileContent(filePath);
    context += `---\n[${filePath}]\n${content}\n`;
  });
  context += '---';

  return context;
}

// --- (준비 2) 사용자 답변 ---
// [✅ 적용 완료] AI 질문 + 보강 질문에 대한 최종 답변
const userAnswers = `
[AI 질문에 대한 답변]

#### **1. 데이터 모델 및 저장 방식 (Data Model & Storage)**

**1. 원본 이벤트와 개별 발생의 관계:**
* **답변:** **원본(Master) 이벤트 하나만 저장**하고, 클라이언트(프론트엔드)에서 해당 월/주를 볼 때마다 **동적으로 발생을 계산**해서 화면에 표시하는 방식입니다. 데이터베이스에 모든 발생을 저장하지 않습니다.

**2. ID 관리:**
* **답변:** 모든 반복 이벤트 그룹을 식별할 **\`seriesId?: string | null\`** 필드를 \`Event\` 타입에 추가합니다.
    * 신규 반복 일정 생성 시, \`seriesId\`는 생성된 \`id\`와 동일한 값으로 설정됩니다.
    * 계산된 각 발생(인스턴스)은 이 \`seriesId\`를 공유합니다.
    * 단일 수정된 이벤트의 \`seriesId\`는 \`null\`이 됩니다.
    * 일반 단일 이벤트는 \`seriesId\` 필드가 \`undefined\`입니다.

**3. 단일 수정/삭제 처리:**
* **수정 시 답변:** 예, 원본 이벤트에 **\`exceptionDates?: string[]\`** 필드를 추가하여 관리합니다. '해당 일정만 수정' 시, 해당 날짜를 \`exceptionDates\`에 추가하고, 수정된 내용은 **\`seriesId: null\`인 새로운 단일 \`Event\` 객체**로 생성(POST)합니다.
* **삭제 시 답변:** 예, '해당 일정만 삭제' 시에도 원본 이벤트의 **\`exceptionDates\` 배열에 해당 날짜를 추가**하는 방식으로 처리합니다 (\`PUT\` 요청 사용).

#### **2. 반복 일정 생성 및 확장 로직 (Event Generation & Expansion Logic)**

**4. 로직 위치:**
* **답변:** **옵션 B (Frontend)**를 선택합니다. API는 반복 규칙이 포함된 원본 이벤트만 반환하고, **새로 생성할 \`src/utils/repeatUtils.ts\` 파일** 내의 유틸리티 함수(예: \`generateRecurringEvents\`)가 프론트엔드에서 현재 뷰에 맞게 동적으로 이벤트를 계산하여 렌더링합니다.

#### **3. 반복 일정 수정 로직 (Modification Logic)**

**5. '전체 수정'의 기준:**
* **답변:** **옵션 A (모든 과거와 미래 적용)**를 선택합니다. '전체 수정' (\`PUT /api/events/{seriesId}\`)은 시리즈의 **원본 정의 자체**를 변경하는 것이므로, 시리즈 전체(과거 포함 모든 발생)에 영향을 미칩니다.

**6. 단일 수정 후 원본 이벤트:**
* **답변:** 단일 수정된 이벤트는 **새로운 \`id\`를 가진 완전히 독립된 단일 이벤트**로 생성되며, \`seriesId\`는 \`null\`로 설정됩니다. 원본 시리즈(\`seriesId\` 기준)는 \`exceptionDates\`에 해당 날짜만 추가됩니다.

#### **4. API 명세 (API Specification)**

**7. 수정 요청 (\`PUT /api/events/{id}\`):**
* **답변:** **'단일 수정'**과 **'전체 수정'**은 **API 요청 방식 자체를 다르게** 합니다.
    * **단일 수정:** \`POST /api/events\` (새 단일 이벤트 생성) + \`PUT /api/events/{seriesId}\` (원본에 예외 날짜 추가)의 **2단계**로 요청합니다. \`updateScope\` 플래그는 필요 없습니다.
    * **전체 수정:** \`PUT /api/events/{seriesId}\` **단일 요청**으로 원본 시리즈의 데이터를 직접 업데이트합니다.

**8. 삭제 요청 (\`DELETE /api/events/{id}\`):**
* **답변:** **'단일 삭제'**와 **'전체 삭제'**는 **API 요청 방식 자체를 다르게** 합니다.
    * **단일 삭제:** **\`PUT /api/events/{seriesId}\`** 요청을 사용하며, 요청 본문에 삭제할 날짜 정보(예: \`{ "addExceptionDate": "YYYY-MM-DD" }\`)를 포함하여 **예외 처리**를 요청합니다. \`deleteScope\` 플래그는 필요 없습니다.
    * **전체 삭제:** **\`DELETE /api/events/{seriesId}\`** 요청으로 원본 시리즈를 완전히 삭제합니다.

#### **5. 기타 (UI/UX)**

**9. 반복 아이콘:**
* **답변:** 아이콘 표시는 **\`event.seriesId\` 필드가 존재하고 \`null\`이 아닌 경우** (\`typeof event.seriesId === 'string' && event.seriesId.length > 0\`)를 기준으로 합니다.
    * 단일 수정되어 \`seriesId\`가 \`null\`이 된 이벤트는 이 조건에 해당하지 않으므로 아이콘이 자동으로 사라집니다.

---
#### **[보강 질문 답변]**

**10. 단일 수정 중 부분 실패 시 롤백 정책:**
* **답변:** **롤백하지 않고 에러 메시지만 표시**합니다. (구현 단순성 우선) 사용자에게 안내 메시지를 제공합니다. (\`useEventOperations\` 훅에서 처리)

**11. 잘못된 반복 정보 유효성 검사 위치:**
* **답변:** **\`useEventForm\` 훅 내부에서 *저장 전* 유효성 검사**를 수행합니다. (클라이언트 측 우선)

**12. 존재하지 않는 Series ID 처리:**
* **답변:** **API는 \`404 Not Found\`를 반환**하고, **\`useEventOperations\` 훅은 404 수신 시 에러 토스트를 표시**합니다.

**13. \`EventInstance\` ID 생성 규칙:**
* **답변:** **\`generateRecurringEvents\` 함수가 책임**지며, 형식은 **\`\${원본_seriesId}-\${YYYYMMDD}\`** 규칙을 따릅니다.

**14. 단일 삭제(PUT) 요청 본문:**
* **답변:** **\`{ "addExceptionDate": "YYYY-MM-DD" }\` 형식**만 사용합니다.

**15. 확인 모달 인터페이스:**
* **답변:** **\`useEventOperations\` 훅이 모달 상태와 액션 함수를 반환**하는 방식 (\`return { ..., isConfirmModalOpen, confirmSingleAction, confirmAllAction, cancelAction }\`)을 사용합니다.
`;

// --- (실행) ---
async function runCreateSpecification() {
  console.log(`--- ${agentName} 시작 ---`);
  // [✅ 수정] outputFilePath와 success 플래그를 try/catch/finally 블록 바깥에 선언
  let success = false;
  let outputFilePath = path.join('tdd-automation', 'logs', 'output-02-feature-spec.md'); // 초기 경로 설정
  let selfReviewOutput = { rating: 0, wellDone: 'N/A', needsImprovement: 'N/A' }; // [✅ 추가] 자가 평가 데이터

  try {
    const projectContext = getProjectContext();
    const userPrompt = `
[1. 기존 프로젝트 컨텍스트]
${projectContext}
[2. 새로운 기능 요구사항]
${newFeatureSpec}
[3. (중요) 나의 답변]
${userAnswers}
[지시]
1. 제공된 모든 정보를 종합하여, TDD 2단계(테스트 설계) 에이전트가 사용할 수 있는
'최종 기능 명세서'를 마크다운(.md) 형식으로 작성해주세요.
**[⭐강조]** '데이터 모델 변경' 섹션에는 관련된 모든 타입(Event, EventForm, RepeatInfo, EventInstance)의 *완전한 최종 정의*를 반드시 포함해야 합니다.
(체크리스트, 입력/출력 예시 포함)
2. **명세서 생성 후**, 다음 마크다운 섹션 형식으로 **당신의 작업에 대한 자가 평가**를 추가해 주세요:
\`\`\`markdown
## 🤖 에이전트 자가 평가
**점수:** (1~10점 사이)
**잘한 점:** (명세서 작성 시 구조화 및 상세함)
**고려하지 못한 점:** (놓치거나 모호하게 남긴 부분)
\`\`\`
`;
    const rawResponse = await runAgent(SYSTEM_PROMPT_DESIGN, userPrompt);

    // [✅ 수정] 질문과 자가 평가 데이터를 응답에서 분리 및 파싱
    const reviewSeparator = '## 🤖 에이전트 자가 평가';
    const [specContent, reviewBlock] = rawResponse.split(reviewSeparator, 2);

    if (reviewBlock) {
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
    }

    // 명세서 저장 전 마크다운 정리
    const cleanedSpec = (specContent || rawResponse)
      .replace(/^```(markdown)?\s*[\r\n]/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    // 로그 폴더 생성 확인
    const logDir = path.dirname(outputFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    await fs.promises.writeFile(outputFilePath, cleanedSpec);
    console.log('--- 최종 기능 명세서 작성 완료 ---');
    console.log(`👉 ${path.relative(process.cwd(), outputFilePath)} 파일을 확인해주세요.`);
    console.log('✅ 다음 단계 [2. 테스트 설계]로 진행할 준비가 되었습니다.');
    success = true; // 성공 플래그 설정
  } catch (error) {
    console.error('1단계 명세서 작성 중 최종 오류 발생.'); // success는 false 유지
  } finally {
    // [✅ 수정] 체크리스트 생성 및 저장
    const relativeOutputPath = path.relative(process.cwd(), outputFilePath); // 상대 경로 계산

    // 최종 results 객체 생성
    const finalResults = {
      success,
      outputFilePath: outputFilePath,
      rating: selfReviewOutput.rating,
      wellDone: selfReviewOutput.wellDone,
      needsImprovement: selfReviewOutput.needsImprovement,
    };

    const checklistItems = [
      'PRD 및 프로젝트 컨텍스트 분석 수행 시도',
      '질문에 대한 답변을 포함하여 최종 명세서 작성 시도',
      '데이터 모델 변경 섹션에 모든 관련 타입의 완전한 정의 포함 시도',
      `산출물(${relativeOutputPath}) 생성 시도`,
      `AI 자가 평가 점수: ${selfReviewOutput.rating}/10점 기록 시도`,
    ];

    // saveAgentChecklist 호출 (에러 발생해도 체크리스트는 저장)
    saveAgentChecklist(agentName, __filename, finalResults, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// 스크립트 실행
runCreateSpecification();
