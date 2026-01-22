export type CalendarItemType = "task" | "session" | "case" | "event";

export function getCalendarDotClass(type: CalendarItemType): string {
  switch (type) {
    case "task":
      return "bg-blue-600";
    case "session":
      return "bg-green-600";
    case "case":
      return "bg-amber-500";
    case "event":
    default:
      return "bg-slate-500";
  }
}
