import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import {
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerUpdating,
} from '../../__mocks__/handlersUtils.ts';
import { useEventOperations } from '../../hooks/useEventOperations.ts';
import { server } from '../../setupTests.ts';
import { Event } from '../../types.ts';

const enqueueSnackbarFn = vi.fn();

vi.mock('notistack', async () => {
  const actual = await vi.importActual('notistack');
  return {
    ...actual,
    useSnackbar: () => ({
      enqueueSnackbar: enqueueSnackbarFn,
    }),
  };
});

it('저장되어있는 초기 이벤트 데이터를 적절하게 불러온다', async () => {
  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([
    {
      id: '1',
      title: '기존 회의',
      date: '2025-10-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '기존 팀 미팅',
      location: '회의실 B',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 10,
    },
  ]);
});

it('정의된 이벤트 정보를 기준으로 적절하게 저장이 된다', async () => {
  setupMockHandlerCreation(); // ? Med: 이걸 왜 써야하는지 물어보자

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  const newEvent: Event = {
    id: '1',
    title: '새 회의',
    date: '2025-10-16',
    startTime: '11:00',
    endTime: '12:00',
    description: '새로운 팀 미팅',
    location: '회의실 A',
    category: '업무',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
  };

  await act(async () => {
    await result.current.saveEvent(newEvent);
  });

  expect(result.current.events).toEqual([{ ...newEvent, id: '1' }]);
});

it("새로 정의된 'title', 'endTime' 기준으로 적절하게 일정이 업데이트 된다", async () => {
  setupMockHandlerUpdating();

  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const updatedEvent: Event = {
    id: '1',
    date: '2025-10-15',
    startTime: '09:00',
    description: '기존 팀 미팅',
    location: '회의실 B',
    category: '업무',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
    title: '수정된 회의',
    endTime: '11:00',
  };

  await act(async () => {
    await result.current.saveEvent(updatedEvent);
  });

  expect(result.current.events[0]).toEqual(updatedEvent);
});

it('존재하는 이벤트 삭제 시 에러없이 아이템이 삭제된다.', async () => {
  setupMockHandlerDeletion();

  const { result } = renderHook(() => useEventOperations(false));

  await act(async () => {
    await result.current.deleteEvent('1');
  });

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([]);
});

