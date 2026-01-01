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

export default function Dashboard() {
  const { t } = useTranslation();

  const stats = [
    {
      title: t('dashboard.total_cases'),
      value: "1,248",
      change: "+12%",
      trend: "up",
      icon: Briefcase,
      color: "text-blue-500",
    },
    {
      title: t('dashboard.active_cases'),
      value: "432",
      change: "+4%",
      trend: "up",
      icon: FileText,
      color: "text-green-500",
    },
    {
      title: t('dashboard.pending_intake'),
      value: "24",
      change: "-2%",
      trend: "down",
      icon: Users,
      color: "text-orange-500",
    },
    {
      title: t('dashboard.upcoming_hearings'),
      value: "12",
      change: "Today",
      trend: "neutral",
      icon: CalendarDays,
      color: "text-purple-500",
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                {stat.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1 rtl:ml-1 rtl:mr-0" />
                ) : stat.trend === "down" ? (
                  <ArrowDownRight className="h-3 w-3 text-red-500 mr-1 rtl:ml-1 rtl:mr-0" />
                ) : null}
                <span className={stat.trend === "up" ? "text-green-500" : stat.trend === "down" ? "text-red-500" : ""}>
                  {stat.change}
                </span>
                <span className="ml-1 rtl:mr-1">from last month</span>
              </p>
            </CardContent>
          </Card>
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
    </Layout>
  );
}
