네, '기능 설계 에이전트'로서 사용자 요구사항과 기존 프로젝트 분석 자료, 그리고 제공된 답변을 바탕으로 후속 에이전트가 참고할 '최종 기능 명세서'를 작성하겠습니다.

---

# 반복 일정 기능 명세서

## 1. 개요

이 문서는 기존 캘린더 애플리케이션에 '반복 일정' 기능을 추가하기 위한 기술 명세서입니다. 사용자는 일정을 생성할 때 반복 규칙(매일, 매주, 매월, 매년)을 설정하고, 반복되는 일정 중 특정 일정만 수정하거나 삭제하는 등의 고급 기능을 사용할 수 있습니다.

**핵심 구현 전략:**

- **원본(Master) 이벤트 저장:** 반복 규칙을 포함한 원본 이벤트 하나만 데이터베이스에 저장합니다.
- **클라이언트 측 동적 생성:** 클라이언트(프론트엔드)에서 현재 캘린더 뷰(월/주)에 맞춰 반복되는 일정 인스턴스들을 동적으로 계산하여 화면에 표시합니다.

## 2. 작업 범위 및 영향 분석

기능 구현을 위해 다음과 같은 파일들의 수정 및 생성이 필요합니다.

- **`src/types.ts` (수정):**
  - `Event` 타입에 반복 시리즈를 식별하는 `seriesId`와 개별 수정/삭제를 위한 `exceptionDates` 필드를 추가합니다.
  - 가상으로 생성되는 `EventInstance` 타입을 정의합니다.
- **`src/utils/repeatUtils.ts` (신규 생성):**
  - 원본 `Event`와 날짜 범위를 기반으로 화면에 표시할 반복 일정 인스턴스들을 생성하는 `generateRecurringEvents` 함수를 구현합니다.
- **`src/hooks/useEventOperations.ts` (대규모 수정):**
  - 일정 저장/수정/삭제 로직을 '단일'과 '전체' 케이스로 분기 처리합니다.
  - 수정/삭제 시 사용자 확인을 위한 모달 상태 및 제어 로직을 추가합니다.
  - API 호출 로직을 새로운 API 명세에 맞게 수정합니다. (`POST`, `PUT`, `DELETE` 경로 및 본문 변경)
- **`src/hooks/useEventForm.ts` (수정):**
  - 새로운 데이터 모델(`seriesId`, `exceptionDates`)을 폼 상태에서 관리할 수 있도록 로직을 수정/추가합니다.
  - 저장 전 반복 관련 유효성 검사를 추가합니다.
- **`src/hooks/useCalendarView.ts` (수정 또는 연계 로직 추가):**
  - API로부터 받은 원본 이벤트 목록을 `generateRecurringEvents` 유틸리티 함수에 전달하여 현재 뷰에 맞는 전체 이벤트 목록(단일 + 반복 인스턴스)을 생성하는 로직이 필요합니다.
- **UI 컴포넌트 (수정):**
  - 일정 표시 컴포넌트: `event.seriesId` 유무에 따라 반복 아이콘을 표시합니다.
  - 일정 생성/수정 모달: '전체' 또는 '단일' 수정을 묻는 확인 UI를 추가합니다.

## 3. 데이터 모델 변경

**[⭐규칙 준수]** 관련된 모든 타입의 완전한 최종 정의를 포함합니다.

#### `src/types.ts`

