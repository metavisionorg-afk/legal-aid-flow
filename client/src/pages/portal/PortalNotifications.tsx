import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Bell, Check, CheckCheck, Trash2, Mail, MailOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { notificationsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  url: string | null;
  isRead: boolean;
  relatedEntityId: string | null;
  createdAt: string;
}

export default function PortalNotifications() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "unread">("unread");

  const dateLocale = i18n.language === "ar" ? ar : enUS;

  // Fetch all notifications
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications/my"],
    queryFn: () => notificationsAPI.getMy(),
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsAPI.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/my"] });
      toast({
        title: t("portal_notifications.mark_read_success"),
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: t("portal_notifications.mark_read_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/my"] });
      toast({
        title: t("portal_notifications.mark_all_read_success"),
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: t("portal_notifications.mark_all_read_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  // Filter notifications based on active tab
  const filteredNotifications = activeTab === "unread"
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  // Count unread notifications
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Get notification type badge variant
  const getTypeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    if (type.includes("URGENT") || type.includes("DEADLINE")) return "destructive";
    if (type.includes("SUCCESS") || type.includes("COMPLETED")) return "default";
    if (type.includes("UPDATE") || type.includes("CHANGED")) return "secondary";
    return "outline";
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    if (type.includes("CASE")) return "📋";
    if (type.includes("SESSION") || type.includes("APPOINTMENT")) return "📅";
    if (type.includes("DOCUMENT")) return "📄";
    if (type.includes("TASK")) return "✅";
    if (type.includes("MESSAGE") || type.includes("REPLY")) return "💬";
    if (type.includes("JUDICIAL_SERVICE")) return "⚖️";
    return "🔔";
  };

  // Format relative time
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("portal_notifications.time.just_now");
    if (diffMins < 60) return t("portal_notifications.time.minutes_ago", { count: diffMins });
    if (diffHours < 24) return t("portal_notifications.time.hours_ago", { count: diffHours });
    if (diffDays < 7) return t("portal_notifications.time.days_ago", { count: diffDays });
    return format(date, "PPp", { locale: dateLocale });
  };

  // Handle notification click (mark as read and navigate if URL exists)
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.url) {
      window.location.href = notification.url;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            {t("portal_notifications.title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("portal_notifications.subtitle")}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            {t("portal_notifications.mark_all_read")}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "unread")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="unread" className="relative">
            {t("portal_notifications.tabs.unread")}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] px-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">
            {t("portal_notifications.tabs.all")} ({notifications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  {activeTab === "unread" ? (
                    <MailOpen className="h-12 w-12 text-muted-foreground" />
                  ) : (
                    <Bell className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {activeTab === "unread"
                    ? t("portal_notifications.empty.unread_title")
                    : t("portal_notifications.empty.all_title")}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {activeTab === "unread"
                    ? t("portal_notifications.empty.unread_message")
                    : t("portal_notifications.empty.all_message")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`transition-all cursor-pointer hover:shadow-md ${
                    !notification.isRead ? "border-l-4 border-l-primary bg-accent/50" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {/* Icon */}
                        <div className="text-2xl mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-base">
                              {notification.title}
                            </CardTitle>
                            {!notification.isRead && (
                              <Badge variant="default" className="h-5 px-1.5 text-xs">
                                {t("portal_notifications.badge.new")}
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-sm">
                            {notification.message}
                          </CardDescription>
                          
                          {/* Type badge and time */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant={getTypeVariant(notification.type)} className="text-xs">
                              {t(`portal_notifications.types.${notification.type}`, notification.type)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action button */}
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsReadMutation.mutate(notification.id);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Info card */}
      {notifications.length > 0 && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("portal_notifications.info.title")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("portal_notifications.info.message")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
