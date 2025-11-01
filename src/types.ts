export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * 반복 정보 타입
 * @property {RepeatType} type - 반복 유형
 * @property {number} interval - 반복 간격 (예: 2주마다)
 * @property {string} [endDate] - 반복 종료 날짜 (YYYY-MM-DD)
 */
export interface RepeatInfo {
  type: RepeatType;
  interval: number;
  endDate?: string;
}

/**
 * 이벤트 폼 데이터 타입
 */
export interface EventForm {
  title: string;
  date: string; // 시리즈의 시작 날짜 (YYYY-MM-DD)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  description: string;
  location: string;
  category: string;
  repeat: RepeatInfo;
  notificationTime: number; // 분 단위
}

/**
 * 데이터베이스에 저장되는 이벤트 객체 타입
 * @property {string} id - 이벤트의 고유 ID
 * @property {string | null} [seriesId] - 반복 시리즈의 원본 ID.
 * - 신규 반복 일정: `id`와 동일한 값으로 설정.
 * - 단일로 수정된 일정: `null`로 설정.
 * - 일반 단일 일정: `undefined`.
 * @property {string[]} [exceptionDates] - 반복에서 제외할 날짜 배열 (YYYY-MM-DD).
 */
export interface Event extends EventForm {
  id: string;
  seriesId?: string | null;
  exceptionDates?: string[];
}

/**
 * 화면 렌더링에 사용되는 가상 이벤트 인스턴스 타입 (신규 정의)
 * @property {string} instanceId - 각 발생의 고유 ID. 형식: `${seriesId}-${YYYYMMDD}`.
 * @property {string} date - 해당 발생의 실제 날짜.
 * @property {string} seriesId - 원본 이벤트의 ID. 아이콘 표시에 사용됩니다.
 */
export interface EventInstance extends Omit<Event, 'id' | 'date'> {
  instanceId: string; // 캘린더 key 등으로 사용될 고유 ID
  date: string; // 이 인스턴스가 발생하는 실제 날짜
  seriesId: string; // 원본 시리즈 ID (null이 아님)
}
