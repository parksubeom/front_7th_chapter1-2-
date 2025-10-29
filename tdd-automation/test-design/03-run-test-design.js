// tdd-automation/test-design/03-run-test-design.js (체크리스트 추가)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// [수정] 경로 및 import 추가
import { runAgent } from '../core/runAgent.js';
import { saveAgentChecklist } from '../core/checklistUtils.js'; // 체크리스트 유틸 import
import { SYSTEM_PROMPT_TEST_DESIGN } from '../core/agent_prompts.js';
import { fileURLToPath } from 'url'; // [✅ 추가] 현재 파일 경로 얻기 위해

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
          // 절대 경로 존재 재확인
          fs.mkdirSync(destDir, { recursive: true });
          console.log(`[FS]: 디렉토리 생성됨: ${destDir}`);
        }
      }
    }

    // 현재 파일 내용과 비교하여 변경이 있을 때만 쓰기 및 커밋
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
/**
 * 파일 내용을 안전하게 읽습니다. 필수 파일 누락 시 치명적 오류로 종료합니다.
 * @param {string} filePath - 프로젝트 루트 기준 파일 경로.
 * @param {boolean} [optional=false] - 파일이 없어도 오류를 발생시키지 않을지 여부.
 * @returns {string} 파일 내용 또는 정보 문자열.
 */
const readFileContent = (filePath, optional = false) => {
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // [수정] logs 폴더 경로 반영
      const isSpecFile = filePath.includes('logs/output-02-feature-spec.md');
      const isTypesFile = filePath.includes('src/types.ts');

      if (!optional && (isSpecFile || isTypesFile)) {
        // 필수로 간주되는 파일
        console.error(`❌ 치명적 오류: 필수 파일 ${filePath} 을(를) 찾을 수 없습니다.`);
        process.exit(1);
      } else if (!optional && filePath.includes('.spec.')) {
        // 3단계 이후 테스트 파일은 필수
        console.error(
          `❌ 치명적 오류: 테스트 파일 ${filePath} 을(를) 찾을 수 없습니다. 이전 단계를 확인하세요.`
        );
        process.exit(1);
      } else if (optional && filePath.includes('.spec.')) {
        // 2단계에서 기존 테스트 파일 로드는 optional
        console.warn(`[Context]: 수정할 기존 테스트 파일 ${filePath} 없음. AI가 생성 시도.`);
        return `// [정보] 기존 파일 ${filePath} 없음. AI가 전체 구조 생성해야 함.`;
      } else {
        // 기타 선택적 파일
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

// --- [2. 테스트 설계 에이전트] 실행 ---
async function runTestDesign() {
  const agentName = '2. 테스트 설계 (빈 셸)'; // [✅ 추가] 에이전트 이름 정의
  console.log(`--- ${agentName} 시작 (RED - Shell) ---`);
  let success = false; // [✅ 추가] 실행 성공 여부 플래그
  const modifiedFiles = []; // [✅ 추가] 변경/생성된 파일 목록 기록

  try {
    // [✅ 추가] 메인 로직을 try 블록으로 감쌈
    // 1. 최종 명세서 로드 (필수)
    const specMarkdown = readFileContent('./tdd-automation/logs/output-02-feature-spec.md'); // [수정] 경로 변경

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
      // [수정] 기존 파일 로드 시 optional=true 사용
      const existingCode = target.existing
        ? readFileContent(target.path, true)
        : '// [정보] 새 파일입니다...';
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
${target.promptDetail} '빈 테스트 케이스'(describe, it 블록)를 작성해주세요.
${target.existing ? '**[기존 테스트 파일] 내용에 "추가"**하여 파일 전체 내용을 반환' : ''}
(함수 시그니처와 타입 100% 준수, Mock 데이터/로직 절대 금지)
`;
      const rawShell = await runAgent(SYSTEM_PROMPT_TEST_DESIGN, prompt);
      const testShell = cleanAiCodeResponse(rawShell);

      // 파일 저장 및 커밋 (변경 시에만)
      saveFileAndCommit(
        target.path,
        testShell,
        `test(tdd): [TDD 2/5] ${path.basename(target.path)} 빈 셸 ${
          target.existing ? '추가' : '생성'
        } (RED)`
      );
      modifiedFiles.push(target.path); // 성공 시 파일 목록에 추가
    }
    console.log('\n--- 2단계 완료 ---');
    console.log(
      "✅ [다음 확인] 'pnpm test'를 실행하세요. 빈 테스트들은 통과(pass)하거나 스킵(skip)되어야 합니다."
    );
    console.log('➡️ 준비가 되면 [3단계: 테스트 코드 작성]을 요청해주세요.');
    success = true; // [✅ 추가] 모든 작업 성공 시 플래그 설정
  } catch (error) {
    console.error(`${agentName} 중 최종 오류 발생.`);
    // success 플래그는 false 유지 (finally에서 처리)
  } finally {
    // [✅ 추가] 체크리스트 생성 및 저장
    const checklistItems = [
      '최종 명세서 로드 시도',
      '타입 및 테스트 설정 컨텍스트 로드 시도',
      `'src/__tests__/unit/repeatUtils.spec.ts' 빈 테스트 셸 생성/수정 시도`,
      `'src/__tests__/hooks/medium.useEventOperations.spec.ts' 빈 테스트 셸 생성/수정 시도`,
      `'src/__tests__/hooks/easy.useCalendarView.spec.ts' 빈 테스트 셸 생성/수정 시도`,
      '생성된 코드에서 Mock 데이터/로직 제외 시도 (AI 확인 필요)',
      'Git 커밋 실행 시도 (변경 시)',
    ];
    // outputFilePath 대신 변경된 파일 목록 전달 (결과 객체 키 변경)
    saveAgentChecklist(agentName, __filename, { success, modifiedFiles }, checklistItems);

    if (!success) {
      process.exit(1); // 실제 오류 발생 시 스크립트 종료
    }
  }
}

// --- 스크립트 실행 ---
runTestDesign();
