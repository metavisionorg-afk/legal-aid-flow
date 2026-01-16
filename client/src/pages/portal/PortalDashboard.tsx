import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, FileText, Calendar, CheckCircle, Bell, XCircle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { portalAPI, casesAPI, documentsAPI, notificationsAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";

export default function PortalDashboard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["portal-dashboard-stats"],
    queryFn: portalAPI.getDashboardStats,
  });

  // Fetch cases to find next session
  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ["portal-my-cases"],
    queryFn: casesAPI.getMy,
  });

  // Fetch recent documents
  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ["portal-my-documents"],
    queryFn: documentsAPI.listMy,
  });

  // Fetch recent notifications
  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ["portal-my-notifications"],
    queryFn: notificationsAPI.getMy,
  });

  // Calculate next session from cases
  // For now, we'll use a placeholder since we need to fetch sessions separately
  // In a real implementation, we'd need to add an API endpoint for beneficiary sessions
  const nextSession: { title: string; date: string } | null = null;

  // Get last uploaded document
  const lastDocument = documents?.length ? documents[0] : null;

  // Get recent notifications (last 5)
  const recentNotifications = notifications?.slice(0, 5) || [];

  // Stats cards configuration
  const statsConfig = [
    {
      title: t('portal_dashboard.stats.total_cases'),
      value: stats?.totalCases || 0,
      icon: Briefcase,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
      link: "/portal/my-cases",
    },
    {
      title: t('portal_dashboard.stats.active_cases'),
      value: stats?.activeCases || 0,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-50",
      link: "/portal/my-cases",
    },
    {
      title: t('portal_dashboard.stats.pending_intake'),
      value: stats?.pendingIntake || 0,
      icon: FileText,
      color: "text-orange-500",
      bgColor: "bg-orange-50",
      link: "/portal/my-requests",
    },
    {
      title: t('portal_dashboard.stats.closed_cases'),
      value: (stats?.totalCases || 0) - (stats?.activeCases || 0),
      icon: XCircle,
      color: "text-gray-500",
      bgColor: "bg-gray-50",
      link: "/portal/my-cases",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('portal_dashboard.welcome')}</h1>
        <p className="text-muted-foreground mt-2">{t('portal_dashboard.subtitle')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsConfig.map((stat, i) => (
          <Link key={i} href={stat.link}>
            <Card className="cursor-pointer hover:border-primary transition-colors" data-testid={`stat-card-${i}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`h-10 w-10 rounded-full ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold" data-testid={`stat-value-${i}`}>{stat.value}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Next Session Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {t('portal_dashboard.next_session.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {casesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t('portal_dashboard.next_session.no_sessions')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last Document Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {t('portal_dashboard.last_document.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documentsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : lastDocument ? (
              <div className="space-y-2">
                <Link href="/portal/my-cases">
                  <p className="text-sm font-medium hover:text-primary transition-colors cursor-pointer truncate">
                    {lastDocument.title || lastDocument.fileName}
                  </p>
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t('portal_dashboard.last_document.uploaded')}{" "}
                  {formatDistanceToNow(new Date(lastDocument.createdAt), {
                    addSuffix: true,
                    locale,
                  })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t('portal_dashboard.last_document.no_documents')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t('portal_dashboard.notifications.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notificationsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentNotifications.length > 0 ? (
            <div className="space-y-3">
              {recentNotifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{notification.title}</p>
                      {!notification.isRead && (
                        <Badge variant="default" className="text-xs">{t("portal_dashboard.notifications.badge_new")}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                        locale,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {t('portal_dashboard.notifications.no_notifications')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
