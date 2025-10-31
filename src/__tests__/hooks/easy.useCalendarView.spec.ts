import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { useCalendarView } from '../../hooks/useCalendarView.ts';
import { server } from '../../setupTests.ts';
import { Event } from '../../types.ts';
import { assertDate } from '../utils.ts';

describe('초기 상태', () => {
  it('view는 "month"이어야 한다', () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current.view).toBe('month');
  });

  it('currentDate는 오늘 날짜인 "2025-10-01"이어야 한다', () => {
    const { result } = renderHook(() => useCalendarView());

    assertDate(result.current.currentDate, new Date('2025-10-01'));
  });

  it('holidays는 10월 휴일인 개천절, 한글날, 추석이 지정되어 있어야 한다', () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current.holidays).toEqual({
      '2025-10-03': '개천절',
      '2025-10-09': '한글날',
      '2025-10-05': '추석',
      '2025-10-06': '추석',
      '2025-10-07': '추석',
    });
  });
});

it("view를 'week'으로 변경 시 적절하게 반영된다", () => {
  const { result } = renderHook(() => useCalendarView());

  act(() => {
    result.current.setView('week');
  });

  expect(result.current.view).toBe('week');
});

it("주간 뷰에서 다음으로 navigate시 7일 후 '2025-10-08' 날짜로 지정이 된다", () => {
  const { result } = renderHook(() => useCalendarView());
  act(() => {
    result.current.setView('week');
  });

  act(() => {
    result.current.navigate('next');
  });

  assertDate(result.current.currentDate, new Date('2025-10-08'));
});

it("주간 뷰에서 이전으로 navigate시 7일 후 '2025-09-24' 날짜로 지정이 된다", () => {
  const { result } = renderHook(() => useCalendarView());
  act(() => {
    result.current.setView('week');
  });

  act(() => {
    result.current.navigate('prev');
  });

  assertDate(result.current.currentDate, new Date('2025-09-24'));
});

it("월간 뷰에서 다음으로 navigate시 한 달 후 '2025-11-01' 날짜여야 한다", () => {
  const { result } = renderHook(() => useCalendarView());

  act(() => {
    result.current.navigate('next');
  });

  assertDate(result.current.currentDate, new Date('2025-11-01'));
});

it("월간 뷰에서 이전으로 navigate시 한 달 전 '2025-09-01' 날짜여야 한다", () => {
  const { result } = renderHook(() => useCalendarView());

  act(() => {
    result.current.navigate('prev');
  });

  assertDate(result.current.currentDate, new Date('2025-09-01'));
});

it("currentDate가 '2025-03-01' 변경되면 3월 휴일 '삼일절'로 업데이트되어야 한다", async () => {
  const { result } = renderHook(() => useCalendarView());

  act(() => {
    result.current.setCurrentDate(new Date('2025-03-01'));
  });

  expect(result.current.holidays).toEqual({ '2025-03-01': '삼일절' });
});

