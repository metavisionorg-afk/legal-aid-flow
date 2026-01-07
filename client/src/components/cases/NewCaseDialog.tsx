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
    beneficiaryId: z.string().min(1, "Beneficiary is required"),
    caseType: z.enum(caseTypes, { required_error: "Case type is required" }),
    description: z.string().optional().nullable(),

    // Step 2
    issueSummary: z.string().min(1, "Issue summary is required"),
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

const steps: Array<{ key: StepKey; label: string }> = [
  { key: "basic", label: "Basic" },
  { key: "legal", label: "Legal" },
  { key: "docs", label: "Documents" },
  { key: "review", label: "Review" },
];

function Stepper({ current }: { current: number }) {
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

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const { data: beneficiaries, isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
    enabled: open,
  });

  const schema = useMemo(() => formSchema, []);

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
        beneficiaryId: values.beneficiaryId,
        caseType: values.caseType,
        description: values.description?.trim() ? values.description.trim() : "",
        status: "open",
        priority: "medium",
      });

      await caseDetailsAPI.upsertForCase(String(created.id), {
        issueSummary: values.issueSummary,
        issueDetails: values.issueDetails?.trim() ? values.issueDetails.trim() : undefined,
        urgency: values.urgency,
        urgencyDate: values.urgencyDate ? new Date(values.urgencyDate).toISOString() : undefined,
        jurisdiction: values.jurisdiction?.trim() ? values.jurisdiction.trim() : undefined,
        relatedLaws: values.relatedLaws?.trim() ? values.relatedLaws.trim() : undefined,
      });

      for (const doc of values.documents || []) {
        const meta = await uploadsAPI.upload(doc.file);
        await casesAPI.uploadDocuments(String(created.id), {
          isPublic: doc.isPublic,
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
      toast({ title: t("cases.created") });
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

  const stepFields: Array<Array<keyof FormValues>> = [
    ["caseNumber", "title", "beneficiaryId", "caseType"],
    ["issueSummary", "urgency", "urgencyDate"],
    [],
    ["acknowledge"],
  ];

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
      isPublic: Boolean(draft?.isPublic),
    });

    form.setValue("documentDraft", { file: null, documentType: "", isPublic: false });
  };

  const closeAndReset = () => {
    setOpen(false);
    setStep(0);
    form.reset();
  };

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

        <Stepper current={step} />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => submitMutation.mutate(values))}
            className="space-y-6"
          >
            {step === 0 ? (
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

                <FormField
                  control={form.control}
                  name="beneficiaryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("consultations.beneficiary")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
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
                          <SelectItem value="civil">Civil</SelectItem>
                          <SelectItem value="criminal">Criminal</SelectItem>
                          <SelectItem value="family">Family/Personal Status</SelectItem>
                          <SelectItem value="labor">Labor</SelectItem>
                          <SelectItem value="asylum">Asylum/Refugee</SelectItem>
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

            {step === 1 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="issueSummary"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Issue summary</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Summarize the issue"
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
                      <FormLabel>Issue details</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="Additional details"
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
                      <FormLabel>Urgent</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <ToggleSwitch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-urgency"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground">
                          {field.value ? "Yes" : "No"}
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
                      <FormLabel>Urgency date</FormLabel>
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
                      <FormLabel>Jurisdiction</FormLabel>
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
                      <FormLabel>Related laws</FormLabel>
                      <FormControl>
                        <Textarea
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          placeholder="e.g., Labor Law Article ..."
                          data-testid="textarea-related-laws"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-4">
                  <div className="text-sm font-medium">Add document</div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="documentDraft.file"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>File</FormLabel>
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
                          <FormLabel>Document type</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="documentDraft.isPublic"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Visible to beneficiary (public)</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <ToggleSwitch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-doc-draft-public"
                              />
                            </FormControl>
                            <span className="text-sm text-muted-foreground">
                              {field.value ? "Public" : "Private"}
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <Button type="button" variant="outline" onClick={addDraftDocument} data-testid="button-doc-draft-add">
                      Add
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Documents</div>
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
                                {file?.name || "Document"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {type || "-"} • {isPublic ? "Public" : "Private"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => documents.remove(idx)}
                              data-testid="button-doc-remove"
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No documents added yet.</div>
                  )}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-3" data-testid="review-summary">
                  <div className="text-sm font-medium">Summary</div>
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
                          <div className="text-muted-foreground">Case number</div>
                          <div className="font-medium">{form.getValues("caseNumber")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Title</div>
                          <div className="font-medium">{form.getValues("title")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Beneficiary</div>
                          <div className="font-medium">
                            {beneficiary ? `${beneficiary.fullName} (${beneficiary.idNumber})` : beneficiaryId}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Case type</div>
                          <div className="font-medium">{form.getValues("caseType")}</div>
                        </div>

                        {description?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">Description</div>
                            <div className="font-medium whitespace-pre-wrap">{description}</div>
                          </div>
                        ) : null}

                        <div className="md:col-span-2">
                          <div className="text-muted-foreground">Issue summary</div>
                          <div className="font-medium whitespace-pre-wrap">{form.getValues("issueSummary")}</div>
                        </div>

                        {issueDetails?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">Issue details</div>
                            <div className="font-medium whitespace-pre-wrap">{issueDetails}</div>
                          </div>
                        ) : null}

                        <div>
                          <div className="text-muted-foreground">Urgency</div>
                          <div className="font-medium">{urgency ? "Urgent" : "Not urgent"}</div>
                        </div>
                        {urgencyDate ? (
                          <div>
                            <div className="text-muted-foreground">Urgency date</div>
                            <div className="font-medium">{String(urgencyDate)}</div>
                          </div>
                        ) : (
                          <div />
                        )}

                        {jurisdiction?.trim() ? (
                          <div>
                            <div className="text-muted-foreground">Jurisdiction</div>
                            <div className="font-medium">{jurisdiction}</div>
                          </div>
                        ) : (
                          <div />
                        )}

                        {relatedLaws?.trim() ? (
                          <div className="md:col-span-2">
                            <div className="text-muted-foreground">Related laws</div>
                            <div className="font-medium whitespace-pre-wrap">{relatedLaws}</div>
                          </div>
                        ) : null}

                        <div className="md:col-span-2">
                          <div className="text-muted-foreground">Documents</div>
                          {documents.fields.length ? (
                            <div className="space-y-2 mt-1">
                              {documents.fields.map((d, idx) => {
                                const file = form.getValues(`documents.${idx}.file` as any) as any;
                                const type = form.getValues(`documents.${idx}.documentType` as any) as any;
                                const isPublic = form.getValues(`documents.${idx}.isPublic` as any) as any;
                                return (
                                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{file?.name || "Document"}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {type || "-"} • {isPublic ? "Public" : "Private"}
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
                          <FormLabel className="leading-5">I confirm the information is correct</FormLabel>
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
                {step === 0 ? t("common.cancel") : "Back"}
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={goNext} data-testid="button-step-next">
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={submitMutation.isPending} data-testid="button-step-submit">
                  {submitMutation.isPending ? t("common.loading") : "Create case"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
