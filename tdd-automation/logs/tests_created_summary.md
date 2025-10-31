# 📊 2단계 테스트 설계 요약 (RED 셸)

이 문서는 TDD 2단계에서 생성된 테스트 파일 및 케이스의 목록입니다. 이 목록은 3단계(테스트 로직 구현)의 작업 목표가 됩니다.

---
## 🧪 repeatUtils.spec.ts 
**목적:** 'generateRecurringEvents' 함수용

**▶️ 생성된 테스트 케이스 (20개):**
* [ ] should return an empty array when given no events
* [ ] should correctly return single, non-recurring events that fall within the view range
* [ ] should filter out single, non-recurring events that are outside the view range
* [ ] should generate instances for every day when the interval is 1
* [ ] should generate instances for every N days when the interval is N
* [ ] should generate instances on the same day of the week every week for a weekly event
* [ ] should generate instances every N weeks when the interval is N
* [ ] should generate instances on the same date each month for a monthly event
* [ ] should skip generating an instance if the date does not exist in a future month (e.g., starting on the 31st)
* [ ] should generate instances every N months when the interval is N
* [ ] should generate instances on the same month and date each year for a yearly event
* [ ] should correctly handle leap years when the event is on February 29th
* [ ] should generate instances every N years when the interval is N
* [ ] should stop generating instances after the event\
* [ ] should not generate instances on dates included in the `exceptionDates` array
* [ ] should correctly generate instances within the view range for an event that started before the view range
* [ ] should not generate instances beyond the `viewEndDate`
* [ ] should create each EventInstance with a unique ID in the format `${seriesId}-${YYYYMMDD}`
* [ ] should ensure each EventInstance inherits all properties from the original master event
* [ ] should set the `originalDate` property of each instance to the start date of the master event

---
## 🧪 medium.useEventOperations.spec.ts 
**목적:** 반복 일정 수정/삭제용

**▶️ 생성된 테스트 케이스 (16개):**
* [ ] 저장되어있는 초기 이벤트 데이터를 적절하게 불러온다
* [ ] 정의된 이벤트 정보를 기준으로 적절하게 저장이 된다
* [ ] 새로 정의된 
* [ ] 존재하는 이벤트 삭제 시 에러없이 아이템이 삭제된다.
* [ ] 이벤트 로딩 실패 시 
* [ ] 존재하지 않는 이벤트 수정 시 
* [ ] 네트워크 오류 시 
* [ ] 신규 반복 일정 생성 시 POST /api/events가 호출되고, 응답 데이터의 id와 seriesId는 동일해야 한다
* [ ] '해당 일정만 수정
* [ ] '향후 모든 일정 수정
* [ ] '해당 일정만 삭제
* [ ] '향후 모든 일정 삭제
* [ ] 단일 수정 중 첫 번째 API(POST) 호출 실패 시, 프로세스가 중단되고 
* [ ] 단일 수정 중 두 번째 API(PUT) 호출 실패 시, 롤백 로직이 실행되고 
* [ ] 존재하지 않는 seriesId로 전체 수정 요청 시 
* [ ] 존재하지 않는 seriesId로 전체 삭제 요청 시 

---
## 🧪 easy.useCalendarView.spec.ts 
**목적:** 반복 일정 렌더링용

**▶️ 생성된 테스트 케이스 (8개):**
* [ ] 초기 렌더링 시 API로부터 원본 이벤트 목록을 받아 generateRecurringEvents를 호출해야 한다
* [ ] generateRecurringEvents가 반환한 EventInstance 배열을 렌더링할 이벤트 상태에 올바르게 설정해야 한다
* [ ] 단일 이벤트와 반복 이벤트 인스턴스가 모두 포함된 최종 목록을 반환해야 한다
* [ ] 반복 규칙은 있지만 현재 뷰의 날짜 범위에 속하는 인스턴스가 없는 이벤트는 렌더링 목록에 포함하지 않아야 한다
* [ ] 사용자가 다음 달로 이동하면, 변경된 월의 날짜 범위에 맞게 이벤트를 다시 계산해야 한다
* [ ] 사용자가 이전 주로 이동하면, 변경된 주의 날짜 범위에 맞게 이벤트를 다시 계산해야 한다
* [ ] API가 빈 이벤트 목록을 반환할 경우, 렌더링할 이벤트 목록도 비어 있어야 한다
* [ ] 원본 이벤트 목록에 exceptionDates가 포함된 경우, generateRecurringEvents가 이를 올바르게 처리하여 해당 날짜의 인스턴스를 생성하지 않는지 확인해야 한다

