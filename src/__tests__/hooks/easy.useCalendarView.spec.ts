import { act, renderHook } from '@testing-library/react';

import { useCalendarView } from '../../hooks/useCalendarView.ts';
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
  it('매일 반복되는 이벤트를 월간 뷰 범위 내에서 올바르게 생성해야 한다', () => {
    //
  });

  it('매주 반복되는 이벤트를 월간 뷰 범위 내에서 올바르게 생성해야 한다', () => {
    //
  });

  it('반복 종료일(endDate)이 설정된 경우, 해당 날짜 이후에는 이벤트를 생성하지 않아야 한다', () => {
    //
  });

  it('제외된 날짜(exceptionDates)에 해당하는 반복 발생은 생성하지 않아야 한다', () => {
    //
  });

  it('31일이 없는 달에는 31일에 반복되는 월간 이벤트를 생성하지 않아야 한다', () => {
    //
  });

  it('윤년이 아닌 해에는 2월 29일에 반복되는 연간 이벤트를 생성하지 않아야 한다', () => {
    //
  });

  it('반복 이벤트와 단일 이벤트가 함께 있을 때 모두 올바르게 표시해야 한다', () => {
    //
  });

  it('뷰가 다음 달로 변경될 때, 새로운 월간 뷰 범위에 맞는 반복 이벤트를 다시 계산해야 한다', () => {
    //
  });
});