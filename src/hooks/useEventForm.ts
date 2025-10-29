import { ChangeEvent, useEffect, useState } from 'react';

import { Event, EventInstance, RepeatType } from '../types';
import { getTimeErrorMessage } from '../utils/timeValidation';

type TimeErrorRecord = Record<'startTimeError' | 'endTimeError', string | null>;

export const useEventForm = (initialEvent?: Event | EventInstance | null) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('업무');
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [notificationTime, setNotificationTime] = useState(10);
  const [seriesId, setSeriesId] = useState<string | null | undefined>(undefined);

  const [editingEvent, setEditingEvent] = useState<Event | EventInstance | null>(null);

  const [{ startTimeError, endTimeError }, setTimeError] = useState<TimeErrorRecord>({
    startTimeError: null,
    endTimeError: null,
  });

  const updateFormState = (event: Event | EventInstance) => {
    setTitle(event.title);
    setDate(event.date);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setDescription(event.description);
    setLocation(event.location);
    setCategory(event.category);
    const isRepeatEvent = event.repeat.type !== 'none';
    setIsRepeating(isRepeatEvent);
    setRepeatType(isRepeatEvent ? event.repeat.type : 'none');
    setRepeatInterval(event.repeat.interval > 0 ? event.repeat.interval : 1);
    setRepeatEndDate(event.repeat.endDate || '');
    setNotificationTime(event.notificationTime);
    setSeriesId(event.seriesId);
  };

  useEffect(() => {
    if (initialEvent) {
      setEditingEvent(initialEvent);
      updateFormState(initialEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvent]);

  const handleStartTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newStartTime = e.target.value;
    setStartTime(newStartTime);
    setTimeError(getTimeErrorMessage(newStartTime, endTime));
  };

  const handleEndTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newEndTime = e.target.value;
    setEndTime(newEndTime);
    setTimeError(getTimeErrorMessage(startTime, newEndTime));
  };

  const resetForm = () => {
    setTitle('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setLocation('');
    setCategory('업무');
    setIsRepeating(false);
    setRepeatType('none');
    setRepeatInterval(1);
    setRepeatEndDate('');
    setNotificationTime(10);
    setSeriesId(undefined);
    setEditingEvent(null);
  };

  const editEvent = (event: Event | EventInstance) => {
    setEditingEvent(event);
    updateFormState(event);
  };

  return {
    title,
    setTitle,
    date,
    setDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    description,
    setDescription,
    location,
    setLocation,
    category,
    setCategory,
    isRepeating,
    setIsRepeating,
    repeatType,
    setRepeatType,
    repeatInterval,
    setRepeatInterval,
    repeatEndDate,
    setRepeatEndDate,
    notificationTime,
    setNotificationTime,
    startTimeError,
    endTimeError,
    editingEvent,
    setEditingEvent,
    handleStartTimeChange,
    handleEndTimeChange,
    resetForm,
    editEvent,
    seriesId,
    setSeriesId,
  };
};