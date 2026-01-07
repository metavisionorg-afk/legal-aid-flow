import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { beneficiariesAPI, caseDetailsAPI, casesAPI, uploadsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/contexts/AuthContext";
import { isBeneficiary } from "@/lib/authz";

const fileSchema = z.custom<File>((value) => value instanceof File, {
  message: "File is required",
});

const caseTypes = ["civil", "criminal", "family", "labor", "asylum"] as const;

type CaseType = (typeof caseTypes)[number];

const formSchema = z
  .object({
    // Step 1
    caseNumber: z.string().min(1, "Case number is required"),
    title: z.string().min(1, "Title is required"),
    beneficiaryId: z.string().optional().nullable(),
    caseType: z.enum(caseTypes, { required_error: "Case type is required" }),
    description: z.string().optional().nullable(),

    // Step 2
    issueSummary: z.string().optional().nullable(),
    issueDetails: z.string().optional().nullable(),
    urgency: z.boolean().default(false),
    urgencyDate: z.string().optional().nullable(),
    jurisdiction: z.string().optional().nullable(),
    relatedLaws: z.string().optional().nullable(),

    // Step 3
    documents: z
      .array(
        z.object({
          file: fileSchema,
          documentType: z.string().min(1, "Document type is required"),
          isPublic: z.boolean().default(false),
        }),
      )
      .default([]),
    documentDraft: z
      .object({
        file: z.any().nullable(),
        documentType: z.string().optional().nullable(),
        isPublic: z.boolean().default(false),
      })
      .default({ file: null, documentType: "", isPublic: false }),

    // Step 4
    acknowledge: z.literal(true, {
      errorMap: () => ({ message: "You must confirm before creating the case" }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.urgency && !data.urgencyDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["urgencyDate"],
        message: "Urgency date is required when urgency is enabled",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type StepKey = "basic" | "legal" | "docs" | "review";

type Step = { key: StepKey; label: string };

function Stepper({ current, steps }: { current: number; steps: Step[] }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((step, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <div key={step.key} className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border",
                isDone ? "bg-primary text-primary-foreground border-primary" : "bg-background",
                isActive && !isDone ? "border-primary" : "border-border",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              {idx + 1}
            </div>
            <div className={cn("text-sm truncate", isActive ? "font-medium" : "text-muted-foreground")}>
              {step.label}
            </div>
            {idx !== steps.length - 1 ? (
              <div className="hidden sm:block h-px w-8 bg-border" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function NewCaseDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isBen = isBeneficiary(user);

  const steps = useMemo<Step[]>(() => {
    if (isBen) {
      return [
        { key: "basic", label: t("cases.new_case.steps.basic") },
        { key: "docs", label: t("cases.new_case.steps.docs") },
        { key: "review", label: t("cases.new_case.steps.review") },
      ];
    }

    return [
      { key: "basic", label: t("cases.new_case.steps.basic") },
      { key: "legal", label: t("cases.new_case.steps.legal") },
      { key: "docs", label: t("cases.new_case.steps.docs") },
      { key: "review", label: t("cases.new_case.steps.review") },
    ];
  }, [t, isBen]);

  const caseTypeLabel = (value: CaseType | string) =>
    t(`cases.case_types.${String(value)}`, { defaultValue: String(value) });

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const { data: beneficiaries, isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
    enabled: open && !isBen,
  });

  const schema = useMemo(
    () =>
      formSchema.superRefine((data, ctx) => {
        if (!isBen) {
          if (!data.beneficiaryId || !String(data.beneficiaryId).trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["beneficiaryId"],
              message: "Beneficiary is required",
            });
          }

          if (!data.issueSummary || !String(data.issueSummary).trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["issueSummary"],
              message: "Issue summary is required",
            });
          }
        }
      }),
    [isBen],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      caseNumber: "",
      title: "",
      beneficiaryId: "",
      caseType: "civil",
      description: "",
      issueSummary: "",
      issueDetails: "",
      urgency: false,
      urgencyDate: null,
      jurisdiction: "",
      relatedLaws: "",
      documents: [],
      documentDraft: { file: null, documentType: "", isPublic: false },
      acknowledge: false as any,
    },
    mode: "onTouched",
  });

  const documents = useFieldArray({
    control: form.control,
    name: "documents",
  });

  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const created = await casesAPI.create({
        caseNumber: values.caseNumber.trim(),
        title: values.title.trim(),
        ...(isBen ? {} : { beneficiaryId: values.beneficiaryId }),
        caseType: values.caseType,
        description: values.description?.trim() ? values.description.trim() : "",
        priority: "medium",
      });

      // Staff can capture extended legal details.
      if (!isBen) {
        await caseDetailsAPI.upsertForCase(String(created.id), {
          issueSummary: values.issueSummary,
          issueDetails: values.issueDetails?.trim() ? values.issueDetails.trim() : undefined,
          urgency: values.urgency,
          urgencyDate: values.urgencyDate ? new Date(values.urgencyDate).toISOString() : undefined,
          jurisdiction: values.jurisdiction?.trim() ? values.jurisdiction.trim() : undefined,
          relatedLaws: values.relatedLaws?.trim() ? values.relatedLaws.trim() : undefined,
        });
      }

      for (const doc of values.documents || []) {
        const meta = await uploadsAPI.upload(doc.file);
        await casesAPI.uploadDocuments(String(created.id), {
          isPublic: isBen ? true : doc.isPublic,
          documents: [
            {
              ...meta,
              category: doc.documentType,
            },
          ],
        });
      }

      return created;
    },
    onSuccess: async (created: any) => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: isBen ? t("cases.submitted") : t("cases.created") });
      setOpen(false);
      setStep(0);
      form.reset();
      setLocation(`/cases/${created.id}`);
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("cases.create_failed"),
        variant: "destructive",
      });
    },
  });

  const stepFields: Array<Array<keyof FormValues>> = isBen
    ? [["caseNumber", "title", "caseType"], [], ["acknowledge"]]
    : [["caseNumber", "title", "beneficiaryId", "caseType"], ["issueSummary", "urgency", "urgencyDate"], [], ["acknowledge"]];

  const goNext = async () => {
    const fields = stepFields[step] || [];
    if (fields.length) {
      const ok = await form.trigger(fields as any, { shouldFocus: true });
      if (!ok) return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const addDraftDocument = () => {
    const draft = form.getValues("documentDraft");
    const file = draft?.file;
    const documentType = (draft?.documentType || "").trim();

    let ok = true;
    if (!(file instanceof File)) {
      form.setError("documentDraft.file" as any, { message: "File is required" });
      ok = false;
    }
    if (!documentType) {
      form.setError("documentDraft.documentType" as any, { message: "Document type is required" });
      ok = false;
    }
    if (!ok) return;

    documents.append({
      file,
      documentType,
      isPublic: isBen ? true : Boolean(draft?.isPublic),
    });

    form.setValue("documentDraft", { file: null, documentType: "", isPublic: false });
  };

  const closeAndReset = () => {
    setOpen(false);
    setStep(0);
    form.reset();
  };

  const stepKey = steps[step]?.key;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeAndReset();
          return;
        }
        setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="button-add-case">
          <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
          {t("app.add_new")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("dashboard.new_case")}</DialogTitle>
        </DialogHeader>

        <Stepper current={step} steps={steps} />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => submitMutation.mutate(values))}
            className="space-y-6"
          >
            {stepKey === "basic" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="caseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cases.case_number")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-case-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cases.case_title")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-case-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isBen ? (
                  <FormField
                    control={form.control}
                    name="beneficiaryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("consultations.beneficiary")}</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-case-beneficiary">
                              <SelectValue
                                placeholder={
                                  beneficiariesLoading
                                    ? t("common.loading")
                                    : t("consultations.select_beneficiary")
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                            {(beneficiaries || []).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.fullName} ({b.idNumber})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name="caseType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("intake.case_type")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-case-type">
                            <SelectValue placeholder={t("intake.case_type")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                          <SelectItem value="civil">{caseTypeLabel("civil")}</SelectItem>
                          <SelectItem value="criminal">{caseTypeLabel("criminal")}</SelectItem>
                          <SelectItem value="family">{caseTypeLabel("family")}</SelectItem>
                          <SelectItem value="labor">{caseTypeLabel("labor")}</SelectItem>
                          <SelectItem value="asylum">{caseTypeLabel("asylum")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("intake.description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={t("intake.description")}
                          data-testid="textarea-case-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {stepKey === "legal" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="issueSummary"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("cases.new_case.issue_summary")}</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={t("cases.new_case.issue_summary_placeholder")}
                          data-testid="textarea-issue-summary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issueDetails"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("cases.new_case.issue_details")}</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={t("cases.new_case.issue_details_placeholder")}
                          data-testid="textarea-issue-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("cases.new_case.urgency")}</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <ToggleSwitch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-urgency"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground">
                          {field.value ? t("cases.new_case.yes") : t("cases.new_case.no")}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="urgencyDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cases.new_case.urgency_date")}</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          data-testid="input-urgency-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jurisdiction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cases.new_case.jurisdiction")}</FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          data-testid="input-jurisdiction"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="relatedLaws"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("cases.new_case.related_laws")}</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder={t("cases.new_case.related_laws_placeholder")}
                          data-testid="textarea-related-laws"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {stepKey === "docs" ? (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-4">
                  <div className="text-sm font-medium">{t("cases.new_case.add_document")}</div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="documentDraft.file"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("cases.new_case.document_file")}</FormLabel>
                          <FormControl>
                            <Input
                              type="file"
                              onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                              data-testid="input-doc-draft-file"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="documentDraft.documentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("cases.new_case.document_type")}</FormLabel>
                          <FormControl>
                            <Input
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              data-testid="input-doc-draft-type"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isBen ? (
                      <FormField
                        control={form.control}
                        name="documentDraft.isPublic"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>{t("cases.new_case.document_visibility")}</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <ToggleSwitch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-doc-draft-public"
                                />
                              </FormControl>
                              <span className="text-sm text-muted-foreground">
                                {field.value ? t("cases.new_case.public") : t("cases.new_case.private")}
                              </span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end">
                    <Button type="button" variant="outline" onClick={addDraftDocument} data-testid="button-doc-draft-add">
                      {t("cases.new_case.add")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{t("cases.new_case.documents")}</div>
                    <Badge variant="secondary">{documents.fields.length}</Badge>
                  </div>

                  {documents.fields.length ? (
                    <div className="space-y-2">
                      {documents.fields.map((d, idx) => {
                        const file = form.getValues(`documents.${idx}.file` as any) as any;
                        const type = form.getValues(`documents.${idx}.documentType` as any) as any;
                        const isPublic = form.getValues(`documents.${idx}.isPublic` as any) as any;
                        return (
                          <div
                            key={d.id}
                            className="flex items-center justify-between gap-3 rounded-md border p-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {file?.name || t("cases.new_case.document")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {type || "-"} • {isBen ? t("cases.new_case.public") : isPublic ? t("cases.new_case.public") : t("cases.new_case.private")}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => documents.remove(idx)}
                              data-testid="button-doc-remove"
                            >
                              {t("cases.new_case.remove")}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{t("cases.new_case.no_documents")}</div>
                  )}
                </div>
              </div>
            ) : null}

            {stepKey === "review" ? (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-3" data-testid="review-summary">
                  <div className="text-sm font-medium">{t("cases.new_case.summary")}</div>
                  {(() => {
                    const beneficiaryId = form.getValues("beneficiaryId");
                    const beneficiary = (beneficiaries || []).find((b: any) => b.id === beneficiaryId);
                    const urgency = form.getValues("urgency");
                    const urgencyDate = form.getValues("urgencyDate");
                    const description = form.getValues("description");
                    const issueDetails = form.getValues("issueDetails");
                    const jurisdiction = form.getValues("jurisdiction");
                    const relatedLaws = form.getValues("relatedLaws");

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">{t("cases.case_number")}</div>
                          <div className="font-medium">{form.getValues("caseNumber")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t("cases.case_title")}</div>
                          <div className="font-medium">{form.getValues("title")}</div>
                        </div>
                        {!isBen ? (
                          <div>
                            <div className="text-muted-foreground">{t("consultations.beneficiary")}</div>
                            <div className="font-medium">
                              {beneficiary ? `${beneficiary.fullName} (${beneficiary.idNumber})` : beneficiaryId}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <div className="text-muted-foreground">{t("intake.case_type")}</div>
                          <div className="font-medium">{caseTypeLabel(form.getValues("caseType"))}</div>
                        </div>

                        {description?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">{t("intake.description")}</div>
                            <div className="font-medium whitespace-pre-wrap">{description}</div>
                          </div>
                        ) : null}

                        {!isBen ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">{t("cases.new_case.issue_summary")}</div>
                            <div className="font-medium whitespace-pre-wrap">{form.getValues("issueSummary")}</div>
                          </div>
                        ) : null}

                        {!isBen && issueDetails?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">{t("cases.new_case.issue_details")}</div>
                            <div className="font-medium whitespace-pre-wrap">{issueDetails}</div>
                          </div>
                        ) : null}

                        {!isBen ? (
                          <>
                            <div>
                              <div className="text-muted-foreground">{t("cases.new_case.urgency")}</div>
                              <div className="font-medium">{urgency ? t("cases.new_case.urgent") : t("cases.new_case.not_urgent")}</div>
                            </div>
                            {urgencyDate ? (
                              <div>
                                <div className="text-muted-foreground">{t("cases.new_case.urgency_date")}</div>
                                <div className="font-medium">{String(urgencyDate)}</div>
                              </div>
                            ) : (
                              <div />
                            )}
                          </>
                        ) : null}

                        {!isBen ? (
                          jurisdiction?.trim() ? (
                            <div>
                              <div className="text-muted-foreground">{t("cases.new_case.jurisdiction")}</div>
                              <div className="font-medium">{jurisdiction}</div>
                            </div>
                          ) : (
                            <div />
                          )
                        ) : null}

                        {!isBen && relatedLaws?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">{t("cases.new_case.related_laws")}</div>
                            <div className="font-medium whitespace-pre-wrap">{relatedLaws}</div>
                          </div>
                        ) : null}

                        <div className="md:col-span-2">
                          <div className="text-muted-foreground">{t("cases.new_case.documents")}</div>
                          {documents.fields.length ? (
                            <div className="space-y-2 mt-1">
                              {documents.fields.map((d, idx) => {
                                const file = form.getValues(`documents.${idx}.file` as any) as any;
                                const type = form.getValues(`documents.${idx}.documentType` as any) as any;
                                const isPublic = form.getValues(`documents.${idx}.isPublic` as any) as any;
                                return (
                                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{file?.name || t("cases.new_case.document")}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {type || "-"} • {isBen ? t("cases.new_case.public") : isPublic ? t("cases.new_case.public") : t("cases.new_case.private")}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="font-medium">0</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <FormField
                  control={form.control}
                  name="acknowledge"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(Boolean(v))}
                            data-testid="checkbox-acknowledge"
                          />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel className="leading-5">{t("cases.new_case.acknowledge")}</FormLabel>
                          <FormMessage />
                        </div>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={step === 0 ? closeAndReset : goBack}
                data-testid="button-step-back"
              >
                {step === 0 ? t("common.cancel") : t("common.back")}
              </Button>

              {step < steps.length - 1 ? (
                <Button type="button" onClick={goNext} data-testid="button-step-next">
                  {t("common.next")}
                </Button>
              ) : (
                <Button type="submit" disabled={submitMutation.isPending} data-testid="button-step-submit">
                  {submitMutation.isPending ? t("common.loading") : t("cases.create")}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
