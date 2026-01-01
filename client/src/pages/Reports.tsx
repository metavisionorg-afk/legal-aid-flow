import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Reports() {
  const { t } = useTranslation();

  const caseTypeData = [
    { name: 'Civil', value: 400 },
    { name: 'Criminal', value: 300 },
    { name: 'Family', value: 300 },
    { name: 'Labor', value: 200 },
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const monthlyData = [
    { name: 'Jan', open: 40, closed: 24 },
    { name: 'Feb', open: 30, closed: 13 },
    { name: 'Mar', open: 20, closed: 98 },
    { name: 'Apr', open: 27, closed: 39 },
    { name: 'May', open: 18, closed: 48 },
  ];

  return (
    <Layout>
      <h1 className="text-3xl font-bold tracking-tight">{t('app.reports')}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('reports.case_distribution_title')}</CardTitle>
            <CardDescription>{t('reports.case_distribution_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={caseTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {caseTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              {caseTypeData.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-sm text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('reports.velocity_title')}</CardTitle>
            <CardDescription>{t('reports.velocity_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="open" fill="#0088FE" radius={[4, 4, 0, 0]} name={t('reports.opened')} />
                <Bar dataKey="closed" fill="#00C49F" radius={[4, 4, 0, 0]} name={t('reports.closed')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
