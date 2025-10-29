// tdd-automation/core/checklistUtils.js
import fs from 'fs';
import path from 'path';

/**
 * 에이전트 실행 결과를 바탕으로 체크리스트를 생성하고 Markdown 파일로 저장합니다.
 * @param {string} agentName - 에이전트 이름 (예: '1-1. 기능 설계 (질문 생성)')
 * @param {string} scriptPath - 현재 실행 중인 스크립트의 경로 (__filename 사용)
 * @param {object} results - 에이전트 실행 결과 정보 (예: { success: true, outputFilePath?: '...' })
 * @param {string[]} checklistItems - 해당 에이전트의 역할 체크리스트 항목 배열
 */
export function saveAgentChecklist(agentName, scriptPath, results, checklistItems) {
  const timestamp = new Date().toLocaleString('ko-KR');
  // 스크립트 경로에서 폴더 경로를 추출
  const agentFolder = path.dirname(scriptPath);
  // 체크리스트 파일 경로 설정 (각 에이전트 폴더 내)
  const checklistFilePath = path.join(agentFolder, '_checklist_run_result.md');
  // 프로젝트 루트 기준 상대 경로 (로그 출력용)
  const relativeChecklistPath = path.relative(process.cwd(), checklistFilePath);

  let markdownContent = `# ${agentName} 실행 결과 체크리스트\n\n`;
  markdownContent += `**실행 시각:** ${timestamp}\n`;
  markdownContent += `**실행 스크립트:** ${path.basename(scriptPath)}\n`;
  markdownContent += `**실행 성공 여부:** ${results.success ? '✅ 성공' : '❌ 실패'}\n`;
  if (results.outputFilePath) {
    // 산출물 경로도 프로젝트 루트 기준 상대 경로로 표시
    const relativeOutputPath = path.relative(process.cwd(), results.outputFilePath);
    markdownContent += `**주요 산출물:** ${relativeOutputPath}\n`;
  }
  markdownContent += '\n---\n\n';
  markdownContent += `## 역할 수행 점검\n\n`;

  checklistItems.forEach((item) => {
    // 스크립트 실행 성공 여부를 기반으로 체크 (AI 동작 자체 평가는 불가)
    const check = results.success ? '[x]' : '[ ]';
    markdownContent += `- ${check} ${item}\n`;
  });

  try {
    // 절대 경로로 파일 쓰기
    fs.writeFileSync(checklistFilePath, markdownContent, 'utf8');
    console.log(`📋 체크리스트 저장됨: ${relativeChecklistPath}`);
  } catch (error) {
    console.error(`❌ 체크리스트 저장 실패: ${relativeChecklistPath}`, error);
    // 체크리스트 저장은 실패해도 파이프라인 중단은 하지 않음
  }
}
