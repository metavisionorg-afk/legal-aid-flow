import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, FileText, Calendar, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { portalAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PortalDashboard() {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["portal-dashboard-stats"],
    queryFn: portalAPI.getDashboardStats,
  });

  const statsConfig = [
    {
      title: t('dashboard.total_cases'),
      value: stats?.totalCases || 0,
      icon: Briefcase,
      color: "text-blue-500",
      link: "/portal/my-cases",
    },
    {
      title: t('dashboard.active_cases'),
      value: stats?.activeCases || 0,
      icon: CheckCircle,
      color: "text-green-500",
      link: "/portal/my-cases",
    },
    {
      title: t('dashboard.pending_intake'),
      value: stats?.pendingIntake || 0,
      icon: FileText,
      color: "text-orange-500",
      link: "/portal/my-requests",
    },
    {
      title: t('dashboard.upcoming_appointments'),
      value: stats?.upcomingAppointments || 0,
      icon: Calendar,
      color: "text-purple-500",
      link: "/portal/my-appointments",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.welcome_message')}</h1>
        <p className="text-muted-foreground mt-2">{t('portal.title')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsConfig.map((stat, i) => (
          <Link key={i} href={stat.link}>
            <Card className="cursor-pointer hover:border-primary transition-colors" data-testid={`stat-card-${i}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold" data-testid={`stat-value-${i}`}>{stat.value}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.new_request')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Submit a new legal aid request or inquiry.
            </p>
            <Link href="/portal/new-request">
              <Button className="w-full">{t('portal.new_request')}</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('portal.book_appointment')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Schedule a consultation with our legal experts.
            </p>
            <Link href="/portal/book-appointment">
              <Button className="w-full" variant="outline">{t('portal.book_appointment')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
