import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, Mail, Phone, MapPin, Clock, CheckCircle, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

import { supportAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

type TicketCategory = "general" | "case_inquiry" | "document_request" | "technical" | "complaint" | "other";

export default function PortalSupport() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [ticketForm, setTicketForm] = useState({
    category: "" as TicketCategory | "",
    subject: "",
    message: "",
  });

  const [submitted, setSubmitted] = useState(false);

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: (data: { category: string; subject: string; message: string }) =>
      supportAPI.createTicket(data),
    onSuccess: () => {
      setSubmitted(true);
      setTicketForm({ category: "", subject: "", message: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/my"] });
      toast({
        title: t("portal_support.submit_success"),
        description: t("portal_support.submit_success_message"),
      });
    },
    onError: (error) => {
      toast({
        title: t("portal_support.submit_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!ticketForm.category || !ticketForm.subject.trim() || !ticketForm.message.trim()) {
      toast({
        title: t("portal_support.validation_error"),
        description: t("portal_support.validation_error_message"),
        variant: "destructive",
      });
      return;
    }

    createTicketMutation.mutate({
      category: ticketForm.category,
      subject: ticketForm.subject.trim(),
      message: ticketForm.message.trim(),
    });
  };

  const handleNewTicket = () => {
    setSubmitted(false);
    setTicketForm({ category: "", subject: "", message: "" });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="h-8 w-8" />
          {t("portal_support.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("portal_support.subtitle")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Contact Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t("portal_support.form_title")}</CardTitle>
            <CardDescription>
              {t("portal_support.form_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-6">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {t("portal_support.success_message")}
                  </AlertDescription>
                </Alert>

                <div className="p-6 bg-muted rounded-lg space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t("portal_support.what_next")}
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{t("portal_support.next_step_1")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{t("portal_support.next_step_2")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{t("portal_support.next_step_3")}</span>
                    </li>
                  </ul>
                </div>

                <Button onClick={handleNewTicket} className="w-full">
                  {t("portal_support.submit_another")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category">{t("portal_support.category_label")} *</Label>
                  <Select
                    value={ticketForm.category}
                    onValueChange={(value) => setTicketForm({ ...ticketForm, category: value as TicketCategory })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("portal_support.category_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">{t("portal_support.category.general")}</SelectItem>
                      <SelectItem value="case_inquiry">{t("portal_support.category.case_inquiry")}</SelectItem>
                      <SelectItem value="document_request">{t("portal_support.category.document_request")}</SelectItem>
                      <SelectItem value="technical">{t("portal_support.category.technical")}</SelectItem>
                      <SelectItem value="complaint">{t("portal_support.category.complaint")}</SelectItem>
                      <SelectItem value="other">{t("portal_support.category.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">{t("portal_support.subject_label")} *</Label>
                  <Input
                    id="subject"
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                    placeholder={t("portal_support.subject_placeholder")}
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t("portal_support.message_label")} *</Label>
                  <Textarea
                    id="message"
                    value={ticketForm.message}
                    onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
                    placeholder={t("portal_support.message_placeholder")}
                    rows={8}
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground">
                    {ticketForm.message.length}/2000 {t("portal_support.characters")}
                  </p>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t("portal_support.privacy_notice")}
                  </AlertDescription>
                </Alert>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createTicketMutation.isPending}
                >
                  {createTicketMutation.isPending ? (
                    t("portal_support.submitting")
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {t("portal_support.submit_button")}
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("portal_support.contact_info")}</CardTitle>
              <CardDescription>
                {t("portal_support.contact_info_description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("portal_support.email")}</p>
                  <p className="text-sm text-muted-foreground">support@adala-legal.org</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("portal_support.phone")}</p>
                  <p className="text-sm text-muted-foreground">+966 11 234 5678</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("portal_support.hours")}</p>
                  <p className="text-sm text-muted-foreground">{t("portal_support.hours_detail")}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("portal_support.address")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("portal_support.address_detail")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {t("portal_support.faq_title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium mb-1">{t("portal_support.faq_1_q")}</p>
                  <p className="text-muted-foreground">{t("portal_support.faq_1_a")}</p>
                </div>
                <div>
                  <p className="font-medium mb-1">{t("portal_support.faq_2_q")}</p>
                  <p className="text-muted-foreground">{t("portal_support.faq_2_a")}</p>
                </div>
                <div>
                  <p className="font-medium mb-1">{t("portal_support.faq_3_q")}</p>
                  <p className="text-muted-foreground">{t("portal_support.faq_3_a")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
