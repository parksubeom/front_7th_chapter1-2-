// tdd-automation/03-run-test-design.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runAgent } from '../core/runAgent.js'; // runAgent.js (재시도 로직 포함 버전) 필요
import { SYSTEM_PROMPT_TEST_DESIGN } from '../core/agent_prompts.js'; // agent_prompts.js (최종 보강 버전) 필요

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

    // 절대 경로로 파일 쓰기
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
      // 필수 파일: 명세서, 타입 정의
      if (filePath.includes('output-02-feature-spec.md') || filePath.includes('src/types.ts')) {
        console.error(
          `❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다. 계속할 수 없습니다.`
        );
        process.exit(1);
      }
      // 수정 대상인 *기존* 테스트 파일 - 없으면 경고 후 빈 문자열 반환 (AI가 생성하도록)
      else if (filePath.includes('.spec.') && !filePath.includes('repeatUtils.spec.ts')) {
        // repeatUtils는 신규 생성 대상임
        console.warn(
          `[Context]: 수정할 기존 테스트 파일 ${filePath} 을(를) 찾을 수 없습니다. AI가 새 파일 구조를 생성합니다.`
        );
        return `// [정보] 기존 테스트 파일 ${filePath} 없음. AI가 import와 describe 블록을 포함한 전체 구조를 생성해야 함.`;
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

// --- [2. 테스트 설계 에이전트] 실행 ---
async function runTestDesign() {
  console.log('--- 2단계: [테스트 설계 에이전트] 실행 시작 (RED - Shell) ---');

  // 1. 최종 명세서 로드 (필수)
  const specMarkdown = readFileContent('./tdd-automation/output-02-feature-spec.md');

  // 2. 핵심 컨텍스트 로드: 타입 정의 및 테스트 설정 (정확한 설계를 위해 필수)
  const typesContext = readFileContent('src/types.ts');
  const testSetupContext = `
[src/types.ts - 이벤트 모델 정의]
${typesContext}

[setupTests.ts - 공통 설정]
${readFileContent('src/setupTests.ts')}

[src/__tests__/utils.ts - 테스트 유틸리티]
${readFileContent('src/__tests__/utils.ts')}

[src/utils/dateUtils.ts - 기존 날짜 유틸리티]
${readFileContent('src/utils/dateUtils.ts')}
`;

  // 3. 대상 테스트 파일 및 특정 지시사항 정의
  const targets = [
    {
      path: 'src/__tests__/unit/repeatUtils.spec.ts', // 프로젝트 루트 기준 상대 경로
      promptDetail: "'generateRecurringEvents' 함수 (`src/utils/repeatUtils.ts`)",
      existing: false, // 이 파일은 에이전트가 새로 생성함
    },
    {
      path: 'src/__tests__/hooks/medium.useEventOperations.spec.ts',
      promptDetail:
        '반복 일정 수정 (단일/전체 업데이트, 단일/전체 삭제) (`src/hooks/useEventOperations.ts`)',
      existing: true, // 에이전트가 이 기존 파일에 테스트 케이스를 추가해야 함
    },
    {
      path: 'src/__tests__/hooks/easy.useCalendarView.spec.ts',
      promptDetail:
        '반복 일정 렌더링 로직 (`generateRecurringEvents` 호출 및 `seriesId` 처리) (`src/hooks/useCalendarView.ts`)',
      existing: true, // 에이전트가 이 기존 파일에 테스트 케이스를 추가해야 함
    },
  ];

  for (const target of targets) {
    console.log(`\n... ${path.basename(target.path)} 빈 테스트 셸 생성 중 ...`);

    // 수정 대상인 경우에만 기존 코드 로드
    const existingCode = target.existing
      ? readFileContent(target.path)
      : '// [정보] 새 파일입니다. import 및 describe 블록을 포함한 전체 구조를 생성하세요.';

    // 프롬프트 구성
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
당신은 '테스트 설계 에이전트'입니다. [최종 기능 명세서]와 [테스트 설정 & 타입 컨텍스트]를 기반으로, **${
      target.promptDetail
    }**을(를) 테스트하기 위한 **빈 테스트 케이스** (상세한 설명이 포함된 describe 및 it 블록, 하지만 \`() => {}\`와 같이 비어 있는 본문)를 생성하세요.

**[⭐ 핵심 규칙]**
- 명세서와 컨텍스트(\`src/types.ts\`)에서 예상되는 함수 시그니처(인자, 타입)를 추론하여 \`it\` 블록 설명에 정확한 사용법이 암시되도록 작성하세요.
- **이 단계에서는 오직 '빈 테스트 셸'만 생성하고, 절대로 Mock 데이터나 테스트 로직(expect 등)을 미리 작성하지 마십시오.**
${
  target.existing
    ? `- **기존 테스트 파일** 내용의 적절한 위치에 새로운 \`describe\` 또는 \`it\` 블록을 **추가**하고, **수정된 전체 파일 내용**을 반환하세요.`
    : `- 필요한 \`import\` (\`describe\`, \`it\` 등)와 메인 \`describe\` 블록을 포함한 **전체 파일 내용**을 생성하세요.`
}
- \`it\` 블록 안의 설명은 명세서에 언급된 엣지 케이스(예: '월별 반복 31일', '연간 반복 2월 29일', '예외 날짜 제외')를 포함하여 **매우 구체적**이어야 합니다.
`;

    // AI 에이전트 실행 및 응답 정리
    const rawShell = await runAgent(SYSTEM_PROMPT_TEST_DESIGN, prompt);
    const testShell = cleanAiCodeResponse(rawShell);

    // 파일 저장 및 커밋
    saveFileAndCommit(
      target.path,
      testShell,
      `test(tdd): [TDD 2/5] ${path.basename(target.path)} 빈 셸 ${
        target.existing ? '추가' : '생성'
      } (RED)

      AI '테스트 설계 에이전트'가 명세서를 기반으로
      '${target.path}'에 빈 테스트 케이스를 생성/추가합니다.`
    );
  }
  console.log('\n--- 2단계 완료 ---');
  console.log(
    "✅ [다음 확인] 'pnpm test'를 실행하세요. 빈 테스트들은 통과(pass)하거나 스킵(skip)되어야 합니다."
  );
  console.log('➡️ 준비가 되면 [3단계: 테스트 코드 작성]을 요청해주세요.');
}

// --- 스크립트 실행 ---
runTestDesign();
