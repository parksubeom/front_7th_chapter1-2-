import { act, renderHook, waitFor } from '@testing-library/react';

import { useCalendarView } from '../../hooks/useCalendarView.ts';
import { setupMockHandlerCreation } from '../../__mocks__/handlersUtils.ts';
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

describe('반복 일정 렌더링', () => {
  it('매일 반복되는 이벤트를 월간 뷰 범위 내에서 올바르게 생성해야 한다', async () => {
    const dailyEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'Daily Standup',
      date: '2025-10-10',
      startTime: '10:00',
      endTime: '10:15',
      description: '',
      location: '',
      category: 'Work',
      repeat: { type: 'daily', interval: 1 },
      notificationTime: 5,
      exceptionDates: [],
    };
    setupMockHandlerCreation([dailyEvent]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      // 10월은 31일까지 있고, 10일부터 시작하므로 22개
      expect(result.current.events).toHaveLength(22);
    });

    const dates = result.current.events.map((e) => e.date);
    expect(dates).toContain('2025-10-10');
    expect(dates).toContain('2025-10-31');
    expect(dates).not.toContain('2025-10-09');
  });

  it('매주 반복되는 이벤트를 월간 뷰 범위 내에서 올바르게 생성해야 한다', async () => {
    const weeklyEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'Weekly Sync',
      date: '2025-10-01', // Wednesday
      startTime: '14:00',
      endTime: '15:00',
      description: '',
      location: '',
      category: 'Work',
      repeat: { type: 'weekly', interval: 1 },
      notificationTime: 15,
      exceptionDates: [],
    };
    setupMockHandlerCreation([weeklyEvent]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      // 10월의 수요일: 1, 8, 15, 22, 29 (5개)
      expect(result.current.events).toHaveLength(5);
    });

    const eventDates = result.current.events.map((e) => e.date).sort();
    expect(eventDates).toEqual(['2025-10-01', '2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29']);
  });

  it('반복 종료일(endDate)이 설정된 경우, 해당 날짜 이후에는 이벤트를 생성하지 않아야 한다', async () => {
    const dailyEventWithEndDate: Event = {
      id: '1',
      seriesId: '1',
      title: 'Short Project',
      date: '2025-10-10',
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: 'Project',
      repeat: { type: 'daily', interval: 1, endDate: '2025-10-15' },
      notificationTime: 10,
      exceptionDates: [],
    };
    setupMockHandlerCreation([dailyEventWithEndDate]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      // 10, 11, 12, 13, 14, 15 (6개)
      expect(result.current.events).toHaveLength(6);
    });
    expect(result.current.events.find((e) => e.date === '2025-10-16')).toBeUndefined();
  });

  it('제외된 날짜(exceptionDates)에 해당하는 반복 발생은 생성하지 않아야 한다', async () => {
    const dailyEventWithExceptions: Event = {
      id: '1',
      seriesId: '1',
      title: 'Daily Meeting',
      date: '2025-10-10',
      startTime: '09:00',
      endTime: '09:30',
      description: '',
      location: '',
      category: 'Work',
      repeat: { type: 'daily', interval: 1, endDate: '2025-10-15' },
      notificationTime: 5,
      exceptionDates: ['2025-10-11', '2025-10-13'],
    };
    setupMockHandlerCreation([dailyEventWithExceptions]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      // 10, 12, 14, 15 (4개)
      expect(result.current.events).toHaveLength(4);
    });
    expect(result.current.events.find((e) => e.date === '2025-10-11')).toBeUndefined();
    expect(result.current.events.find((e) => e.date === '2025-10-13')).toBeUndefined();
  });

  it('31일이 없는 달에는 31일에 반복되는 월간 이벤트를 생성하지 않아야 한다', async () => {
    const monthlyEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'End of Month Report',
      date: '2025-10-31',
      startTime: '16:00',
      endTime: '17:00',
      description: '',
      location: '',
      category: 'Admin',
      repeat: { type: 'monthly', interval: 1 },
      notificationTime: 60,
      exceptionDates: [],
    };
    setupMockHandlerCreation([monthlyEvent]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => expect(result.current.events.length).toBe(1));
    expect(result.current.events[0].date).toBe('2025-10-31');

    act(() => result.current.navigate('next')); // Navigate to November 2025

    // November has 30 days, so no event should be generated.
    await waitFor(() => expect(result.current.events.length).toBe(0));
  });

  it('윤년이 아닌 해에는 2월 29일에 반복되는 연간 이벤트를 생성하지 않아야 한다', async () => {
    const yearlyEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'Leap Day Anniversary',
      date: '2024-02-29', // 2024 is a leap year
      startTime: '12:00',
      endTime: '13:00',
      description: '',
      location: '',
      category: 'Personal',
      repeat: { type: 'yearly', interval: 1 },
      notificationTime: 0,
      exceptionDates: [],
    };
    setupMockHandlerCreation([yearlyEvent]);

    const { result } = renderHook(() => useCalendarView());

    act(() => result.current.setCurrentDate(new Date('2025-02-01'))); // 2025 is not a leap year

    await waitFor(() => expect(result.current.events.length).toBe(0));
  });

  it('반복 이벤트와 단일 이벤트가 함께 있을 때 모두 올바르게 표시해야 한다', async () => {
    const recurringEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'Daily Scrum',
      date: '2025-10-01',
      startTime: '09:00',
      endTime: '09:15',
      description: '',
      location: '',
      category: 'Work',
      repeat: { type: 'daily', interval: 1 },
      notificationTime: 5,
      exceptionDates: [],
    };
    const singleEvent: Event = {
      id: '2',
      title: 'Doctor Appointment',
      date: '2025-10-15',
      startTime: '11:00',
      endTime: '12:00',
      description: '',
      location: '',
      category: 'Health',
      repeat: { type: 'none', interval: 1 },
      notificationTime: 60,
    };
    setupMockHandlerCreation([recurringEvent, singleEvent]);

    const { result } = renderHook(() => useCalendarView());

    await waitFor(() => {
      // 31 daily events + 1 single event
      expect(result.current.events).toHaveLength(32);
    });

    const eventsOn15th = result.current.events.filter((e) => e.date === '2025-10-15');
    expect(eventsOn15th).toHaveLength(2);
    expect(eventsOn15th.find((e) => e.id === '2')).toBeDefined(); // Single event
    expect(eventsOn15th.find((e) => e.seriesId === '1')).toBeDefined(); // Recurring instance
  });

  it('뷰가 다음 달로 변경될 때, 새로운 월간 뷰 범위에 맞는 반복 이벤트를 다시 계산해야 한다', async () => {
    const dailyEvent: Event = {
      id: '1',
      seriesId: '1',
      title: 'Daily Update',
      date: '2025-10-01',
      startTime: '17:00',
      endTime: '17:05',
      description: '',
      location: '',
      category: 'Work',
      repeat: { type: 'daily', interval: 1 },
      notificationTime: 0,
      exceptionDates: [],
    };
    setupMockHandlerCreation([dailyEvent]);

    const { result } = renderHook(() => useCalendarView());

    // Check October
    await waitFor(() => expect(result.current.events.length).toBe(31));
    expect(result.current.events.every((e) => e.date.startsWith('2025-10'))).toBe(true);

    act(() => result.current.navigate('next')); // Navigate to November

    // Check November
    await waitFor(() => expect(result.current.events.length).toBe(30));
    expect(result.current.events.every((e) => e.date.startsWith('2025-11'))).toBe(true);
  });
});