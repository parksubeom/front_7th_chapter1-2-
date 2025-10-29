import { useCallback, useEffect, useState } from 'react';

import { fetchHolidays } from '../apis/fetchHolidays';
import { Event, EventInstance } from '../types';
import { isDateInRange } from '../utils/dateUtils';
import { generateRecurringEvents } from '../utils/repeatUtils';

export const useCalendarView = () => {
  const [view, setView] = useState<'week' | 'month'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState<{ [key: string]: string }>({});
  const [masterEvents, setMasterEvents] = useState<Event[]>([]);
  const [events, setEvents] = useState<(Event | EventInstance)[]>([]);

  const fetchMasterEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/events');
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const { events: fetchedEvents } = await response.json();
      setMasterEvents(fetchedEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, []);

  useEffect(() => {
    fetchMasterEvents();
  }, [fetchMasterEvents]);

  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let viewStart: Date;
    let viewEnd: Date;

    if (view === 'month') {
      viewStart = new Date(year, month, 1);
      viewEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    } else {
      const current = new Date(currentDate);
      const dayOfWeek = current.getDay();
      const diff = current.getDate() - dayOfWeek;

      viewStart = new Date(current.setDate(diff));
      viewStart.setHours(0, 0, 0, 0);

      viewEnd = new Date(viewStart);
      viewEnd.setDate(viewStart.getDate() + 6);
      viewEnd.setHours(23, 59, 59, 999);
    }

    const singleEvents = masterEvents.filter(
      (event) => !event.seriesId || event.repeat.type === 'none'
    );

    const recurringInstances = generateRecurringEvents(masterEvents, viewStart, viewEnd);

    const singleEventsInView = singleEvents.filter((event) => {
      const eventDate = new Date(event.date);
      // Adjust for timezone offset to compare dates correctly
      eventDate.setMinutes(eventDate.getMinutes() + eventDate.getTimezoneOffset());
      return isDateInRange(eventDate, viewStart, viewEnd);
    });

    setEvents([...singleEventsInView, ...recurringInstances]);
  }, [masterEvents, currentDate, view]);

  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate((prevDate) => {
      const newDate = new Date(prevDate);
      if (view === 'week') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      } else if (view === 'month') {
        newDate.setDate(1);
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
      }
      return newDate;
    });
  };

  useEffect(() => {
    setHolidays(fetchHolidays(currentDate));
  }, [currentDate]);

  return {
    view,
    setView,
    currentDate,
    setCurrentDate,
    holidays,
    navigate,
    events,
    fetchEvents: fetchMasterEvents,
  };
};