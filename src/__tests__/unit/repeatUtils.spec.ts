import { generateRecurringEvents } from '../../utils/repeatUtils';
import type { Event, RepeatInfo, EventForm } from '../../types';

// NOTE: The provided context `src/types.ts` was incomplete.
// The following type definitions are based on the complete `Final Feature Specification`
// to ensure the tests are accurate and meaningful.
interface SpecEvent extends Omit<Event, 'repeat'> {
  seriesId?: string | null;
  exceptionDates?: string[];
  repeat: RepeatInfo;
}

const BASE_EVENT_FORM: Omit<EventForm, 'date' | 'repeat'> = {
  title: 'Test Event',
  startTime: '10:00',
  endTime: '11:00',
  description: 'A test event description.',
  location: 'Test Location',
  category: 'Test',
  notificationTime: 10,
};

describe('generateRecurringEvents', () => {
  describe('기본 동작', () => {
    it('이벤트 배열이 비어있을 경우 빈 배열을 반환해야 한다.', () => {
      const events: SpecEvent[] = [];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toEqual([]);
    });

    it('반복 규칙이 없는 단일 이벤트는 결과에서 제외해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: '1',
          date: '2024-10-10',
          ...BASE_EVENT_FORM,
          repeat: { type: 'none', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toEqual([]);
    });

    it('seriesId가 null인, 즉 단일로 수정된 이벤트는 결과에서 제외해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: '2',
          seriesId: null,
          date: '2024-10-11',
          ...BASE_EVENT_FORM,
          repeat: { type: 'none', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toEqual([]);
    });
  });

  describe('매일 반복 (daily)', () => {
    it('매일 반복되는 이벤트를 주어진 뷰 기간 내에서 정확히 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-daily-1',
          seriesId: 'series-daily-1',
          date: '2024-10-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-02');
      const viewEndDate = new Date('2024-10-05');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual([
        '2024-10-02',
        '2024-10-03',
        '2024-10-04',
        '2024-10-05',
      ]);
    });

    it('반복 간격(interval)이 2일 경우, 이틀에 한 번씩 이벤트를 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-daily-2',
          seriesId: 'series-daily-2',
          date: '2024-10-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 2 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-08');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual([
        '2024-10-01',
        '2024-10-03',
        '2024-10-05',
        '2024-10-07',
      ]);
    });
  });

  describe('매주 반복 (weekly)', () => {
    it('매주 반복되는 이벤트를 주어진 뷰 기간 내에서 정확히 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-weekly-1',
          seriesId: 'series-weekly-1',
          date: '2024-10-07', // Monday
          ...BASE_EVENT_FORM,
          repeat: { type: 'weekly', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual([
        '2024-10-07',
        '2024-10-14',
        '2024-10-21',
        '2024-10-28',
      ]);
    });

    it('반복 간격(interval)이 2주일 경우, 2주에 한 번씩 이벤트를 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-weekly-2',
          seriesId: 'series-weekly-2',
          date: '2024-10-07', // Monday
          ...BASE_EVENT_FORM,
          repeat: { type: 'weekly', interval: 2 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-11-30');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual([
        '2024-10-07',
        '2024-10-21',
        '2024-11-04',
        '2024-11-18',
      ]);
    });
  });

  describe('매월 반복 (monthly)', () => {
    it('매월 반복되는 이벤트를 주어진 뷰 기간 내에서 정확히 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-monthly-1',
          seriesId: 'series-monthly-1',
          date: '2024-09-15',
          ...BASE_EVENT_FORM,
          repeat: { type: 'monthly', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-12-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-10-15', '2024-11-15', '2024-12-15']);
    });

    it('반복 간격(interval)이 2개월일 경우, 두 달에 한 번씩 이벤트를 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-monthly-2',
          seriesId: 'series-monthly-2',
          date: '2024-09-15',
          ...BASE_EVENT_FORM,
          repeat: { type: 'monthly', interval: 2 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2025-04-30');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-11-15', '2025-01-15', '2025-03-15']);
    });

    it('31일에 시작한 이벤트를 매월 반복할 때, 31일이 없는 달(예: 4월)은 건너뛰어야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-monthly-31',
          seriesId: 'series-monthly-31',
          date: '2024-03-31',
          ...BASE_EVENT_FORM,
          repeat: { type: 'monthly', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-03-01');
      const viewEndDate = new Date('2024-07-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-03-31', '2024-05-31', '2024-07-31']);
    });
  });

  describe('매년 반복 (yearly)', () => {
    it('매년 반복되는 이벤트를 주어진 뷰 기간 내에서 정확히 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-yearly-1',
          seriesId: 'series-yearly-1',
          date: '2023-11-15',
          ...BASE_EVENT_FORM,
          repeat: { type: 'yearly', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-01-01');
      const viewEndDate = new Date('2026-12-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-11-15', '2025-11-15', '2026-11-15']);
    });

    it('반복 간격(interval)이 2년일 경우, 2년에 한 번씩 이벤트를 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-yearly-2',
          seriesId: 'series-yearly-2',
          date: '2023-11-15',
          ...BASE_EVENT_FORM,
          repeat: { type: 'yearly', interval: 2 },
        },
      ];
      const viewStartDate = new Date('2024-01-01');
      const viewEndDate = new Date('2028-12-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2025-11-15', '2027-11-15']);
    });

    it('2월 29일에 시작한 이벤트를 매년 반복할 때, 윤년에만 해당 날짜에 이벤트를 생성해야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-yearly-leap',
          seriesId: 'series-yearly-leap',
          date: '2024-02-29', // Leap year
          ...BASE_EVENT_FORM,
          repeat: { type: 'yearly', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-01-01');
      const viewEndDate = new Date('2032-12-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-02-29', '2028-02-29', '2032-02-29']);
    });
  });

  describe('예외 및 경계 조건', () => {
    it('반복 종료일(endDate)이 설정된 경우, 해당 날짜 이후의 인스턴스는 생성하지 않아야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-enddate',
          seriesId: 'series-enddate',
          date: '2024-10-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 1, endDate: '2024-10-03' },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-10');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-10-01', '2024-10-02', '2024-10-03']);
    });

    it('exceptionDates 배열에 포함된 날짜는 반복 인스턴스로 생성하지 않아야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-exception',
          seriesId: 'series-exception',
          date: '2024-10-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 1 },
          exceptionDates: ['2024-10-02', '2024-10-04'],
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-05');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-10-01', '2024-10-03', '2024-10-05']);
    });

    it('반복 이벤트의 시작일이 뷰의 종료일보다 늦으면, 아무 인스턴스도 생성하지 않아야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-future',
          seriesId: 'series-future',
          date: '2024-11-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 1 },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(0);
    });

    it('반복 이벤트의 종료일이 뷰의 시작일보다 이르면, 아무 인스턴스도 생성하지 않아야 한다.', () => {
      const events: SpecEvent[] = [
        {
          id: 'series-past',
          seriesId: 'series-past',
          date: '2024-09-01',
          ...BASE_EVENT_FORM,
          repeat: { type: 'daily', interval: 1, endDate: '2024-09-10' },
        },
      ];
      const viewStartDate = new Date('2024-10-01');
      const viewEndDate = new Date('2024-10-31');
      const result = generateRecurringEvents(events as any, viewStartDate, viewEndDate);
      expect(result).toHaveLength(0);
    });
  });

  describe('EventInstance 속성 검증', () => {
    const originalEvent: SpecEvent = {
      id: 'series-prop-check',
      seriesId: 'series-prop-check',
      date: '2024-10-15',
      title: 'Property Check Event',
      startTime: '14:00',
      endTime: '15:00',
      description: 'Verifying properties.',
      location: 'Virtual',
      category: 'Tech',
      notificationTime: 30,
      repeat: { type: 'daily', interval: 1 },
      exceptionDates: ['2024-10-16'],
    };
    const viewStartDate = new Date('2024-10-15');
    const viewEndDate = new Date('2024-10-15');
    const result = generateRecurringEvents([originalEvent] as any, viewStartDate, viewEndDate);
    const instance = result[0];

    it('생성된 EventInstance의 instanceId는 `${seriesId}-${YYYYMMDD}` 형식을 따라야 한다.', () => {
      expect(instance.instanceId).toBe('series-prop-check-20241015');
    });

    it('생성된 EventInstance의 date 속성은 해당 발생일의 `YYYY-MM-DD` 형식이어야 한다.', () => {
      expect(instance.date).toBe('2024-10-15');
    });

    it('생성된 EventInstance는 id와 date를 제외한 나머지 속성을 원본 이벤트로부터 상속받아야 한다.', () => {
      const { id, date, ...originalRest } = originalEvent;
      const { instanceId, date: instanceDate, ...instanceRest } = instance;

      expect(instance.seriesId).toBe(originalEvent.seriesId);
      expect(instanceRest).toEqual(originalRest);
      expect(instance).not.toHaveProperty('id');
    });
  });
});