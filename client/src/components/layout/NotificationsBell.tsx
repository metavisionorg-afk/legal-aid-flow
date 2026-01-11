import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notificationsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/contexts/AuthContext";

type NotificationRow = {
  id: string;
  title?: string | null;
  message?: string | null;
  url?: string | null;
  isRead?: boolean | null;
  createdAt?: string | Date | null;
  relatedEntityId?: string | null;
};

function formatTime(value: NotificationRow["createdAt"]): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function NotificationsBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [blocked401, setBlocked401] = useState(false);

  const enabled = Boolean(user) && !blocked401;

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "my"],
    queryFn: async () => (await notificationsAPI.getMy()) as NotificationRow[],
    enabled,
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      // Avoid rapid retry loops if the backend is down or overloaded.
      return failureCount < 1;
    },
    refetchInterval: blocked401 ? false : 30_000,
  });

  useEffect(() => {
    if ((notificationsQuery.error as any)?.response?.status === 401) {
      setBlocked401(true);
    }
  }, [notificationsQuery.error]);

  const notifications = notificationsQuery.data;

  const unreadCount = useMemo(() => {
    return (notifications || []).filter((n) => !n.isRead).length;
  }, [notifications]);

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => notificationsAPI.markAsRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      if ((err as any)?.response?.status === 401) setBlocked401(true);
      // Keep UX quiet-ish; but still show a readable error.
      console.error(getErrorMessage(err, t));
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => notificationsAPI.markAllAsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      if ((err as any)?.response?.status === 401) setBlocked401(true);
      console.error(getErrorMessage(err, t));
    },
  });

  const items = (notifications || []).slice(0, 10);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground relative"
          aria-label={t("notifications.title", { defaultValue: "Notifications" })}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center"
              aria-label={t("notifications.unread", {
                defaultValue: "Unread notifications",
              })}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">
            {t("notifications.title", { defaultValue: "Notifications" })}
          </DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || unreadCount === 0}
          >
            {t("notifications.mark_all_read", { defaultValue: "Mark all read" })}
          </Button>
        </div>

        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground text-center">
            {t("notifications.empty", { defaultValue: "No notifications" })}
          </div>
        ) : (
          items.map((n) => {
            const title = (n.title || "").trim() || t("notifications.item", { defaultValue: "Notification" });
            const message = (n.message || "").trim();
            const time = formatTime(n.createdAt);
            const isUnread = !n.isRead;

            return (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-1 cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  if (isUnread) markReadMutation.mutate(n.id);
                  if (n.url) setLocation(String(n.url));
                }}
              >
                <div className="w-full flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">
                    {title}
                    {isUnread ? <span className="ml-2 text-xs text-destructive">•</span> : null}
                  </div>
                  {time ? <div className="text-[10px] text-muted-foreground">{time}</div> : null}
                </div>
                {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setLocation("/");
          }}
        >
          {t("notifications.view_all", { defaultValue: "Go to dashboard" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