describe('반복 일정 렌더링 로직 (useCalendarView)', () => {
  it('월간 뷰에서 매일 반복되는 일정이 현재 보이는 모든 날짜에 대해 생성되어야 한다', async () => {
    const mockEvents: Event[] = [
      {
        id: 'series-1',
        seriesId: 'series-1',
        title: '매일 아침 회의',
        date: '2025-10-01',
        startTime: '09:00',
        endTime: '09:30',
        description: '일일 스탠드업',
        location: '온라인',
        category: '업무',
        repeat: { type: 'daily', interval: 1 },
        notificationTime: 10,
      },
    ];

    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      expect(result.current.viewEvents).toHaveLength(31);
    });

    expect(result.current.viewEvents[0].date).toBe('2025-10-01');
    expect((result.current.viewEvents[0] as EventInstance).instanceId).toBe('series-1-20251001');
    expect(result.current.viewEvents[30].date).toBe('2025-10-31');
    expect((result.current.viewEvents[30] as EventInstance).instanceId).toBe('series-1-20251031');
  });

  it('주간 뷰에서 매주 반복되는 일정이 해당 주에 올바르게 생성되어야 한다', async () => {
    const mockEvents: Event[] = [
      {
        id: 'series-weekly',
        seriesId: 'series-weekly',
        title: '주간 보고',
        date: '2025-09-29', // 월요일
        startTime: '14:00',
        endTime: '15:00',
        description: '팀 주간 보고 회의',
        location: '회의실 A',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        notificationTime: 30,
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());
    act(() => {
      result.current.setView('week');
      result.current.setCurrentDate(new Date('2025-10-14')); // 10월 13일(월)이 포함된 주
    });

    await waitFor(() => {
      expect(result.current.viewEvents).toHaveLength(1);
    });
    expect(result.current.viewEvents[0].date).toBe('2025-10-13');
    expect(result.current.viewEvents[0].instanceId).toBe('series-weekly-20251013');
  });

  it('exceptionDates에 포함된 날짜의 반복 일정은 렌더링에서 제외되어야 한다', async () => {
    const mockEvents: Event[] = [
      {
        id: 'series-1',
        seriesId: 'series-1',
        title: '매일 아침 회의',
        date: '2025-10-01',
        startTime: '09:00',
        endTime: '09:30',
        description: '일일 스탠드업',
        location: '온라인',
        category: '업무',
        repeat: { type: 'daily', interval: 1 },
        notificationTime: 10,
        exceptionDates: ['2025-10-03', '2025-10-09'], // 개천절, 한글날 제외
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      expect(result.current.viewEvents).toHaveLength(29); // 31일 - 2일 = 29일
    });
    const renderedDates = result.current.viewEvents.map((event) => event.date);
    expect(renderedDates).not.toContain('2025-10-03');
    expect(renderedDates).not.toContain('2025-10-09');
  });

  it('반복 종료일(endDate)이 설정된 경우, 그 이후의 날짜에는 반복 일정이 생성되지 않아야 한다', async () => {
    const mockEvents: Event[] = [
      {
        id: 'series-1',
        seriesId: 'series-1',
        title: '특별 캠페인',
        date: '2025-10-01',
        startTime: '10:00',
        endTime: '11:00',
        description: '10일간 진행',
        location: '온라인',
        category: '프로모션',
        repeat: { type: 'daily', interval: 1, endDate: '2025-10-10' },
        notificationTime: 10,
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      expect(result.current.viewEvents).toHaveLength(10);
    });
    expect(result.current.viewEvents[9].date).toBe('2025-10-10');
  });

  it('다음 달/주로 이동했을 때, 새로운 날짜 범위에 맞는 반복 일정이 올바르게 다시 계산되어야 한다', async () => {
    const mockEvents: Event[] = [
      {
        id: 'series-1',
        seriesId: 'series-1',
        title: '매일 반복',
        date: '2025-01-01',
        startTime: '09:00',
        endTime: '09:30',
        repeat: { type: 'daily', interval: 1 },
        notificationTime: 10,
        description: '',
        location: '',
        category: '기타',
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());

    // 10월 확인
    await waitFor(() => expect(result.current.viewEvents).toHaveLength(31));

    // 11월로 이동
    act(() => result.current.navigate('next'));

    // 11월 확인
    await waitFor(() => expect(result.current.viewEvents).toHaveLength(30));
    expect(result.current.viewEvents[0].date).toBe('2025-11-01');
  });

  it('단일 수정된 이벤트(seriesId: null)는 독립적인 단일 일정으로 표시되어야 한다', async () => {
    const mockEvents: Event[] = [
      // 원본 반복 시리즈
      {
        id: 'series-1',
        seriesId: 'series-1',
        title: '데일리 스크럼',
        date: '2025-10-01',
        startTime: '10:00',
        endTime: '10:30',
        repeat: { type: 'daily', interval: 1 },
        exceptionDates: ['2025-10-15'], // 15일은 예외 처리됨
        notificationTime: 10,
        description: '',
        location: '',
        category: '업무',
      },
      // 단일로 수정된 이벤트
      {
        id: 'event-123',
        seriesId: null, // 단일 일정으로 분리됨을 의미
        title: '데일리 스크럼 (장소 변경)',
        date: '2025-10-15',
        startTime: '10:00',
        endTime: '10:30',
        location: '대회의실',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 10,
        description: '',
        category: '업무',
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: mockEvents })));

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => expect(result.current.viewEvents).toHaveLength(31)); // 30개 인스턴스 + 1개 단일 이벤트

    const eventOn15th = result.current.viewEvents.find((e) => e.date === '2025-10-15') as Event;
    expect(eventOn15th).toBeDefined();
    expect(eventOn15th.title).toBe('데일리 스크럼 (장소 변경)');
    expect(eventOn15th.id).toBe('event-123'); // EventInstance가 아니므로 'id'를 가짐
    expect(eventOn15th.seriesId).toBeNull();
  });

  it('원본 이벤트 목록(API 응답)이 변경되면, 화면에 표시되는 이벤트 인스턴스 목록도 업데이트되어야 한다', async () => {
    const initialMock: Event[] = [
      {
        id: '1',
        seriesId: '1',
        title: '매일 반복',
        date: '2025-10-01',
        startTime: '09:00',
        endTime: '09:30',
        repeat: { type: 'daily', interval: 1 },
        notificationTime: 10,
        description: '',
        location: '',
        category: '기타',
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: initialMock })));

    const { result, rerender } = renderHook(() => useCalendarView());
    await waitFor(() => expect(result.current.viewEvents).toHaveLength(31));

    const updatedMock: Event[] = [
      {
        id: '2',
        seriesId: '2',
        title: '매주 반복',
        date: '2025-10-06', // 월요일
        startTime: '14:00',
        endTime: '15:00',
        repeat: { type: 'weekly', interval: 1 },
        notificationTime: 10,
        description: '',
        location: '',
        category: '기타',
      },
    ];
    server.use(http.get('/api/events', () => HttpResponse.json({ events: updatedMock })));

    rerender();

    await waitFor(() => expect(result.current.viewEvents).toHaveLength(4)); // 10월에는 6, 13, 20, 27일 4번 발생
    expect(result.current.viewEvents[0].title).toBe('매주 반복');
  });
});