export type CalendarScope = "admin" | "lawyer" | "beneficiary";
export type CalendarEventType = "session" | "task" | "case";

export type CalendarEvent = {
  type: CalendarEventType;
  id: string;
  title: string;
  date: string;
  relatedId?: string | null;
  status?: string | null;
  priority?: string | null;
};

export type CalendarResponse = {
  month: string;
  scope: CalendarScope;
  events: CalendarEvent[];
};

export async function getCalendarMonth(input: {
  month: string;
  scope: CalendarScope;
}): Promise<CalendarResponse> {
  const params = new URLSearchParams({ month: input.month, scope: input.scope });
  const res = await fetch(`/api/calendar?${params.toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      body && typeof body === "object" && typeof (body as any).error === "string"
        ? (body as any).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as CalendarResponse;
}
