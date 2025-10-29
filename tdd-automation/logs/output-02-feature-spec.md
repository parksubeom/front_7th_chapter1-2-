네, 알겠습니다. 제공된 모든 정보를 종합하여 후속 TDD 에이전트가 참고할 '최종 기능 명세서'를 마크다운 형식으로 작성하겠습니다.

---

# 최종 기능 명세서: 반복 일정 기능

## 1. 개요
이 문서는 기존 캘린더 프로젝트에 '반복 일정' 기능을 추가하기 위한 기술 명세입니다. 사용자는 매일, 매주, 매월, 매년 반복되는 일정을 생성, 수정, 삭제할 수 있습니다. 데이터는 원본 이벤트 하나만 저장하고, 클라이언트에서 동적으로 발생을 계산하여 렌더링하는 방식을 채택합니다.

## 2. 작업 범위
아래 파일들은 이번 기능 구현으로 인해 생성되거나 수정되어야 합니다.

-   **신규 파일**
    -   `src/utils/repeatUtils.ts`: 반복 일정 발생을 동적으로 계산하는 로직 포함.
    -   `src/__tests__/unit/repeatUtils.spec.ts`: `repeatUtils.ts`에 대한 단위 테스트.
-   **수정될 파일**
    -   `src/types.ts`: `Event` 및 `EventForm` 타입에 `seriesId`, `exceptionDates` 필드 추가.
    -   `src/hooks/useEventOperations.ts`: 반복 일정의 '단일/전체' 수정 및 삭제 로직과 확인 모달 상태 관리 로직 추가.
    -   `src/hooks/useEventForm.ts`: 폼 상태에 `seriesId`를 관리하고, 수정 시 이를 활용하도록 로직 수정.
    -   `src/hooks/useCalendarView.ts`: `repeatUtils.ts`를 사용하여 현재 뷰에 표시될 최종 이벤트 목록(단일 이벤트 + 반복 발생)을 계산하도록 수정.
    -   `src/components/EventFormModal.tsx`: 반복 설정 UI 및 수정/삭제 시 확인 모달 로직 연동.
    -   `src/components/CalendarDayCell.tsx`: 이벤트에 반복 아이콘을 표시하는 로직 추가.
    -   `src/components/EventOperationModals.tsx`: '단일/전체' 수정 및 삭제를 위한 확인 모달 UI 구현.
    -   `src/__tests__/hooks/medium.useEventOperations.spec.ts`: 변경된 `useEventOperations` 훅에 대한 테스트 케이스 업데이트.

## 3. 데이터 모델 변경
**[⭐규칙]** 관련된 모든 타입의 완전한 최종 정의를 포함합니다.

### `RepeatInfo`
```typescript
// src/types.ts

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * 반복 규칙 정보를 담는 인터페이스.
 * 변경 사항 없음.
 */
export interface RepeatInfo {
  type: RepeatType;
  interval: number; // e.g., type이 'weekly'이고 interval이 2이면 2주마다 반복
  endDate?: string; // 반복 종료 날짜 (e.g., "2025-12-31")
}
### `EventForm`
```typescript
// src/types.ts

/**
 * 이벤트 생성/수정 폼에서 사용하는 데이터 타입.
 * seriesId는 수정 시에만 사용될 수 있음.
 */
export interface EventForm {
  title: string;
  date: string; // 시작 날짜 (e.g., "2024-08-15")
  startTime: string; // (e.g., "10:00")
  endTime: string; // (e.g., "11:00")
  description: string;
  location: string;
  category: string;
  repeat: RepeatInfo;
  notificationTime: number; // 분 단위
  
  // -- 필드 추가 --
  seriesId?: string | null; // 수정 시 원본 시리즈 ID. 신규 생성 시에는 undefined.
}

### `Event`
```typescript
// src/types.ts

/**
 * 데이터베이스에 저장되고 API를 통해 전달되는 이벤트 객체 타입.
 */
export interface Event extends EventForm {
  id: string; // 이벤트의 고유 ID

  // -- 필드 추가 --
  seriesId?: string | null; // 반복 시리즈의 고유 ID.
                           // - 신규 반복 이벤트: id와 동일한 값
                           // - 일반 단일 이벤트: undefined
                           // - 반복에서 분리된 단일 이벤트: null
  exceptionDates?: string[]; // 반복에서 제외된 날짜 배열 (e.g., ["2024-08-22"])
}
```

### `EventInstance` (개념적 타입)
`EventInstance`는 클라이언트에서 동적으로 생성되는 가상 이벤트 객체입니다. 데이터베이스에 저장되지 않으며, `repeatUtils.ts`의 `generateRecurringEvents` 함수를 통해 생성됩니다.

```typescript
/**
 * 클라이언트에서 렌더링 목적으로 동적으로 생성되는 반복 발생 인스턴스.
 * 원본 Event의 속성을 상속받아 날짜와 ID가 특정 발생에 맞게 조정됨.
 */
export interface EventInstance extends Event {
  id: string; // 고유 인스턴스 ID (형식: `${seriesId}-${YYYYMMDD}`)
  date: string; // 해당 발생의 실제 날짜 (e.g., "2024-08-22")
  originalDate: string; // 원본 이벤트의 시작 날짜
}
```

