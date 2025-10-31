import { ChangeEvent, useCallback, useState } from 'react';

import { Event, RepeatInfo, RepeatType } from '../types';
import { getTimeErrorMessage } from '../utils/timeValidation';

type TimeErrorRecord = Record<'startTimeError' | 'endTimeError', string | null>;

const defaultRepeatInfo: RepeatInfo = { type: 'none', interval: 1 };

export const useEventForm = (initialEvent?: Event) => {
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [date, setDate] = useState(initialEvent?.date || '');
  const [startTime, setStartTime] = useState(initialEvent?.startTime || '');
  const [endTime, setEndTime] = useState(initialEvent?.endTime || '');
  const [description, setDescription] = useState(initialEvent?.description || '');
  const [location, setLocation] = useState(initialEvent?.location || '');
  const [category, setCategory] = useState(initialEvent?.category || '업무');
  const [notificationTime, setNotificationTime] = useState(initialEvent?.notificationTime || 10);

  // Raw state for the checkbox UI element
  const [isRepeating, _setIsRepeating] = useState(initialEvent?.repeat?.type !== 'none' || false);

  // Consolidated state for all repeat-related data
  const [repeat, setRepeat] = useState<RepeatInfo>(initialEvent?.repeat || defaultRepeatInfo);

  // Store the original event being edited to preserve properties like id, seriesId
  const [editingEvent, setEditingEvent] = useState<Event | null>(initialEvent || null);

  const [{ startTimeError, endTimeError }, setTimeError] = useState<TimeErrorRecord>({
    startTimeError: null,
    endTimeError: null,
  });

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

  const resetForm = useCallback(() => {
    setTitle('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setLocation('');
    setCategory('업무');
    _setIsRepeating(false);
    setRepeat({ ...defaultRepeatInfo, endDate: '' }); // explicitly clear endDate
    setNotificationTime(10);
    setEditingEvent(null);
    setTimeError({ startTimeError: null, endTimeError: null });
  }, []);

  const editEvent = useCallback((event: Event) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDate(event.date);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setDescription(event.description);
    setLocation(event.location);
    setCategory(event.category);
    _setIsRepeating(event.repeat.type !== 'none');
    setRepeat(event.repeat);
    setNotificationTime(event.notificationTime);
  }, []);

  // Custom setter for 'isRepeating' to keep the 'repeat' object synchronized
  const setIsRepeating = (value: boolean | ((prevState: boolean) => boolean)) => {
    const newValue = typeof value === 'function' ? value(isRepeating) : value;
    _setIsRepeating(newValue);

    if (newValue) {
      // When turning repeating ON, restore a default type if it was 'none'
      setRepeat((prev) => ({ ...prev, type: prev.type === 'none' ? 'daily' : prev.type }));
    } else {
      // When turning repeating OFF, set type to 'none'
      setRepeat((prev) => ({ ...prev, type: 'none' }));
    }
  };

  // Specialized setters for individual repeat properties to maintain a stable API for the UI
  const setRepeatType = (type: RepeatType) => {
    setRepeat((prev) => ({ ...prev, type }));
  };

  const setRepeatInterval = (interval: number) => {
    // Ensure interval is a valid number, defaulting to 1
    setRepeat((prev) => ({ ...prev, interval: Number(interval) || 1 }));
  };

  const setRepeatEndDate = (endDate: string) => {
    setRepeat((prev) => ({ ...prev, endDate }));
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
    setIsRepeating, // Expose the custom setter
    repeatType: repeat.type, // Expose derived value for UI
    setRepeatType,
    repeatInterval: repeat.interval, // Expose derived value for UI
    setRepeatInterval,
    repeatEndDate: repeat.endDate || '', // Expose derived value for UI, ensure it's not undefined
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
  };
};