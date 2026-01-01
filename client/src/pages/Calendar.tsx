import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());

  const events = [
    { date: new Date(), title: "Court Hearing - Case #2023-001", type: "Hearing", time: "09:00 AM" },
    { date: new Date(), title: "Client Meeting - Ahmed Salem", type: "Meeting", time: "11:30 AM" },
    { date: new Date(new Date().setDate(new Date().getDate() + 2)), title: "Document Submission Deadline", type: "Deadline", time: "02:00 PM" },
  ];

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
              {events.map((event, i) => (
                <div key={i} className="flex items-center p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={event.type === "Hearing" ? "destructive" : "secondary"}>
                        {event.type === "Hearing" ? t('calendar.hearing') : 
                         event.type === "Meeting" ? t('calendar.meeting') : 
                         t('calendar.deadline')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{event.time}</span>
                    </div>
                    <h4 className="font-medium text-sm">{event.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.date.toLocaleDateString()}
                    </p>
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
