import { describe, it, expect } from 'vitest';
import { generateRecurringEvents } from '../../utils/repeatUtils';
import { Event, EventInstance } from '../../types';

describe('generateRecurringEvents', () => {
  const baseMasterEvent: Event = {
    id: 'evt-1',
    seriesId: 'evt-1',
    title: 'Test Event',
    date: '2024-08-15',
    startTime: '10:00',
    endTime: '11:00',
    description: 'A recurring test event',
    location: 'Conference Room',
    category: 'Work',
    repeat: { type: 'none', interval: 1 },
    exceptionDates: [],
    notificationTime: 15,
  };

  describe('기본 동작', () => {
    it('반복 이벤트가 없는 경우 빈 배열을 반환해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, id: '1', seriesId: undefined, repeat: { type: 'none', interval: 1 } },
        { ...baseMasterEvent, id: '2', seriesId: null, date: '2024-08-16', repeat: { type: 'none', interval: 1 } },
      ];
      const viewStart = new Date('2024-08-01');
      const viewEnd = new Date('2024-08-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toEqual([]);
    });

    it('마스터 이벤트 배열이 비어있는 경우 빈 배열을 반환해야 합니다.', () => {
      const masterEvents: Event[] = [];
      const viewStart = new Date('2024-08-01');
      const viewEnd = new Date('2024-08-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toEqual([]);
    });
  });

  describe('반복 규칙별 생성', () => {
    it('매일 반복되는 이벤트를 뷰 범위 내에서 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-15', repeat: { type: 'daily', interval: 1 } },
      ];
      const viewStart = new Date('2024-08-20');
      const viewEnd = new Date('2024-08-25');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(6);
      expect(result.map((e) => e.date)).toEqual([
        '2024-08-20',
        '2024-08-21',
        '2024-08-22',
        '2024-08-23',
        '2024-08-24',
        '2024-08-25',
      ]);
    });

    it('매주 반복되는 이벤트를 뷰 범위 내에서 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-15', repeat: { type: 'weekly', interval: 1 } }, // Thursday
      ];
      const viewStart = new Date('2024-08-20');
      const viewEnd = new Date('2024-09-10');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-22', '2024-08-29', '2024-09-05']);
    });

    it('매월 반복되는 이벤트를 뷰 범위 내에서 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-07-15', repeat: { type: 'monthly', interval: 1 } },
      ];
      const viewStart = new Date('2024-08-01');
      const viewEnd = new Date('2024-10-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2024-09-15', '2024-10-15']);
    });

    it('매년 반복되는 이벤트를 뷰 범위 내에서 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2023-08-15', repeat: { type: 'yearly', interval: 1 } },
      ];
      const viewStart = new Date('2024-01-01');
      const viewEnd = new Date('2026-12-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2025-08-15', '2026-08-15']);
    });
  });

  describe('간격(Interval) 처리', () => {
    it('2일 간격의 매일 반복 이벤트를 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-15', repeat: { type: 'daily', interval: 2 } },
      ];
      const viewStart = new Date('2024-08-15');
      const viewEnd = new Date('2024-08-22');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2024-08-17', '2024-08-19', '2024-08-21']);
    });

    it('2주 간격의 매주 반복 이벤트를 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-15', repeat: { type: 'weekly', interval: 2 } }, // Thursday
      ];
      const viewStart = new Date('2024-08-15');
      const viewEnd = new Date('2024-09-20');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2024-08-29', '2024-09-12']);
    });

    it('3개월 간격의 매월 반복 이벤트를 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-01-15', repeat: { type: 'monthly', interval: 3 } },
      ];
      const viewStart = new Date('2024-01-01');
      const viewEnd = new Date('2024-12-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual(['2024-01-15', '2024-04-15', '2024-07-15', '2024-10-15']);
    });

    it('2년 간격의 매년 반복 이벤트를 정확히 생성해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2023-08-15', repeat: { type: 'yearly', interval: 2 } },
      ];
      const viewStart = new Date('2023-01-01');
      const viewEnd = new Date('2028-12-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2023-08-15', '2025-08-15', '2027-08-15']);
    });
  });

  describe('경계 조건 및 예외 처리', () => {
    it('뷰 시작일 이전에 시작된 반복 이벤트의 발생을 포함해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-01', repeat: { type: 'daily', interval: 1 } },
      ];
      const viewStart = new Date('2024-08-15');
      const viewEnd = new Date('2024-08-17');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2024-08-16', '2024-08-17']);
    });

    it('뷰 종료일 이후에 끝나는 반복 이벤트의 발생을 포함해야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-28', repeat: { type: 'daily', interval: 1 } },
      ];
      const viewStart = new Date('2024-08-25');
      const viewEnd = new Date('2024-08-30');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.date)).toEqual(['2024-08-28', '2024-08-29', '2024-08-30']);
    });

    it('반복 규칙에 endDate가 설정된 경우, 해당 날짜 이후의 발생은 생성하지 않아야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-08-01', repeat: { type: 'daily', interval: 1, endDate: '2024-08-10' } },
      ];
      const viewStart = new Date('2024-08-01');
      const viewEnd = new Date('2024-08-20');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(10);
      expect(result[result.length - 1].date).toBe('2024-08-10');
    });

    it('exceptionDates 배열에 포함된 날짜는 발생시키지 않아야 합니다.', () => {
      const masterEvents: Event[] = [
        {
          ...baseMasterEvent,
          date: '2024-08-15',
          repeat: { type: 'daily', interval: 1 },
          exceptionDates: ['2024-08-17', '2024-08-18'],
        },
      ];
      const viewStart = new Date('2024-08-15');
      const viewEnd = new Date('2024-08-20');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(4);
      expect(result.map((e) => e.date)).toEqual(['2024-08-15', '2024-08-16', '2024-08-19', '2024-08-20']);
    });

    it('매월 31일 반복 이벤트의 경우, 31일이 없는 달은 건너뛰어야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-01-31', repeat: { type: 'monthly', interval: 1 } },
      ];
      const viewStart = new Date('2024-01-01');
      const viewEnd = new Date('2024-12-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      const expectedDates = [
        '2024-01-31',
        '2024-03-31',
        '2024-05-31',
        '2024-07-31',
        '2024-08-31',
        '2024-10-31',
        '2024-12-31',
      ];
      expect(result).toHaveLength(expectedDates.length);
      expect(result.map((e) => e.date)).toEqual(expectedDates);
    });

    it('매년 2월 29일 반복 이벤트의 경우, 윤년이 아닐 때는 건너뛰어야 합니다.', () => {
      const masterEvents: Event[] = [
        { ...baseMasterEvent, date: '2024-02-29', repeat: { type: 'yearly', interval: 1 } },
      ];
      const viewStart = new Date('2024-01-01');
      const viewEnd = new Date('2029-12-31');

      const result = generateRecurringEvents(masterEvents, viewStart, viewEnd);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.date)).toEqual(['2024-02-29', '2028-02-29']);
    });
  });

  describe('EventInstance 속성 검증', () => {
    const masterEvent: Event = {
      ...baseMasterEvent,
      id: 'evt-series-props',
      seriesId: 'evt-series-props',
      date: '2024-10-01',
      repeat: { type: 'daily', interval: 1 },
    };
    const viewStart = new Date('2024-10-02');
    const viewEnd = new Date('2024-10-03');
    const instances = generateRecurringEvents([masterEvent], viewStart, viewEnd);
    const firstInstance = instances[0] as EventInstance;
    const secondInstance = instances[1] as EventInstance;

    it('생성된 각 EventInstance는 고유한 ID (seriesId-YYYYMMDD 형식)를 가져야 합니다.', () => {
      expect(firstInstance.id).toBe('evt-series-props-20241002');
      expect(secondInstance.id).toBe('evt-series-props-20241003');
    });

    it('생성된 각 EventInstance의 date 속성은 실제 발생 날짜로 설정되어야 합니다.', () => {
      expect(firstInstance.date).toBe('2024-10-02');
      expect(secondInstance.date).toBe('2024-10-03');
    });

    it('생성된 각 EventInstance는 원본 이벤트의 originalDate를 유지해야 합니다.', () => {
      expect(firstInstance.originalDate).toBe(masterEvent.date);
      expect(secondInstance.originalDate).toBe(masterEvent.date);
    });

    it('생성된 각 EventInstance는 원본 이벤트의 다른 모든 속성(title, startTime 등)을 상속받아야 합니다.', () => {
      expect(firstInstance.title).toBe(masterEvent.title);
      expect(firstInstance.startTime).toBe(masterEvent.startTime);
      expect(firstInstance.endTime).toBe(masterEvent.endTime);
      expect(firstInstance.description).toBe(masterEvent.description);
      expect(firstInstance.location).toBe(masterEvent.location);
      expect(firstInstance.category).toBe(masterEvent.category);
      expect(firstInstance.notificationTime).toBe(masterEvent.notificationTime);
      expect(firstInstance.seriesId).toBe(masterEvent.seriesId);
      expect(firstInstance.repeat).toEqual(masterEvent.repeat);
    });
  });
});