/**
 * Date preset utilities for filtering transactions
 */

export type DatePreset = 
  | "today"
  | "yesterday"
  | "week_to_date"
  | "last_week"
  | "month_to_date"
  | "last_month"
  | "custom";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Gets the date range for a preset
 */
export function getDatePresetRange(preset: DatePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const formatDate = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };

  switch (preset) {
    case "today": {
      return {
        startDate: formatDate(today),
        endDate: formatDate(today),
      };
    }

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: formatDate(yesterday),
        endDate: formatDate(yesterday),
      };
    }

    case "week_to_date": {
      const startOfWeek = new Date(today);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday
      startOfWeek.setDate(diff);
      return {
        startDate: formatDate(startOfWeek),
        endDate: formatDate(today),
      };
    }

    case "last_week": {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday of current week
      const lastMonday = new Date(today);
      lastMonday.setDate(diff - 7); // Monday of last week
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastSunday.getDate() + 6); // Sunday of last week
      return {
        startDate: formatDate(lastMonday),
        endDate: formatDate(lastSunday),
      };
    }

    case "month_to_date": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: formatDate(startOfMonth),
        endDate: formatDate(today),
      };
    }

    case "last_month": {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: formatDate(firstDayLastMonth),
        endDate: formatDate(lastDayLastMonth),
      };
    }

    case "custom":
    default:
      // Return empty range for custom (user will set manually)
      return {
        startDate: "",
        endDate: "",
      };
  }
}

/**
 * Gets a human-readable label for a date preset
 */
export function getDatePresetLabel(preset: DatePreset): string {
  switch (preset) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "week_to_date":
      return "Week to Date";
    case "last_week":
      return "Last Week";
    case "month_to_date":
      return "Month to Date";
    case "last_month":
      return "Last Month";
    case "custom":
      return "Custom Range";
    default:
      return "All Time";
  }
}

