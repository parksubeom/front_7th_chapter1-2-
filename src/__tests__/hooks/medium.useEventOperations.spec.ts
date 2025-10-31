import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import {
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerUpdating,
} from '../../__mocks__/handlersUtils.ts';
import { useEventOperations } from '../../hooks/useEventOperations.ts';
import { server } from '../../setupTests.ts';
import { Event, EventForm } from '../../types.ts';

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

describe('반복 일정 생성, 수정, 삭제 로직', () => {
  describe('반복 일정 생성', () => {
    it('신규 반복 일정 생성 시 POST /api/events가 호출되고, 응답받은 데이터의 id와 seriesId는 동일해야 한다', async () => {
      const newRecurringEventForm: Omit<Event, 'id'> = {
        title: '매일 반복되는 스크럼',
        date: '2025-11-01',
        startTime: '10:00',
        endTime: '10:15',
        description: '데일리 스크럼',
        location: 'Zoom',
        category: '업무',
        repeat: { type: 'daily', interval: 1 },
        notificationTime: 5,
      };

      server.use(
        http.post('/api/events', async ({ request }) => {
          const newEvent = (await request.json()) as EventForm;
          const createdEvent: Event = {
            ...newEvent,
            id: 'series-123',
            seriesId: 'series-123',
            exceptionDates: [],
          };
          return HttpResponse.json(createdEvent, { status: 201 });
        })
      );

      const { result } = renderHook(() => useEventOperations(false));

      await act(async () => {
        await result.current.saveEvent(newRecurringEventForm as Event);
      });

      expect(result.current.events).toHaveLength(1);
      const savedEvent = result.current.events[0];
      expect(savedEvent.id).toBe('series-123');
      expect(savedEvent.seriesId).toBe('series-123');
      expect(savedEvent.title).toBe('매일 반복되는 스크럼');
    });
  });

  describe('반복 일정 수정 (Update)', () => {
    const originalSeries: Event = {
      id: 'series-abc',
      seriesId: 'series-abc',
      title: '주간 회의',
      date: '2025-11-03',
      startTime: '14:00',
      endTime: '15:00',
      description: '팀 주간 회의',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'weekly', interval: 1 },
      notificationTime: 30,
      exceptionDates: [],
    };

    it('C 1 (단일 수정): "해당 일정만 수정" 시, 신규 단일 일정 생성(POST)과 원본 시리즈 예외 날짜 추가(PUT) API가 순차적으로 호출되어야 한다 (스펙 4.1)', async () => {
      let postCalled = false;
      let putCalled = false;

      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.post('/api/events', async () => {
          postCalled = true;
          return HttpResponse.json({ id: 'new-single-event', seriesId: null }, { status: 201 });
        }),
        http.put('/api/events/series-abc', async () => {
          putCalled = true;
          return HttpResponse.json({ ...originalSeries, exceptionDates: ['2025-11-10'] });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {}); // 초기 데이터 로딩

      const updatedInstanceData: Event = {
        ...originalSeries,
        id: '', // 새 이벤트이므로 id 없음
        date: '2025-11-10',
        title: '수정된 주간 회의',
        seriesId: 'series-abc', // 수정 대상의 원본 seriesId
      };

      await act(async () => {
        await result.current.updateEvent(updatedInstanceData, 'single');
      });

      expect(postCalled).toBe(true);
      expect(putCalled).toBe(true);
    });

    it('C 1 (단일 수정): 첫 번째 API 호출(POST) 요청 본문에는 `seriesId`가 `null`로 포함되어야 한다', async () => {
      let receivedPostBody: any = null;

      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.post('/api/events', async ({ request }) => {
          receivedPostBody = await request.json();
          return HttpResponse.json({ ...receivedPostBody, id: 'new-single-event' }, { status: 201 });
        }),
        http.put('/api/events/series-abc', () => HttpResponse.json(originalSeries))
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {});

      const updatedInstanceData: Event = {
        ...originalSeries,
        id: '',
        date: '2025-11-10',
        title: '다른 제목의 회의',
        seriesId: 'series-abc',
      };

      await act(async () => {
        await result.current.updateEvent(updatedInstanceData, 'single');
      });

      expect(receivedPostBody).not.toBeNull();
      expect(receivedPostBody.seriesId).toBeNull();
      expect(receivedPostBody.title).toBe('다른 제목의 회의');
    });

    it('C 1 (단일 수정): 두 번째 API 호출(PUT) 요청 본문에는 `{ "addExceptionDate": "..." }`가 포함되어야 한다', async () => {
      let receivedPutBody: any = null;

      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.post('/api/events', () => HttpResponse.json({ id: 'new-event' }, { status: 201 })),
        http.put('/api/events/series-abc', async ({ request }) => {
          receivedPutBody = await request.json();
          return HttpResponse.json({ ...originalSeries, exceptionDates: ['2025-11-10'] });
        })
      );
      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {});

      const updatedInstanceData: Event = { ...originalSeries, id: '', date: '2025-11-10', seriesId: 'series-abc' };

      await act(async () => {
        await result.current.updateEvent(updatedInstanceData, 'single');
      });

      expect(receivedPutBody).toEqual({ addExceptionDate: '2025-11-10' });
    });

    it('C 2 (전체 수정): "전체 시리즈 수정" 시, 시리즈 원본 전체를 업데이트하는 PUT API가 호출되어야 한다 (스펙 4.2)', async () => {
      let receivedPutBody: any = null;

      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.put('/api/events/series-abc', async ({ request }) => {
          receivedPutBody = await request.json();
          return HttpResponse.json(receivedPutBody);
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {});

      const updatedSeriesData: Event = {
        ...originalSeries,
        title: '새로운 시리즈 제목',
        location: '온라인',
      };

      await act(async () => {
        await result.current.updateEvent(updatedSeriesData, 'all');
      });

      expect(receivedPutBody.title).toBe('새로운 시리즈 제목');
      expect(receivedPutBody.location).toBe('온라인');
      expect(receivedPutBody.id).toBe('series-abc');
      expect(receivedPutBody.addExceptionDate).toBeUndefined();
    });
  });

  describe('반복 일정 삭제 (Delete)', () => {
    const originalSeries: Event = {
      id: 'series-def',
      seriesId: 'series-def',
      title: '삭제 테스트용 주간 회의',
      date: '2025-12-01',
      startTime: '14:00',
      endTime: '15:00',
      description: '팀 주간 회의',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'weekly', interval: 1 },
      notificationTime: 30,
      exceptionDates: [],
    };

    it('C 1 (단일 삭제): "해당 일정만 삭제" 시, 원본 시리즈에 예외 날짜를 추가하는 PUT API가 호출되어야 한다 (스펙 5.1)', async () => {
      let receivedPutBody: any = null;
      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.put('/api/events/series-def', async ({ request }) => {
          receivedPutBody = await request.json();
          return HttpResponse.json({ ...originalSeries, exceptionDates: ['2025-12-08'] });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {});

      const eventInstanceToDelete = {
        seriesId: 'series-def',
        date: '2025-12-08',
      };

      await act(async () => {
        await result.current.deleteEvent(eventInstanceToDelete, 'single');
      });

      expect(receivedPutBody).toEqual({ addExceptionDate: '2025-12-08' });
    });

    it('C 2 (전체 삭제): "전체 시리즈 삭제" 시, 원본 시리즈를 삭제하는 DELETE API가 호출되어야 한다 (스펙 5.2)', async () => {
      let deleteCalled = false;
      server.use(
        http.get('/api/events', () => HttpResponse.json({ events: [originalSeries] })),
        http.delete('/api/events/series-def', () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        })
      );

      const { result } = renderHook(() => useEventOperations(true));
      await act(async () => {});

      await act(async () => {
        await result.current.deleteEvent({ seriesId: 'series-def' }, 'all');
      });

      expect(deleteCalled).toBe(true);
      expect(result.current.events).toHaveLength(0);
    });
  });

  describe('에러 핸들링', () => {
    it('API 요청 실패 시 적절한 에러 메시지가 표시되어야 한다', async () => {
      server.use(
        http.put('/api/events/:id', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const { result } = renderHook(() => useEventOperations(false));

      const eventToDelete = { seriesId: 'series-def', date: '2025-12-08' };

      await act(async () => {
        await result.current.deleteEvent(eventToDelete, 'single');
      });

      expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 수정 실패', { variant: 'error' });
    });
  });
});
