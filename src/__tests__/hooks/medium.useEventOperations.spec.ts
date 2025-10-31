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

vi.mock('notistack',  () => {
  const actual = await vi.importActual('notistack');
  return {
    ...actual,
    useSnackbar: () => ({
      enqueueSnackbar,
    }),
  };
});

it('저장되어있는 초기 이벤트 데이터를 적절하게 불러온다',  () => {
  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([
    {
      id: '1',
      title: '기존 회의',
      date: '2025-10-15',
      startTime: '09',
      endTime: '10',
      description: '기존 팀 미팅',
      location: '회의실 B',
      category: '업무',
      repeat: { type: 'none', interval},
      notificationTime,
    },
  ]);
});

it('정의된 이벤트 정보를 기준으로 적절하게 저장이 된다',  () => {
  setupMockHandlerCreation(); // ? Med: 이걸 왜 써야하는지 물어보자

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  const newEvent= {
    id: '1',
    title: '새 회의',
    date: '2025-10-16',
    startTime: '11',
    endTime: '12',
    description: '새로운 팀 미팅',
    location: '회의실 A',
    category: '업무',
    repeat: { type: 'none', interval},
    notificationTime,
  };

  await act( () => {
    await result.current.saveEvent(newEvent);
  });

  expect(result.current.events).toEqual([{ ...newEvent, id: '1' }]);
});

it("새로 정의된 'title', 'endTime' 기준으로 적절하게 일정이 업데이트 된다",  () => {
  setupMockHandlerUpdating();

  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const updatedEvent= {
    id: '1',
    date: '2025-10-15',
    startTime: '09',
    description: '기존 팀 미팅',
    location: '회의실 B',
    category: '업무',
    repeat: { type: 'none', interval},
    notificationTime,
    title: '수정된 회의',
    endTime: '11',
  };

  await act( () => {
    await result.current.saveEvent(updatedEvent);
  });

  expect(result.current.events[0]).toEqual(updatedEvent);
});

it('존재하는 이벤트 삭제 시 에러없이 아이템이 삭제된다.',  () => {
  setupMockHandlerDeletion();

  const { result } = renderHook(() => useEventOperations(false));

  await act( () => {
    await result.current.deleteEvent('1');
  });

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([]);
});

it("이벤트 로딩 실패 시 '이벤트 로딩 실패'라는 텍스트와 함께 에러 토스트가 표시되어야 한다",  () => {
  server.use(
    http.get('/api/events', () => {
      return new HttpResponse(null, { status});
    })
  );

  renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('이벤트 로딩 실패', { variant: 'error' });

  server.resetHandlers();
});

it("존재하지 않는 이벤트 수정 시 '일정 저장 실패'라는 토스트가 노출되며 에러 처리가 되어야 한다",  () => {
  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const nonExistentEvent= {
    id: '999', // 존재하지 않는 ID
    title: '존재하지 않는 이벤트',
    date: '2025-07-20',
    startTime: '09',
    endTime: '10',
    description: '이 이벤트는 존재하지 않습니다',
    location: '어딘가',
    category: '기타',
    repeat: { type: 'none', interval},
    notificationTime,
  };

  await act( () => {
    await result.current.saveEvent(nonExistentEvent);
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 저장 실패', { variant: 'error' });
});

it("네트워크 오류 시 '일정 삭제 실패'라는 텍스트가 노출되며 이벤트 삭제가 실패해야 한다",  () => {
  server.use(
    http.delete('/api/events/', () => {
      return new HttpResponse(null, { status});
    })
  );

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  await act( () => {
    await result.current.deleteEvent('1');
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 삭제 실패', { variant: 'error' });

  expect(result.current.events).toHaveLength(1);
});

describe('반복 일정 생성, 수정, 삭제 로직', () => {
  describe('반복 일정 생성', () => {
    it('신규 반복 일정 생성 시 POST /api/events가 호출되고, 응답받은 데이터의 id와 seriesId는 동일해야 한다', () => {
      // 로직 구현 예정
    });
  });

  describe('반복 일정 수정 (Update)', () => {
    it('C 1 (단일 수정): "해당 일정만 수정" 시, 신규 단일 일정 생성(POST)과 원본 시리즈 예외 날짜 추가(PUT) API가 순차적으로 호출되어야 한다 (스펙 4.1)', () => {
      // 로직 구현 예정
    });

    it('C 1 (단일 수정): 첫 번째 API 호출(POST) 요청 본문에는 `seriesId`이 포함되어야 한다', () => {
      // 로직 구현 예정
    });

    it('C 1 (단일 수정): 두 번째 API 호출(PUT) 요청 본문에는 `{ "addExceptionDate": "..." }`가 포함되어야 한다', () => {
      // 로직 구현 예정
    });

    it('C 2 (전체 수정): "전체 시리즈 수정" 시, 시리즈 원본 전체를 업데이트하는 PUT API가 호출되어야 한다 (스펙 4.2)', () => {
      // 로직 구현 예정
    });
  });

  describe('반복 일정 삭제 (Delete)', () => {
    it('C 1 (단일 삭제): "해당 일정만 삭제" 시, 원본 시리즈에 예외 날짜를 추가하는 PUT API가 호출되어야 한다 (스펙 5.1)', () => {
      // 로직 구현 예정
    });

    it('C 2 (전체 삭제): "전체 시리즈 삭제" 시, 원본 시리즈를 삭제하는 DELETE API가 호출되어야 한다 (스펙 5.2)', () => {
      // 로직 구현 예정
    });
  });

  describe('에러 핸들링', () => {
    it('API 요청 실패 시 적절한 에러 메시지가 표시되어야 한다', () => {
      // 로직 구현 예정
    });
  });
});