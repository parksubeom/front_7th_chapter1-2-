import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';

import { Event, EventForm } from '../types';

export const useEventOperations = (editing: boolean, onSave?: () => void) => {
  const [events, setEvents] = useState<Event[]>([]);
  const { enqueueSnackbar } = useSnackbar();

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const { events: fetchedEvents } = await response.json();
      setEvents(fetchedEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
      enqueueSnackbar('이벤트 로딩 실패', { variant: 'error' });
    }
  };

  const saveEvent = async (eventData: Event | EventForm, mode?: 'single' | 'all') => {
    try {
      const event = eventData as Event;
      const isRecurringInstance = !!event.seriesId;

      if (editing && isRecurringInstance && event.seriesId) {
        if (mode === 'single') {
          // 1. Create a new single event with the modified details.
          const newSingleEventData: EventForm = {
            title: event.title,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            description: event.description,
            location: event.location,
            category: event.category,
            notificationTime: event.notificationTime,
            repeat: { type: 'none', interval: 0 }, // It's a single event now.
            seriesId: null, // Detach from the series.
          };
          const postResponse = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSingleEventData),
          });
          if (!postResponse.ok) {
            throw new Error('Failed to create new single event');
          }
          const newEvent = await postResponse.json();

          // 2. Add an exception to the original series for the modified date.
          const putResponse = await fetch(`/api/events/${event.seriesId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addExceptionDate: event.date }),
          });
          if (!putResponse.ok) {
            throw new Error('Failed to add exception date to series');
          }
          const updatedSeries = await putResponse.json();

          setEvents((prevEvents) => [
            ...prevEvents.filter((e) => e.id !== updatedSeries.id),
            updatedSeries,
            newEvent,
          ]);
        } else if (mode === 'all') {
          // Update the entire series master event.
          const response = await fetch(`/api/events/${event.seriesId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
          });
          if (!response.ok) {
            throw new Error('Failed to save event series');
          }
          const updatedEvent = await response.json();
          setEvents((prevEvents) =>
            prevEvents.map((e) => (e.id === updatedEvent.id ? updatedEvent : e))
          );
        }
      } else if (editing) {
        // Standard update for a single, non-recurring event.
        const response = await fetch(`/api/events/${event.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        });
        if (!response.ok) {
          throw new Error('Failed to save event');
        }
        const updatedEvent = await response.json();
        setEvents((prevEvents) =>
          prevEvents.map((e) => (e.id === updatedEvent.id ? updatedEvent : e))
        );
      } else {
        // Create a new event (can be single or the start of a new series).
        const response = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        });
        if (!response.ok) {
          throw new Error('Failed to save event');
        }
        const newEvent = await response.json();
        setEvents((prevEvents) => [...prevEvents, newEvent]);
      }

      onSave?.();
      enqueueSnackbar(editing ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.', {
        variant: 'success',
      });
    } catch (error) {
      console.error('Error saving event:', error);
      enqueueSnackbar('일정 저장 실패', { variant: 'error' });
    }
  };

  const deleteEvent = async (id: string, mode?: 'single' | 'all') => {
    try {
      if (mode === 'single') {
        // Deleting a single instance means adding an exception date to the master event.
        // The ID is in the format: `${seriesId}-${YYYYMMDD}`.
        const lastHyphenIndex = id.lastIndexOf('-');
        if (lastHyphenIndex === -1) {
          throw new Error('Invalid instance ID format for single delete');
        }

        const seriesId = id.substring(0, lastHyphenIndex);
        const dateStr = id.substring(lastHyphenIndex + 1);

        if (dateStr.length !== 8 || !/^\d{8}$/.test(dateStr)) {
          throw new Error('Invalid date format in instance ID');
        }

        const exceptionDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        const response = await fetch(`/api/events/${seriesId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addExceptionDate: exceptionDate }),
        });

        if (!response.ok) {
          throw new Error('Failed to add exception date for deletion');
        }
        const updatedSeries = await response.json();
        setEvents((prevEvents) =>
          prevEvents.map((e) => (e.id === updatedSeries.id ? updatedSeries : e))
        );
      } else {
        // 'all' mode deletes the entire series.
        // No mode deletes a single non-recurring event.
        // In both cases, the 'id' parameter is the one to delete.
        const response = await fetch(`/api/events/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error('Failed to delete event');
        }
        setEvents((prevEvents) => prevEvents.filter((e) => e.id !== id));
      }

      enqueueSnackbar('일정이 삭제되었습니다.', { variant: 'info' });
    } catch (error) {
      console.error('Error deleting event:', error);
      enqueueSnackbar('일정 삭제 실패', { variant: 'error' });
    }
  };

  async function init() {
    await fetchEvents();
    enqueueSnackbar('일정 로딩 완료!', { variant: 'info' });
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, fetchEvents, saveEvent, deleteEvent };
};