it("이벤트 로딩 실패 시 '이벤트 로딩 실패'라는 텍스트와 함께 에러 토스트가 표시되어야 한다", async () => {
  server.use(
    http.get('/api/events', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('이벤트 로딩 실패', { variant: 'error' });

  server.resetHandlers();
});

it("존재하지 않는 이벤트 수정 시 '일정 저장 실패'라는 토스트가 노출되며 에러 처리가 되어야 한다", async () => {
  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const nonExistentEvent: Event = {
    id: '999', // 존재하지 않는 ID
    title: '존재하지 않는 이벤트',
    date: '2025-07-20',
    startTime: '09:00',
    endTime: '10:00',
    description: '이 이벤트는 존재하지 않습니다',
    location: '어딘가',
    category: '기타',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
  };

  await act(async () => {
    await result.current.saveEvent(nonExistentEvent);
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 저장 실패', { variant: 'error' });
});

it("네트워크 오류 시 '일정 삭제 실패'라는 텍스트가 노출되며 이벤트 삭제가 실패해야 한다", async () => {
  server.use(
    http.delete('/api/events/:id', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  await act(async () => {
    await result.current.deleteEvent('1');
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 삭제 실패', { variant: 'error' });

  expect(result.current.events).toHaveLength(1);
});

describe('반복 일정 수정 및 삭제', () => {
  const recurringMasterEvent: Event = {
    id: 'series-1',
    seriesId: 'series-1',
    title: '주간 회의',
    date: '2025-10-13', // Monday
    startTime: '10:00',
    endTime: '10:30',
    description: '팀 싱크',
    location: '온라인',
    category: '업무',
    repeat: { type: 'weekly', interval: 1 },
    notificationTime: 10,
    exceptionDates: [],
  };

  beforeEach(() => {
    // 각 테스트 전에 기본 핸들러 설정
    server.use(
      http.get('/api/events', () => {
        return HttpResponse.json({ events: [recurringMasterEvent] });
      })
    );
  });

  describe('단일 발생 수정 (Modify Single Occurrence)', () => {
    it("사용자가 '해당 일정만 수정'을 선택하면, 수정된 정보로 새로운 단일 이벤트가 생성되어야 한다 (repeat.type: 'none', seriesId: null)", async () => {
      const modifiedInstance = {
        ...recurringMasterEvent,
        id: 'series-1-20251020', // Instance ID
        date: '2025-10-20',
        title: '수정된 주간 회의',
        location: '3번 회의실',
        seriesId: 'series-1',
      };

      server.use(
        // 1. 새 단일 이벤트 생성 API 모킹
        http.post('/api/events', async () => {
          const newSingleEvent: Event = {
            id: 'new-evt-1',
            seriesId: null,
            title: '수정된 주간 회의',
            date: '2025-10-20',
            startTime: '10:00',
            endTime: '10:30',
            location: '3번 회의실',
            description: '팀 싱크',
            category: '업무',
            repeat: { type: 'none', interval: 0 },
            notificationTime: 10,
          };
          return HttpResponse.json(newSingleEvent, { status: 201 });
        }),
        // 2. 기존 시리즈 예외 처리 API 모킹
        http.put('/api/events/series-1', async () => {
          return HttpResponse.json({
            ...recurringMasterEvent,
            exceptionDates: ['2025-10-20'],
          });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(() => Promise.resolve(null)); // 초기 데이터 로드

      await act(async () => {
        await result.current.saveEvent(modifiedInstance, 'single');
      });

      const newEvent = result.current.events.find((e) => e.id === 'new-evt-1');
      expect(newEvent).toBeDefined();
      expect(newEvent?.seriesId).toBeNull();
      expect(newEvent?.repeat.type).toBe('none');
      expect(newEvent?.title).toBe('수정된 주간 회의');
    });

    it('새로운 단일 이벤트 생성 요청 성공 후, 기존 반복 시리즈에는 해당 날짜가 예외 처리(exceptionDates)되어야 한다', async () => {
      const modifiedInstance = {
        ...recurringMasterEvent,
        id: 'series-1-20251020',
        date: '2025-10-20',
        title: '수정된 주간 회의',
        seriesId: 'series-1',
      };

      server.use(
        http.post('/api/events', async () => {
          // POST 응답은 위 테스트와 동일
          return HttpResponse.json({ id: 'new-evt-2', seriesId: null, ...modifiedInstance }, { status: 201 });
        }),
        http.put('/api/events/series-1', async ({ request }) => {
          const body = await request.json();
          // @ts-expect-error body type
          if (body.addExceptionDate === '2025-10-20') {
            return HttpResponse.json({
              ...recurringMasterEvent,
              exceptionDates: ['2025-10-20'],
            });
          }
          return new HttpResponse(null, { status: 400 });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(() => Promise.resolve(null));

      await act(async () => {
        await result.current.saveEvent(modifiedInstance, 'single');
      });

      const originalSeries = result.current.events.find((e) => e.id === 'series-1');
      expect(originalSeries).toBeDefined();
      expect(originalSeries?.exceptionDates).toContain('2025-10-20');
    });
  });

  describe('전체 시리즈 수정 (Modify Entire Series)', () => {
    it("사용자가 '향후 모든 일정 수정'을 선택하면, 시리즈의 원본 이벤트 정보 자체가 업데이트되어야 한다", async () => {
      const seriesUpdatePayload: Event = {
        ...recurringMasterEvent,
        title: '전체 수정된 주간 회의',
        endTime: '11:00',
      };

      server.use(
        http.put('/api/events/series-1', async () => {
          return HttpResponse.json(seriesUpdatePayload);
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(() => Promise.resolve(null));

      await act(async () => {
        await result.current.saveEvent(seriesUpdatePayload, 'all');
      });

      expect(result.current.events).toHaveLength(1);
      const updatedEvent = result.current.events[0];
      expect(updatedEvent.id).toBe('series-1');
      expect(updatedEvent.title).toBe('전체 수정된 주간 회의');
      expect(updatedEvent.endTime).toBe('11:00');
    });
  });

  describe('단일 발생 삭제 (Delete Single Occurrence)', () => {
    it("사용자가 '해당 일정만 삭제'를 선택하면, 시리즈 원본 이벤트의 exceptionDates에 해당 날짜가 추가되어야 한다", async () => {
      const instanceIdToDelete = 'series-1-20251027'; // 삭제할 인스턴스 ID

      server.use(
        http.put('/api/events/series-1', async ({ request }) => {
          const body = await request.json();
          // @ts-expect-error body type
          if (body.addExceptionDate === '2025-10-27') {
            return HttpResponse.json({
              ...recurringMasterEvent,
              exceptionDates: ['2025-10-27'],
            });
          }
          return new HttpResponse(null, { status: 400 });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(() => Promise.resolve(null));

      await act(async () => {
        await result.current.deleteEvent(instanceIdToDelete, 'single');
      });

      expect(result.current.events).toHaveLength(1);
      const originalSeries = result.current.events[0];
      expect(originalSeries.exceptionDates).toEqual(['2025-10-27']);
    });
  });

  describe('전체 시리즈 삭제 (Delete Entire Series)', () => {
    it("사용자가 '향후 모든 일정 삭제'를 선택하면, 해당 seriesId를 가진 원본 이벤트가 삭제되어야 한다", async () => {
      const seriesIdToDelete = 'series-1';

      server.use(
        http.delete('/api/events/series-1', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(() => Promise.resolve(null)); // 초기 데이터 로드

      expect(result.current.events).toHaveLength(1); // 삭제 전 확인

      await act(async () => {
        await result.current.deleteEvent(seriesIdToDelete, 'all');
      });

      expect(result.current.events).toHaveLength(0);
    });
  });
});