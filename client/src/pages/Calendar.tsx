import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { hearingsAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());

  const { data: hearings, isLoading } = useQuery({
    queryKey: ["hearings"],
    queryFn: hearingsAPI.getAll,
  });

  return (
    <Layout>
      <h1 className="text-3xl font-bold tracking-tight">{t('app.calendar')}</h1>
      
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>{t('app.calendar')}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <CalendarComponent
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>{t('calendar.upcoming_events')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : hearings && hearings.length > 0 ? (
                hearings.map((hearing: any) => (
                  <div key={hearing.id} className="flex items-center p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive">
                          {t('calendar.hearing')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(hearing.scheduledDate), "h:mm a")}
                        </span>
                      </div>
                      <h4 className="font-medium text-sm">{hearing.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(hearing.scheduledDate), "MMMM d, yyyy")}
                      </p>
                      {hearing.location && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📍 {hearing.location}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No upcoming hearings
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