```typescript
// 변경 없음
export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

// 변경 없음
export interface RepeatInfo {
  type: RepeatType;
  interval: number;
  endDate?: string; // 예: "2025-12-31"
}

// 변경 없음
export interface EventForm {
  title: string;
  date: string;         // YYYY-MM-DD 형식
  startTime: string;    // HH:mm 형식
  endTime: string;      // HH:mm 형식
  description: string;
  location: string;
  category: string;
  repeat: RepeatInfo;
  notificationTime: number; // 분 단위
}

// [핵심] Event 타입 확장
export interface Event extends EventForm {
  id: string; // 고유 ID
  seriesId?: string | null; // 반복 그룹 ID.
                            // - 신규 반복 일정: 자신의 id와 동일.
                            // - 단일로 수정된 일정: null.
                            // - 일반 단일 일정: undefined.
  exceptionDates?: string[]; // 반복에서 제외할 날짜 배열. (YYYY-MM-DD 형식)
}

// [신규] 프론트엔드에서 동적으로 생성되는 가상 이벤트 인스턴스 타입
export interface EventInstance extends Event {
  // Event의 모든 속성을 상속받음
  originalDate: string; // 이 인스턴스가 생성된 원본 시작 날짜 (Event.date)
  // id는 `${seriesId}-${YYYYMMDD}` 형식으로 생성됨
}
## 4. 핵심 로직 상세

### 4.1. 반복 일정 생성 로직 (`src/utils/repeatUtils.ts`)

-   **함수명:** `generateRecurringEvents(events: Event[], viewStartDate: Date, viewEndDate: Date): EventInstance[]`
-   **역할:** API로부터 받은 원본 이벤트 목록과 현재 캘린더 뷰의 시작/종료일을 받아, 화면에 표시되어야 할 모든 `EventInstance` 배열을 반환합니다.
-   **세부 로직:**
    1.  입력받은 `events` 배열을 순회합니다.
    2.  `event.repeat.type`이 `'none'`이거나 `seriesId`가 없는 단일 이벤트는 그대로 결과 배열에 추가합니다.
    3.  `event.repeat.type`이 `'none'`이 아닌 반복 이벤트의 경우:
        -   `currentDate`를 `event.date` (시작일)로 초기화합니다.
        -   반복 종료일(`repeat.endDate` 또는 최대 `2025-12-31`)과 `viewEndDate` 중 더 빠른 날짜까지 루프를 돕니다.
        -   루프 내에서 `currentDate`가 `viewStartDate`와 `viewEndDate` 사이에 있는지 확인합니다.
        -   `event.exceptionDates` 배열에 `currentDate`가 포함되어 있는지 확인합니다.
        -   두 조건을 모두 통과하면, `currentDate`를 `date`로 하는 `EventInstance` 객체를 생성하여 결과 배열에 추가합니다.
            -   `id`: `${event.seriesId}-${YYYYMMDD}` 형식
            -   `originalDate`: 원본 이벤트의 `date`
            -   기타 속성은 원본 이벤트와 동일하게 설정합니다.
        -   `repeat.type`과 `repeat.interval`에 따라 `currentDate`를 다음 날짜로 증가시킵니다.
            -   `daily`: `interval`일 만큼 더함
            -   `weekly`: `interval`주 만큼 더함
            -   `monthly`: `interval`달 만큼 더함 (31일 -> 다음달 31일. 없으면 생성 안함)
            -   `yearly`: `interval`년 만큼 더함 (윤년 2/29 -> 다음 윤년 2/29)

### 4.2. CRUD 및 API 연동 로직 (`src/hooks/useEventOperations.ts`)

#### **일정 생성 (Create)**
-   **단일 일정:** 기존과 동일. `POST /api/events` 호출. `seriesId`는 `undefined`.
-   **신규 반복 일정:**
    1.  사용자 입력값으로 `EventForm` 객체를 생성합니다.
    2.  `POST /api/events`로 전송합니다.
    3.  서버는 `id`를 생성하고, `seriesId` 필드에 동일한 `id` 값을 채워 응답합니다.

#### **일정 수정 (Update)**
-   사용자가 반복 일정 인스턴스를 수정하려고 하면 확인 모달을 띄웁니다.
-   **Case 1: 해당 일정만 수정 (Single)**
    1.  수정된 내용으로 새로운 단일 `Event` 객체를 만듭니다. 이 객체의 **`seriesId`는 `null`로 설정**합니다.
    2.  `POST /api/events`를 호출하여 이 **새로운 단일 이벤트를 생성**합니다.
    3.  성공 시, 원본 반복 이벤트의 `seriesId`를 사용하여 `PUT /api/events/{seriesId}`를 호출합니다.
    4.  요청 본문(body)에는 `{ "addExceptionDate": "YYYY-MM-DD" }` 형식으로 수정된 날짜를 포함하여 예외 처리를 요청합니다.
    5.  두 API 호출이 모두 성공하면, 전체 이벤트를 다시 불러옵니다.
-   **Case 2: 향후 모든 일정 수정 (All)**
    1.  수정된 내용(제목, 시간, 반복 규칙 등)으로 원본 이벤트를 업데이트합니다.
    2.  `PUT /api/events/{seriesId}`를 호출하여 원본 이벤트 자체를 덮어씁니다.
    3.  성공 시, 전체 이벤트를 다시 불러옵니다.

#### **일정 삭제 (Delete)**
-   사용자가 반복 일정 인스턴스를 삭제하려고 하면 확인 모달을 띄웁니다.
-   **Case 1: 해당 일정만 삭제 (Single)**
    1.  원본 반복 이벤트의 `seriesId`와 삭제할 인스턴스의 날짜(`YYYY-MM-DD`)를 가져옵니다.
    2.  `PUT /api/events/{seriesId}`를 호출합니다.
    3.  요청 본문(body)에는 `{ "addExceptionDate": "YYYY-MM-DD" }` 형식으로 삭제할 날짜를 포함하여 예외 처리를 요청합니다.
    4.  성공 시, 전체 이벤트를 다시 불러옵니다.
-   **Case 2: 향후 모든 일정 삭제 (All)**
    1.  원본 반복 이벤트의 `seriesId`를 가져옵니다.
    2.  `DELETE /api/events/{seriesId}`를 호출하여 원본 이벤트를 완전히 삭제합니다.
    3.  성공 시, 전체 이벤트를 다시 불러옵니다.

## 5. API 명세

| 기능 | Method | URL | Request Body (예시) | Response Body (예시) | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **신규 일정 생성** | `POST` | `/api/events` | `{ "title": "...", "date": "...", "repeat": { "type": "daily", ... } }` | `201 OK`, 생성된 Event 객체 | 반복일 경우 서버에서 `id`와 `seriesId`를 동일하게 설정하여 반환 |
| **전체 반복 일정 수정** | `PUT` | `/api/events/{seriesId}` | `{ "title": "수정된 제목", "repeat": { ... }, ... }` | `200 OK`, 수정된 Event 객체 | `seriesId`를 기준으로 원본 이벤트를 통째로 수정 |
| **단일 일정 예외 추가** | `PUT` | `/api/events/{seriesId}` | `{ "addExceptionDate": "2024-08-15" }` | `200 OK`, 수정된 Event 객체 | 단일 수정/삭제 시 원본에 예외 날짜를 추가. **다른 필드와 함께 보낼 수 없음** |
| **전체 반복 일정 삭제** | `DELETE` | `/api/events/{seriesId}` | (없음) | `204 No Content` | `seriesId`를 기준으로 원본 이벤트를 삭제 |
| **단일 일정 생성/수정** | `POST`/`PUT` | `/api/events`, `/api/events/{id}` | `{ "title": "...", "seriesId": null, ... }` | `201`/`200`, Event 객체 | 일반 단일 일정 CRUD. 반복 일정에서 단일 수정된 이벤트 생성 시 `seriesId: null`로 `POST` |

## 6. UI/UX 요구사항
-   **반복 아이콘 표시:** 캘린더의 각 일정 아이템은 `event.seriesId`가 `string` 타입이고 길이가 0보다 클 경우 반복 아이콘을 표시해야 합니다. (`seriesId`가 `undefined` 또는 `null`인 경우는 표시하지 않음)
-   **수정/삭제 확인 모달:** 반복 일정 인스턴스에 대한 수정/삭제 시도 시, 사용자에게 "해당 일정만" 처리할지 "향후 모든 일정"을 처리할지 명확하게 묻는 모달창을 제공해야 합니다.

## 7. 테스트 케이스 체크리스트

### 데이터 모델 및 유틸리티 함수 (`repeatUtils.ts`)
-   [ ] `generateRecurringEvents`가 **매일** 반복 일정을 주어진 범위 내에서 정확히 생성하는가? (interval: 1, 2...)
-   [ ] `generateRecurringEvents`가 **매주** 반복 일정을 정확히 생성하는가?
-   [ ] `generateRecurringEvents`가 **매월** 반복 일정을 정확히 생성하는가? (31일 시작 -> 30일인 달에는 생성 X)
-   [ ] `generateRecurringEvents`가 **매년** 반복 일정을 정확히 생성하는가? (윤년 2월 29일 처리)
-   [ ] `endDate`가 설정된 경우, 해당 날짜 이후의 인스턴스는 생성되지 않는가?
-   [ ] `exceptionDates`에 포함된 날짜는 인스턴스로 생성되지 않는가?
-   [ ] 생성된 `EventInstance`의 `id`가 `${seriesId}-${YYYYMMDD}` 형식을 따르는가?

### API 연동 및 CRUD 로직 (`useEventOperations.ts`)
-   [ ] **생성:** 신규 반복 일정 생성 시 `POST /api/events`가 호출되고, 응답받은 데이터의 `id`와 `seriesId`가 동일한가?
-   [ ] **단일 수정:**
    -   [ ] 1. 새로운 단일 이벤트를 위해 `POST /api/events`가 호출되는가? (body에 `seriesId: null` 포함)
    -   [ ] 2. 원본 이벤트 예외 처리를 위해 `PUT /api/events/{seriesId}`가 호출되는가? (body에 `addExceptionDate` 포함)
-   [ ] **전체 수정:**
    -   [ ] `PUT /api/events/{seriesId}`가 호출되며, body에 모든 수정 사항이 포함되는가?
-   [ ] **단일 삭제:**
    -   [ ] `PUT /api/events/{seriesId}`가 호출되며, body에 `{ addExceptionDate: "..." }`가 포함되는가?
-   [ ] **전체 삭제:**
    -   [ ] `DELETE /api/events/{seriesId}`가 호출되는가?
-   [ ] API 요청 실패 시 적절한 에러 메시지(Snackbar)가 표시되는가? (e.g., 존재하지 않는 seriesId로 요청 시 404 처리)

### UI/UX
-   [ ] `event.seriesId`가 있는 이벤트 인스턴스에만 반복 아이콘이 표시되는가?
-   [ ] 단일 일정으로 수정된 이벤트(`seriesId: null`)에서는 반복 아이콘이 사라지는가?
-   [ ] 반복 이벤트 수정/삭제 시, '단일/전체' 선택 모달이 정상적으로 나타나는가?

---
```