## 4. 상세 기능 명세

### 4.1. 반복 일정 생성
-   **동작:** 사용자가 `EventFormModal`에서 '매일', '매주', '매월', '매년' 중 하나를 선택하고 저장합니다.
-   **프로세스:**
    1.  `useEventForm` 훅은 반복 관련 상태(`repeatType`, `repeatInterval`, `repeatEndDate`)를 관리합니다.
    2.  '저장' 버튼 클릭 시, `useEventOperations`의 `saveEvent` 함수가 호출됩니다.
    3.  `saveEvent`는 `POST /api/events`로 `EventForm` 데이터를 전송합니다.
    4.  백엔드는 새로운 `id`를 생성하고, 이 `id`를 `seriesId` 필드에 복사하여 응답합니다.
-   **입력값 예시 (`POST /api/events` Body):**
    ```json
    {
      "title": "주간 회의",
      "date": "2024-08-15",
      "startTime": "10:00",
      "endTime": "11:00",
      "repeat": {
        "type": "weekly",
        "interval": 1,
        "endDate": "2025-12-31"
      },
      ...
    }
    ```
-   **예상 결과값 (API 응답):**
    ```json
    {
      "id": "evt-12345",
      "seriesId": "evt-12345", // id와 동일
      "title": "주간 회의",
      "date": "2024-08-15",
      "startTime": "10:00",
      "endTime": "11:00",
      "repeat": {
        "type": "weekly",
        "interval": 1,
        "endDate": "2025-12-31"
      },
      "exceptionDates": []
      ...
    }
    ```

### 4.2. 반복 일정 동적 생성 및 렌더링
-   **동작:** 캘린더 뷰(월/주)가 변경될 때마다 현재 보이는 날짜 범위 내의 반복 일정을 계산하여 화면에 표시합니다.
-   **프로세스 (`src/utils/repeatUtils.ts`):**
    1.  `generateRecurringEvents(masterEvents: Event[], viewStart: Date, viewEnd: Date): EventInstance[]` 함수를 구현합니다.
    2.  함수는 `masterEvents` 목록을 순회합니다.
    3.  `event.repeat.type`이 'none'이 아닌 이벤트를 찾습니다.
    4.  해당 이벤트의 반복 규칙(`repeat`)과 `viewStart`, `viewEnd`를 기반으로 모든 발생 날짜를 계산합니다.
        -   **매월 31일:** 31일이 없는 달은 건너뜁니다.
        -   **매년 2월 29일:** 윤년이 아닌 해는 건너뜁니다.
    5.  계산된 날짜가 `event.exceptionDates` 배열에 포함되어 있으면 해당 발생은 생성하지 않습니다.
    6.  유효한 발생에 대해 `EventInstance` 객체를 생성합니다.
        -   `id`: `${event.seriesId}-${YYYYMMDD}` 형식으로 설정합니다.
        -   `date`: 실제 발생 날짜로 설정합니다.
        -   `originalDate`: 원본 이벤트의 `date`를 유지합니다.
    7.  `useCalendarView` 훅은 `generateRecurringEvents`를 호출하여 최종 이벤트 목록을 상태로 관리합니다.
-   **UI 표시:**
    -   `CalendarDayCell.tsx` 컴포넌트는 이벤트 객체의 `seriesId`가 `string` 타입이고 비어있지 않은 경우 반복 아이콘(예: 🔄)을 표시합니다.
    -   `seriesId`가 `null`이거나 `undefined`인 이벤트는 아이콘을 표시하지 않습니다.

### 4.3. 반복 일정 수정
-   **동작:** 사용자가 반복 일정 인스턴스를 클릭하여 수정을 시도하면, '해당 일정만 수정' 또는 '향후 모든 일정 수정' 옵션을 제공하는 모달이 나타납니다.
-   **프로세스 (`useEventOperations.ts`):**
    1.  **'해당 일정만 수정' (단일 수정) 선택 시:**
        -   **1단계 (새 이벤트 생성):** `POST /api/events` 요청을 보냅니다.
            -   **Body:** 수정된 이벤트 데이터. `repeat.type`은 'none'으로, `seriesId`는 `null`로 설정합니다.
        -   **2단계 (원본에서 예외 처리):** `PUT /api/events/{seriesId}` 요청을 보냅니다.
            -   **Body:** `{ "addExceptionDate": "YYYY-MM-DD" }` (수정하려던 인스턴스의 날짜)
    2.  **'향후 모든 일정 수정' (전체 수정) 선택 시:**
        -   `PUT /api/events/{seriesId}` 요청을 보냅니다.
            -   **Body:** 수정된 전체 `Event` 객체. (예: 시간 변경, 제목 변경 등)
-   **입력값 예시 (단일 수정 - 2단계):**
    -   `PUT /api/events/evt-12345`
    -   Body:
    ```json
    {
      "addExceptionDate": "2024-08-22"
    }
    ```
