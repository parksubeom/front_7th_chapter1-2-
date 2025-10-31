import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';

import { Event, EventForm } from '../types';

type RecurringEventInfo = {
  id?: string;
  seriesId?: string;
  date?: string;
};

export const useEventOperations = (editing?: boolean, onSave?: () => void) => {
  const [events, setEvents] = useState<Event[]>([]);
  const { enqueueSnackbar } = useSnackbar();

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      setEvents(data.events);
      enqueueSnackbar('일정 로딩 완료!', { variant: 'success' });
    } catch (error) {
      console.error('Error fetching events:', error);
      enqueueSnackbar('이벤트 로딩 실패', { variant: 'error' });
    }
  };

  const saveEvent = async (eventData: Event | EventForm) => {
    try {
      if ('id' in eventData && eventData.id) {
        // Update existing event
        const response = await fetch(`/api/events/${eventData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        });
        if (!response.ok) {
          throw new Error('Failed to update event');
        }
        const updatedEvent = await response.json();
        setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
        enqueueSnackbar('일정이 수정되었습니다.', { variant: 'success' });
      } else {
        // Create new event
        const response = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        });
        if (!response.ok) {
          throw new Error('Failed to create event');
        }
        const newEvent = await response.json();
        setEvents(prev => [...prev, newEvent]);
        enqueueSnackbar('일정이 추가되었습니다.', { variant: 'success' });
      }
      onSave?.();
    } catch (error) {
      console.error('Error saving event:', error);
      enqueueSnackbar('일정 저장 실패', { variant: 'error' });
    }
  };

  const updateEvent = async (eventData: Event, scope: 'single' | 'all') => {
    if (!eventData.seriesId) {
      enqueueSnackbar('잘못된 반복 일정입니다.', { variant: 'error' });
      return;
    }

    try {
      if (scope === 'all') {
        const response = await fetch(`/api/events/${eventData.seriesId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        });
        if (!response.ok) throw new Error('Failed to update event series');
        const updatedSeries = await response.json();
        setEvents(prev => prev.map(e => e.id === updatedSeries.id ? updatedSeries : e));
        enqueueSnackbar('전체 시리즈가 수정되었습니다.', { variant: 'success' });
      } else { // scope === 'single'
        const { id, seriesId, ...newInstanceData } = eventData;
        const newSingleEvent = { ...newInstanceData, seriesId: null };

        const postResponse = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSingleEvent),
        });
        if (!postResponse.ok) throw new Error('Failed to create new single event');
        const createdEvent = await postResponse.json();

        const putResponse = await fetch(`/api/events/${eventData.seriesId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addExceptionDate: eventData.date }),
        });
        if (!putResponse.ok) throw new Error('Failed to add exception date to series');
        const updatedSeries = await putResponse.json();

        setEvents(prev => 
          prev.map(e => e.id === updatedSeries.id ? updatedSeries : e).concat(createdEvent)
        );
        enqueueSnackbar('해당 일정만 수정되었습니다.', { variant: 'success' });
      }
      onSave?.();
    } catch (error) {
      console.error('Error updating event:', error);
      enqueueSnackbar('일정 수정 실패', { variant: 'error' });
    }
  };

  const deleteEvent = async (
    eventInfo: string | RecurringEventInfo,
    scope?: 'single' | 'all'
  ) => {
    // Handle simple, non-recurring event deletion
    if (typeof eventInfo === 'string') {
      try {
        const response = await fetch(`/api/events/${eventInfo}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete event');
        setEvents(prev => prev.filter(e => e.id !== eventInfo));
        enqueueSnackbar('일정이 삭제되었습니다.', { variant: 'info' });
      } catch (error) {
        console.error('Error deleting event:', error);
        enqueueSnackbar('일정 삭제 실패', { variant: 'error' });
      }
      return;
    }

    // Handle recurring event deletion
    const { seriesId, date } = eventInfo;
    if (!seriesId) {
      enqueueSnackbar('잘못된 요청입니다.', { variant: 'error' });
      return;
    }

    if (scope === 'all') {
      try {
        const response = await fetch(`/api/events/${seriesId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete series');
        setEvents(prev => prev.filter(e => e.seriesId !== seriesId));
        enqueueSnackbar('전체 시리즈가 삭제되었습니다.', { variant: 'info' });
      } catch (error) {
        console.error('Error deleting series:', error);
        enqueueSnackbar('일정 삭제 실패', { variant: 'error' });
      }
    } else if (scope === 'single') {
      if (!date) {
        enqueueSnackbar('잘못된 요청입니다.', { variant: 'error' });
        return;
      }
      try {
        const response = await fetch(`/api/events/${seriesId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addExceptionDate: date }),
        });
        if (!response.ok) throw new Error('Failed to add exception date for single delete');
        const updatedSeries = await response.json();
        setEvents(prev => prev.map(e => e.id === updatedSeries.id ? updatedSeries : e));
        enqueueSnackbar('해당 일정만 삭제되었습니다.', { variant: 'success' });
      } catch (error) {
        console.error('Error on single instance delete:', error);
        enqueueSnackbar('일정 수정 실패', { variant: 'error' });
      }
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, fetchEvents, saveEvent, updateEvent, deleteEvent };
};
