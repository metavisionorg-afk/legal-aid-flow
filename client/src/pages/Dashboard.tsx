import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  Briefcase, 
  FileText, 
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { useQuery } from "@tanstack/react-query";
import { enhancedDashboardAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, CheckSquare } from "lucide-react";
import { UnifiedMonthlyCalendar } from "@/components/calendar/UnifiedMonthlyCalendar";

export default function Dashboard() {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["enhanced-dashboard-stats"],
    queryFn: enhancedDashboardAPI.getStats,
  });

  const statsConfig = [
    {
      title: t('dashboard.total_cases'),
      value: stats?.totalCases || 0,
      icon: Briefcase,
      color: "text-blue-500",
      link: "/cases",
    },
    {
      title: t('dashboard.active_cases'),
      value: stats?.activeCases || 0,
      icon: FileText,
      color: "text-green-500",
      link: "/cases",
    },
    {
      title: t('dashboard.pending_tasks'),
      value: stats?.pendingTasks || 0,
      icon: CheckSquare,
      color: "text-orange-500",
      link: "/tasks",
    },
    {
      title: t('dashboard.total_beneficiaries'),
      value: stats?.totalBeneficiaries || 0,
      icon: Users,
      color: "text-purple-500",
      link: "/beneficiaries",
    },
    {
      title: t('dashboard.pending_intake'),
      value: stats?.pendingIntake || 0,
      icon: Users,
      color: "text-yellow-500",
      link: "/intake",
    },
    {
      title: t('dashboard.upcoming_hearings'),
      value: stats?.upcomingHearings || 0,
      icon: CalendarDays,
      color: "text-indigo-500",
      link: "/hearings",
    },
  ];

  const data = [
    { name: 'Jan', cases: 40 },
    { name: 'Feb', cases: 30 },
    { name: 'Mar', cases: 20 },
    { name: 'Apr', cases: 27 },
    { name: 'May', cases: 18 },
    { name: 'Jun', cases: 23 },
    { name: 'Jul', cases: 34 },
  ];

  return (
    <Layout>
      {/* Quick Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Link href="/intake">
          <Button variant="default" size="sm" data-testid="button-new-intake">
            <Plus className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('dashboard.new_intake')}
          </Button>
        </Link>
        <Link href="/cases">
          <Button variant="outline" size="sm" data-testid="button-new-case">
            <Plus className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('dashboard.new_case')}
          </Button>
        </Link>
        <Link href="/tasks">
          <Button variant="outline" size="sm" data-testid="button-new-task">
            <Plus className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('dashboard.new_task')}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statsConfig.map((stat, i) => (
          <Link key={i} href={stat.link}>
            <Card className="cursor-pointer hover:bg-accent transition-colors" data-testid={`stat-card-${i}`}>
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

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>{t('dashboard.case_distribution')}</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}`} 
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="cases" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{t('dashboard.recent_activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[1, 2, 3, 4, 5].map((_, i) => (
                <div key={i} className="flex items-center">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center border">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="ml-4 rtl:mr-4 rtl:ml-0 space-y-1">
                    <p className="text-sm font-medium leading-none">New beneficiary added</p>
                    <p className="text-xs text-muted-foreground">
                      Ahmed Salem • 2 hours ago
                    </p>
                  </div>
                  <div className="ml-auto rtl:mr-auto rtl:ml-0 font-medium text-xs text-muted-foreground">
                    +Details
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("calendar.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UnifiedMonthlyCalendar scope="admin" embedded />
        </CardContent>
      </Card>
    </Layout>
  );
}
