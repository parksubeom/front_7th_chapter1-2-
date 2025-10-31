| 실패 번호 | 파일 경로 | 테스트 구문 설명 (Describe/It) | 실패 원인 요약 (기술적 관점) |
| :--- | :--- | :--- | :--- |
| 1/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 월간 반복 > interval이 2인 경우` | `AssertionError: expected 2 to be 3` (생성된 이벤트 개수 불일치) |
| 2/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 월간 반복 > 31일 반복 시 없는 달` | `AssertionError: expected 2 to be 3` (생성된 이벤트 개수 불일치) |
| 3/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 연간 반복 > 매년 반복` | `AssertionError: expected 1 to be 3` (생성된 이벤트 개수 불일치) |
| 4/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 연간 반복 > interval이 2인 경우` | `AssertionError: expected 1 to be 3` (생성된 이벤트 개수 불일치) |
| 5/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 연간 반복 > 2월 29일(윤년)` | `AssertionError: expected 1 to be 2` (생성된 이벤트 개수 불일치) |
| 6/15 | `src/__tests__/unit/repeatUtils.spec.ts` | `generateRecurringEvents > 연간 반복 > 시작일이 이전인 경우` | `AssertionError: expected 1 to be 3` (생성된 이벤트 개수 불일치) |
| 7/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts` | `useCalendarView > 매일 반복` | `AssertionError: expected 0 to be greater than 1` (이벤트가 렌더링되지 않음) |
| 8/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts` | `useCalendarView > 매주 월요일 반복` | `AssertionError: expected 0 to be greater than 1` (이벤트가 렌더링되지 않음) |
| 9/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts` | `useCalendarView > 2월 29일(윤년/평년)` | `AssertionError: expected +0 to be 1` (이벤트가 렌더링되지 않음) |
| 10/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > exceptionDates 제외` | `AssertionError: expected 0 to be greater than 1` (이벤트가 렌더링되지 않음) |
| 11/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > repeat.endDate 제한` | `AssertionError: expected 0 to be greater than 1` (이벤트가 렌더링되지 않음) |
| 12/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > 반복/단일 이벤트 혼합` | `AssertionError: expected undefined to be defined` (이벤트가 렌더링되지 않음) |
| 13/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > 뷰 날짜 변경` | `AssertionError: expected 0 to be greater than 1` (이벤트가 렌더링되지 않음) |
| 14/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > 단일 이벤트 seriesId 없음` | `AssertionError: expected undefined to be defined` (이벤트가 렌더링되지 않음) |
| 15/15 | `src/__tests__/hooks/easy.useCalendarView.spec.ts`| `useCalendarView > "해당 일정만 수정" 시나리오` | `AssertionError: expected undefined to be defined` (이벤트가 렌더링되지 않음) |