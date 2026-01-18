// Zoom Server-to-Server OAuth Integration
// Uses Account Credentials (no user authentication required)

interface ZoomMeetingResponse {
  id: string;
  join_url: string;
  start_url?: string;
  topic: string;
  duration: number;
}

interface CreateZoomMeetingParams {
  topic: string;
  start_time: string; // ISO 8601 format
  duration: number; // in minutes
  timezone?: string;
}

interface ZoomConfig {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Get Zoom access token using Server-to-Server OAuth
 * Can accept explicit config or fall back to environment variables
 */
export async function getAccessToken(config?: ZoomConfig): Promise<string> {
  const accountId = config?.accountId || process.env.ZOOM_ACCOUNT_ID;
  const clientId = config?.clientId || process.env.ZOOM_CLIENT_ID;
  const clientSecret = config?.clientSecret || process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured");
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to get Zoom access token: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get Zoom access token using environment variables (legacy)
 */
async function getZoomAccessToken(): Promise<string> {
  return getAccessToken();
}

/**
 * Create a Zoom meeting
 */
export async function createZoomMeeting(params: CreateZoomMeetingParams): Promise<ZoomMeetingResponse> {
  const accessToken = await getZoomAccessToken();
  const meetingsUrl = "https://api.zoom.us/v2/users/me/meetings";

  const payload = {
    topic: params.topic,
    type: 2, // Scheduled meeting
    start_time: params.start_time,
    duration: params.duration,
    timezone: params.timezone || "Asia/Riyadh",
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: false,
      auto_recording: "none",
    },
  };

  const response = await fetch(meetingsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to create Zoom meeting: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Check if Zoom integration is enabled
 */
export function isZoomEnabled(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}
