import { formatDistanceToNow, isValid, parseISO } from 'date-fns';

/**
 * Safely formats a distance to now, handling invalid dates gracefully.
 * @param date The date to format (string, number, or Date)
 * @returns Formatted string or a fallback
 */
export const safeFormatDistanceToNow = (date: any): string => {
    if (!date) return 'some time ago';
    
    let dateObj: Date;
    if (typeof date === 'string') {
        dateObj = parseISO(date);
    } else if (date instanceof Date) {
        dateObj = date;
    } else {
        dateObj = new Date(date);
    }

    if (!isValid(dateObj)) {
        return 'some time ago';
    }

    try {
        return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'some time ago';
    }
};
