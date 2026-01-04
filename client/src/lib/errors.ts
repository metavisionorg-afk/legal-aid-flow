export function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as any).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof error === "string" && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
