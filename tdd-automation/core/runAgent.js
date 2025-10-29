// tdd-automation/runAgent.js (최종 안정화 버전)
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config'; // .env 파일 로드 확인

// [✅ 보강] API 키 로딩 확인 로그 (스크립트 시작 시 바로 확인)
console.log(
  `[Env Check] GEMINI_API_KEY 로드 상태: ${
    process.env.GEMINI_API_KEY
      ? `${process.env.GEMINI_API_KEY.substring(0, 5)}... (로드됨)` // 키 일부만 출력
      : '❌ 로드 실패! .env 파일을 확인하세요.'
  }`
);
if (!process.env.GEMINI_API_KEY) {
    console.error("오류: GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. .env 파일을 확인하거나 직접 설정해주세요.");
    process.exit(1); // API 키 없으면 실행 중단
}


// 1. Gemini 모델 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAX_RETRIES = 3; // 최대 재시도 횟수
const RETRY_DELAY = 3000; // 재시도 간 대기 시간 (ms)

/**
 * AI 에이전트를 실행하는 핵심 함수 (재시도 로직 포함)
 * @param {string} systemPrompt - 에이전트의 페르소나
 * @param {string} userPrompt - AI에게 전달할 컨텍스트와 지시사항
 * @returns {Promise<string>} AI의 응답 텍스트
 */
export async function runAgent(systemPrompt, userPrompt) {
  console.log(`\n🤖 [Agent Request]: ${userPrompt.substring(0, 80)}... (Size: ${Buffer.byteLength(userPrompt, 'utf8')} bytes)`);

  const generativeModel = genAI.getGenerativeModel({
    // [⚠️ 참고] 현재 gemini-2.5-pro 사용 중. 안정성 위해 gemini-1.5-flash 변경 고려 가능
    model: "gemini-2.5-pro",
    systemInstruction: systemPrompt,
  });

  // [✅ 보강] 자동 재시도 로직
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`⏳ 재시도 (${attempt}/${MAX_RETRIES}). ${RETRY_DELAY / 1000}초 대기...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }

      const result = await generativeModel.generateContent(userPrompt);

      // [보강] 응답 유효성 체크 추가
      if (!result || !result.response) {
          throw new Error("API로부터 유효한 응답을 받지 못했습니다.");
      }
      
      const text = result.response.text();

      // [보강] 텍스트 응답 유무 체크
      if (typeof text !== 'string') {
          console.warn("⚠️ 경고: AI 응답에 텍스트 콘텐츠가 없습니다.", result.response);
          // 빈 문자열이라도 반환하여 다음 단계 진행 (오류보다는 안전)
          return ""; 
      }

      console.log(`📄 [Agent Response]: ... (성공적으로 생성 완료)`);
      return text;

    } catch (error) {
      // [보강] 에러 상태 코드 확인 및 상세 로깅
      const status = error?.response?.status || error?.status; // SDK나 fetch 에러 구조가 다를 수 있음
      console.error(`❌ AI 에이전트 실행 중 오류 발생 (Attempt ${attempt}/${MAX_RETRIES}):`, status ? `Status ${status}` : '', error.message);

      // API 키 유효성 오류(400)는 재시도 의미 없음 -> 즉시 중단
      if (status === 400 && error.message.includes('API key not valid')) {
          console.error("   🛑 치명적 오류: API 키가 유효하지 않습니다. .env 파일을 확인하고 키를 재발급 받으세요.");
          process.exit(1);
      }

      // 재시도 가능한 오류 (503: 과부하, 429: 요청 초과) 또는 네트워크 오류
      if (attempt < MAX_RETRIES && (status === 503 || status === 429 || error.message.includes('fetch failed'))) {
        // 재시도 로직으로 넘어감 (continue 불필요, 루프가 자동으로 다음 시도 진행)
      } else {
        // 최종 시도 실패 또는 복구 불가능한 오류
        console.error("   최종 시도 실패 또는 복구 불가능한 오류입니다. 파이프라인을 중단합니다.");
        throw error; // 에러를 다시 던져서 runAgent 호출부에서 인지하도록 함
      }
    }
  }
  // 루프 종료 후에도 성공하지 못한 경우 (이론상 도달 불가하나 방어 코드)
  throw new Error("AI Agent request failed after multiple retries.");
}