// tdd-automation/core/checklistUtils.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 필수 스펙 목록 (에이전트가 평가의 기준으로 삼아야 함)
const CORE_SPEC_ITEMS = [
  '1. 반복 유형 및 특수 규칙 구현 (31일/윤년)',
  '2. 반복 일정 표시 (아이콘)',
  '3. 반복 종료 조건 (특정 날짜까지)',
  '4. 반복 일정 수정 (단일/전체 분기 및 아이콘 처리)',
  '5. 반복 일정 삭제 (단일/전체 분기 및 예외 처리)',
];

/**
 * 에이전트 실행 결과를 바탕으로 상세 평가 체크리스트를 Markdown 파일로 저장합니다.
 * @param {string} agentName - 에이전트 이름 (예: '1-1. 기능 설계 (질문 생성)')
 * @param {string} scriptPath - 현재 실행 중인 스크립트의 파일 경로 (__filename)
 * @param {object} results - 에이전트 실행 결과 정보 ({ success: boolean, rating: number, wellDone: string, needsImprovement: string })
 */
export function saveAgentChecklist(agentName, scriptPath, results) {
  // 스크립트 파일 이름 추출 (예: 01-run-design-analysis.js)
  const scriptFileName = path.basename(scriptPath, path.extname(scriptPath));
  // 체크리스트 파일 경로 설정 (각 에이전트 폴더 내 스크립트 이름.md)
  const agentFolder = path.dirname(scriptPath);
  const checklistFilePath = path.join(agentFolder, `${scriptFileName}.md`);
  const relativeChecklistPath = path.relative(process.cwd(), checklistFilePath);

  let markdownContent = `# 🤖 ${agentName} 실행 결과 및 자가 평가\n\n`;
  markdownContent += `**실행 시각:** ${new Date().toLocaleString('ko-KR')}\n`;
  markdownContent += `**스크립트:** ${path.basename(scriptPath)}\n`;
  markdownContent += `**최종 상태:** ${
    results.success ? '✅ 성공 (Success)' : '❌ 실패 (Failure)'
  }\n`;
  markdownContent += `**자가 평가 점수:** ${results.rating}/10점\n`;
  markdownContent += '\n---\n\n';

  markdownContent += `## 1. 📋 에이전트 역할 수행 점검\n\n`;
  // 에이전트가 자신의 임무를 달성했는지 확인
  markdownContent += `- **주요 임무 달성 여부:** ${
    results.success ? '[x]' : '[ ]'
  } ${agentName} 작업을 완료함.\n`;
  if (results.outputFilePath) {
    const relativeOutputPath = path.relative(process.cwd(), results.outputFilePath);
    markdownContent += `- **주요 산출물 생성:** [x] \`${relativeOutputPath}\` 생성 완료.\n`;
  }

  markdownContent += '\n## 2. ✨ 필수 스펙 기여도 평가\n\n';
  markdownContent += '| 필수 스펙 항목 | 이 작업의 기여도 및 평가 |\n';
  markdownContent += '| :--- | :--- |\n';

  // 필수 스펙 목록 추가
  CORE_SPEC_ITEMS.forEach((item) => {
    // 여기서는 AI가 외부에서 평가하여 결과를 results.rating 등에 담아와야 함.
    // 현재는 AI가 자체 평가 텍스트를 results.wellDone, results.needsImprovement에 담았다고 가정
    markdownContent += `| ${item} | 명세서 작성을 위한 질문 유도 / 코드 구현 기반 마련 |\n`;
  });

  markdownContent += '\n## 3. 회고 (Self-Review)\n\n';
  markdownContent += `### 잘한 점 (Well Done)\n`;
  markdownContent += `\`\`\`text\n${results.wellDone}\n\`\`\`\n`;

  markdownContent += `### 고려하지 못한 점 / 개선 사항 (Needs Improvement)\n`;
  markdownContent += `\`\`\`text\n${results.needsImprovement}\n\`\`\`\n`;

  markdownContent += '\n---\n';

  try {
    fs.writeFileSync(checklistFilePath, markdownContent, 'utf8');
    console.log(`📋 체크리스트 저장됨: ${relativeChecklistPath}`);
  } catch (error) {
    console.error(`❌ 체크리스트 저장 실패: ${relativeChecklistPath}`, error);
  }
}