-   **예상 결과값 (단일 수정):**
    -   새로운 단일 이벤트가 생성됩니다 (e.g., `id: "evt-abcde", seriesId: null`).
    -   원본 반복 이벤트(`id: "evt-12345"`)의 `exceptionDates`에 `["2024-08-22"]`가 추가됩니다.
    -   캘린더에는 `2024-08-22` 날짜에 새로운 단일 이벤트가 표시되고, 기존 반복 발생은 사라집니다.

### 4.4. 반복 일정 삭제
-   **동작:** 사용자가 반복 일정 인스턴스 삭제를 시도하면, '해당 일정만 삭제' 또는 '향후 모든 일정 삭제' 옵션을 제공하는 모달이 나타납니다.
-   **프로세스 (`useEventOperations.ts`):**
    1.  **'해당 일정만 삭제' (단일 삭제) 선택 시:**
        -   `PUT /api/events/{seriesId}` 요청을 보냅니다.
        -   **Body:** `{ "addExceptionDate": "YYYY-MM-DD" }` (삭제하려는 인스턴스의 날짜)
    2.  **'향후 모든 일정 삭제' (전체 삭제) 선택 시:**
        -   `DELETE /api/events/{seriesId}` 요청을 보냅니다.
-   **입력값 예시 (단일 삭제):**
    -   `PUT /api/events/evt-12345`
    -   Body:
    ```json
    {
      "addExceptionDate": "2024-08-29"
    }
    ```
-   **예상 결과값 (단일 삭제):**
    -   원본 반복 이벤트(`id: "evt-12345"`)의 `exceptionDates`에 `["2024-08-29"]`가 추가됩니다.
    -   캘린더에서 `2024-08-29` 날짜의 반복 발생이 사라집니다.

## 5. API 명세 변경

| Method | Endpoint                    | 설명                                                                                                                               | Request Body 예시                                                                       |
| :----- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `POST` | `/api/events`               | **(기존 로직 확장)** 신규 단일/반복 이벤트 생성. 반복 이벤트의 경우 응답 시 `seriesId`에 `id`를 복사하여 반환.                          | `{ "title": "...", "repeat": { "type": "daily", ... } }`                                 |
| `PUT`  | `/api/events/{id}`          | **(동작 변경)** `id`가 **seriesId**를 의미.<br>1. **전체 수정**: 전체 `Event` 객체를 받아 원본 시리즈를 업데이트.<br>2. **단일 삭제/수정**: `{ addExceptionDate }`를 받아 `exceptionDates`에 추가. | 1. `{ "id": "...", "title": "수정된 제목", ... }`<br>2. `{ "addExceptionDate": "YYYY-MM-DD" }` |
| `DELETE` | `/api/events/{id}`        | **(동작 변경)** `id`가 **seriesId**를 의미.<br>반복 시리즈 원본과 모든 발생을 삭제.                                                    | (없음)                                                                                  |

## 6. 구현 체크리스트

### 데이터 모델 및 타입
-   [ ] `src/types.ts`: `Event` 및 `EventForm` 타입에 `seriesId`, `exceptionDates` 필드 추가 완료.
-   [ ] `EventInstance` 개념적 타입 정의 및 `repeatUtils.ts`에서 사용.

### 유틸리티 함수
-   [ ] `src/utils/repeatUtils.ts`: `generateRecurringEvents` 함수 구현.
-   [ ] `repeatUtils.ts`: 매일, 매주, 매월, 매년 규칙에 따른 날짜 계산 로직 구현.
-   [ ] `repeatUtils.ts`: `endDate` 및 `exceptionDates`를 고려하여 발생을 필터링하는 로직 구현.
-   [ ] `src/__tests__/unit/repeatUtils.spec.ts`: 위 유틸리티 함수에 대한 단위 테스트 작성.

### Hooks 로직 수정
-   [ ] `src/hooks/useCalendarView.ts`: API로 가져온 `events` 목록을 `generateRecurringEvents`로 처리하여 뷰에 표시할 최종 이벤트 목록을 생성하도록 수정.
-   [ ] `src/hooks/useEventForm.ts`: 폼 데이터에 `seriesId` 관리 로직 추가.
-   [ ] `src/hooks/useEventOperations.ts`: 수정/삭제 시 모달을 띄우고, 선택에 따라 분기 처리하는 로직 구현 (단일/전체).
-   [ ] `useEventOperations.ts`: 단일 수정 시 `POST` + `PUT` 2단계 요청 로직 구현.
-   [ ] `useEventOperations.ts`: 단일 삭제 시 `PUT` 요청 로직 구현.
-   [ ] `useEventOperations.ts`: 전체 수정/삭제 시 각각 `PUT`, `DELETE` 요청 로직 구현.

### 컴포넌트 (UI)
-   [ ] `src/components/EventFormModal.tsx`: 반복 설정 관련 UI 필드 추가.
-   [ ] `src/components/EventOperationModals.tsx`: "해당 일정만" vs "향후 모든 일정"을 묻는 확인 모달 UI 구현.
-   [ ] `src/components/CalendarDayCell.tsx`: `event.seriesId` 존재 여부에 따라 반복 아이콘 표시.