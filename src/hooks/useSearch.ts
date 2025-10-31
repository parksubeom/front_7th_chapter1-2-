import { useMemo, useState } from 'react';

import { Event, EventInstance } from '../types';
import { getFilteredEvents } from '../utils/eventUtils';

export const useSearch = (
  events: (Event | EventInstance)[],
  currentDate: Date,
  view: 'week' | 'month'
) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEvents = useMemo(() => {
    return getFilteredEvents(events, searchTerm, currentDate, view);
  }, [events, searchTerm, currentDate, view]);

  return {
    searchTerm,
    setSearchTerm,
    filteredEvents,
  };
};