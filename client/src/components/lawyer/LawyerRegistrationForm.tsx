import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { uploadsAPI, usersAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

type UploadMeta = {
  storageKey: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

const PROFESSIONAL_SPECIALTIES = [
  "تجاري",
  "جنائي",
  "عمالي",
  "أحوال شخصية",
  "حقوقي",
  "تنفيذ / إيقاف خدمات",
  "شركات ناشئة",
  "مروري",
  "تقسيم تركات",
  "أخطاء طبية",
  "قضاء إداري",
  "عقاري",
  "نصب واحتيال",
  "أخرى",
  "عامة",
] as const;

const SERVICE_SCOPES = ["استشارات قانونية", "خدمات قانونية", "كلاهما"] as const;
const DEGREE_LEVELS = ["بكالوريوس", "ماجستير", "دكتوراه"] as const;
const ACADEMIC_MAJORS = ["حقوق", "أنظمة", "قانون", "شريعة"] as const;

const buildCreateLawyerSchema = (t: (key: string, options?: any) => string) =>
  z
    .object({
      fullName: z.string().min(1, t("lawyer_register.errors.required", { defaultValue: "مطلوب" })),
      email: z
        .string()
        .email(t("lawyer_register.errors.email", { defaultValue: "بريد إلكتروني غير صالح" })),
      username: z.string().min(1, t("lawyer_register.errors.required", { defaultValue: "مطلوب" })),
      password: z.string().min(8, t("lawyer_register.errors.passwordMin", { defaultValue: "كلمة المرور قصيرة" })),
      confirmPassword: z
        .string()
        .min(8, t("lawyer_register.errors.passwordMin", { defaultValue: "كلمة المرور قصيرة" })),
      isActive: z.boolean().default(true),

      professionalSpecialties: z.preprocess(
        (val) => (val === "" || val == null ? undefined : val),
        z.enum(PROFESSIONAL_SPECIALTIES).optional(),
      ),
      yearsOfExperience: z.preprocess(
        (val) => (val === "" || val == null ? undefined : Number(val)),
        z
          .number()
          .int(t("lawyer_register.errors.number", { defaultValue: "قيمة غير صالحة" }))
          .min(0, t("lawyer_register.errors.min", { defaultValue: "قيمة غير صالحة" }))
          .max(80, t("lawyer_register.errors.max", { defaultValue: "قيمة غير صالحة" }))
          .optional(),
      ),
      serviceScope: z.preprocess(
        (val) => (val === "" || val == null ? undefined : val),
        z.enum(SERVICE_SCOPES).optional(),
      ),
      volunteeringReady: z.boolean().default(false),
      lawLicenseAttachment: z.string().trim().min(1, t("lawyer_register.errors.required", { defaultValue: "مطلوب" })),
      cvAttachment: z.string().trim().min(1, t("lawyer_register.errors.required", { defaultValue: "مطلوب" })),
      degreeLevel: z.preprocess(
        (val) => (val === "" || val == null ? undefined : val),
        z.enum(DEGREE_LEVELS).optional(),
      ),
      academicMajor: z.preprocess(
        (val) => (val === "" || val == null ? undefined : val),
        z.enum(ACADEMIC_MAJORS).optional(),
      ),
      bankName: z.string().trim().optional().or(z.literal("")),
      iban: z
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((v) => !v || v.length >= 10, {
          message: t("lawyer_register.errors.iban", { defaultValue: "رقم الآيبان غير صالح" }),
        }),
      declarationAccepted: z.boolean(),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: t("lawyer_register.errors.passwordMismatch", { defaultValue: "كلمتا المرور غير متطابقتين" }),
        });
      }

      if (!data.volunteeringReady) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["volunteeringReady"],
          message: t("lawyer_register.errors.volunteeringRequired", { defaultValue: "مطلوب" }),
        });
      }

      if (!data.declarationAccepted) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["declarationAccepted"],
          message: t("lawyer_register.errors.declarationRequired", { defaultValue: "يجب الموافقة على الإقرار" }),
        });
      }
    });

type CreateLawyerValues = z.infer<ReturnType<typeof buildCreateLawyerSchema>>;

export type LawyerRegistrationMode = "admin" | "self";

type Props = {
  mode: LawyerRegistrationMode;
  onDone?: () => void;
};

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err: any = new Error((data && (data.message || data.error)) || "Request failed");
    err.response = { status: res.status, data };
    throw err;
  }
  return data as T;
}

export default function LawyerRegistrationForm({ mode, onDone }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const schema = useMemo(() => buildCreateLawyerSchema(t), [t]);

  const [lawLicenseUpload, setLawLicenseUpload] = useState<UploadMeta | null>(null);
  const [cvUpload, setCvUpload] = useState<UploadMeta | null>(null);
  const [lawLicenseUploading, setLawLicenseUploading] = useState(false);
  const [cvUploading, setCvUploading] = useState(false);
  const [selfSubmitted, setSelfSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateLawyerValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      isActive: mode === "self" ? false : true,

      professionalSpecialties: undefined,
      yearsOfExperience: undefined,
      serviceScope: undefined,
      volunteeringReady: false,
      lawLicenseAttachment: "",
      cvAttachment: "",
      degreeLevel: undefined,
      academicMajor: undefined,
      bankName: "",
      iban: "",
      declarationAccepted: false,
    },
    mode: "onTouched",
  });

  const [lawLicenseAttachment, cvAttachment, volunteeringReady, declarationAccepted] = useWatch({
    control: form.control,
    name: ["lawLicenseAttachment", "cvAttachment", "volunteeringReady", "declarationAccepted"],
  }) as [string, string, boolean, boolean];

  const canSubmit =
    !submitting &&
    !lawLicenseUploading &&
    !cvUploading &&
    Boolean(lawLicenseAttachment) &&
    Boolean(cvAttachment) &&
    Boolean(volunteeringReady) &&
    Boolean(declarationAccepted);

  const uploadToField = async (field: "lawLicenseAttachment" | "cvAttachment", file: File) => {
    if (field === "lawLicenseAttachment") {
      setLawLicenseUploading(true);
      setLawLicenseUpload(null);
    } else {
      setCvUploading(true);
      setCvUpload(null);
    }

    try {
      const meta = (await uploadsAPI.upload(file)) as UploadMeta;
      form.setValue(field, meta.storageKey, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      if (field === "lawLicenseAttachment") setLawLicenseUpload(meta);
      else setCvUpload(meta);
    } catch (err: any) {
      form.setValue(field, "", { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("lawyer_register.upload.error", { defaultValue: "فشل الرفع" }),
        variant: "destructive",
      });
    } finally {
      if (field === "lawLicenseAttachment") setLawLicenseUploading(false);
      else setCvUploading(false);
    }
  };

  const handleSubmit = async (values: CreateLawyerValues) => {
    setSubmitting(true);

    const basePayload = {
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      username: values.username.trim(),
      password: values.password,

      isActive: mode === "self" ? false : values.isActive,

      professionalSpecialties: values.professionalSpecialties,
      yearsOfExperience: values.yearsOfExperience,
      serviceScope: values.serviceScope,
      volunteeringReady: values.volunteeringReady,
      lawLicenseAttachment: values.lawLicenseAttachment || "",
      cvAttachment: values.cvAttachment || "",
      degreeLevel: values.degreeLevel,
      academicMajor: values.academicMajor,
      bankName: values.bankName || "",
      iban: values.iban || "",
      declarationAccepted: values.declarationAccepted,
    };

    try {
      if (mode === "admin") {
        await usersAPI.create(basePayload as any);
        await queryClient.invalidateQueries({ queryKey: ["users"] });
        toast({ title: t("common.success"), description: t("lawyers.add_success") });
        form.reset();
        setLawLicenseUpload(null);
        setCvUpload(null);
        onDone?.();
      } else {
        await postJson("/api/auth/register-lawyer", {
          ...basePayload,
          confirmPassword: values.confirmPassword,
        });
        setSelfSubmitted(true);
        toast({
          title: t("common.success"),
          description: t("lawyer_register.pendingApproval", {
            defaultValue: "تم استلام طلبك، حسابك تحت المراجعة وسيتم تفعيله بعد الاعتماد.",
          }),
        });
      }
    } catch (err: any) {
      toast({
        title: mode === "admin" ? t("lawyers.add_failed") : t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "self" && selfSubmitted) {
    return (
      <div className="rounded-lg border p-4 text-sm">
        {t("lawyer_register.pendingApproval", {
          defaultValue: "تم استلام طلبك، حسابك تحت المراجعة وسيتم تفعيله بعد الاعتماد.",
        })}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="pt-1 font-semibold">
          {t("lawyer_register.sections.professional", { defaultValue: "البيانات المهنية" })}
        </div>

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("lawyers.full_name")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("lawyers.email")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("lawyers.username")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="professionalSpecialties"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("lawyer_register.professionalSpecialties.label", {
                    defaultValue: "التخصصات المهنية",
                  })}
                </FormLabel>
                <FormControl>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("lawyer_register.select.placeholder", {
                          defaultValue: "اختر",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFESSIONAL_SPECIALTIES.map((opt) => {
                        const key =
                          opt === "تنفيذ / إيقاف خدمات"
                            ? "enforcement"
                            : opt === "أحوال شخصية"
                              ? "family"
                              : opt === "شركات ناشئة"
                                ? "startups"
                                : opt === "تقسيم تركات"
                                  ? "inheritance"
                                  : opt === "أخطاء طبية"
                                    ? "medical"
                                    : opt === "قضاء إداري"
                                      ? "administrative"
                                      : opt === "نصب واحتيال"
                                        ? "fraud"
                                        : opt === "أخرى"
                                          ? "other"
                                          : opt === "عامة"
                                            ? "general"
                                            : opt === "تجاري"
                                              ? "commercial"
                                              : opt === "جنائي"
                                                ? "criminal"
                                                : opt === "عمالي"
                                                  ? "labor"
                                                  : opt === "حقوقي"
                                                    ? "rights"
                                                    : opt === "مروري"
                                                      ? "traffic"
                                                      : opt === "عقاري"
                                                        ? "realestate"
                                                        : "unknown";

                        return (
                          <SelectItem key={opt} value={opt}>
                            {t(`lawyer_register.specialties.${key}`, { defaultValue: opt })}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="yearsOfExperience"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("lawyer_register.yearsOfExperience.label", { defaultValue: "عدد سنوات الخبرة" })}
                </FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={80} step={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="serviceScope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("lawyer_register.serviceScope.label", { defaultValue: "مجال تقديم الخدمة" })}</FormLabel>
              <FormControl>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("lawyer_register.select.placeholder", { defaultValue: "اختر" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_SCOPES.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="volunteeringReady"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">
                  {t("lawyer_register.volunteeringReady.label", { defaultValue: "الاستعداد للعمل التطوعي" })}
                </div>
              </div>
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-1 font-semibold">
          {t("lawyer_register.sections.academic", { defaultValue: "البيانات الأكاديمية" })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="degreeLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyer_register.degreeLevel.label", { defaultValue: "المؤهل الدراسي" })}</FormLabel>
                <FormControl>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("lawyer_register.select.placeholder", { defaultValue: "اختر" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {DEGREE_LEVELS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="academicMajor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyer_register.academicMajor.label", { defaultValue: "التخصص الأكاديمي" })}</FormLabel>
                <FormControl>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("lawyer_register.select.placeholder", { defaultValue: "اختر" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMIC_MAJORS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="pt-1 font-semibold">
          {t("lawyer_register.sections.financial", { defaultValue: "البيانات المالية" })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyer_register.bankName.label", { defaultValue: "نوع البنك" })}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="iban"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyer_register.iban.label", { defaultValue: "رقم الآيبان" })}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="lawLicenseAttachment"
          render={() => (
            <FormItem>
              <FormLabel>
                {t("lawyer_register.lawLicenseAttachment.label", { defaultValue: "إرفاق ترخيص المحامي" })}
              </FormLabel>
              <FormControl>
                <Input
                  type="file"
                  accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadToField("lawLicenseAttachment", file);
                  }}
                />
              </FormControl>
              <div className="text-sm text-muted-foreground">
                {lawLicenseUploading
                  ? t("lawyer_register.upload.status.uploading", { defaultValue: "جاري الرفع…" })
                  : lawLicenseUpload
                    ? t("lawyer_register.upload.status.uploaded", { defaultValue: "تم الرفع" })
                    : t("lawyer_register.upload.status.notUploaded", { defaultValue: "لم يتم الرفع" })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cvAttachment"
          render={() => (
            <FormItem>
              <FormLabel>{t("lawyer_register.cvAttachment.label", { defaultValue: "إرفاق السيرة الذاتية" })}</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadToField("cvAttachment", file);
                  }}
                />
              </FormControl>
              <div className="text-sm text-muted-foreground">
                {cvUploading
                  ? t("lawyer_register.upload.status.uploading", { defaultValue: "جاري الرفع…" })
                  : cvUpload
                    ? t("lawyer_register.upload.status.uploaded", { defaultValue: "تم الرفع" })
                    : t("lawyer_register.upload.status.notUploaded", { defaultValue: "لم يتم الرفع" })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-1 font-semibold">
          {t("lawyer_register.sections.declaration", { defaultValue: "الإقرار" })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyers.password")}</FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("lawyers.confirm_password")}</FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {mode === "admin" && (
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{t("lawyers.status")}</div>
                  <div className="text-sm text-muted-foreground">{t("lawyers.status_help")}</div>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="declarationAccepted"
          render={({ field }) => (
            <FormItem className="rounded-md border p-3 space-y-3">
              <div className="text-sm leading-relaxed">
                {t("lawyer_register.declaration.text", {
                  defaultValue:
                    "أقرّ بعدم وجود أي تعارض مصالح قد يؤثر على عملي أو تعاوني مع الجمعية، وأتعهد بالالتزام بجميع سياسات وأنظمة الجمعية المعمول بها.\nكما أتعهد بالحفاظ التام على سرية جميع المعلومات والبيانات والوثائق التي أطلع عليها بحكم عملي أو تعاوني مع الجمعية، وعدم إفشائها لأي طرف ثالث، سواء أثناء فترة التعاون أو بعدها، إلا بما يقتضيه النظام أو بموافقة خطية من الجمعية.\nوألتزم بعدم التواصل المباشر مع المستفيدات بأي وسيلة كانت (هاتفيًا، كتابيًا أو حضوريًا)، ويكون التواصل حصرًا من خلال الجمعية أو بموافقة مسبقة منها.\nوأقرّ بأنني أتحمل كامل المسؤولية النظامية في حال الإخلال بما ورد في هذا الإقرار.",
                })}
              </div>
              <div className="flex items-start gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                </FormControl>
                <div className="text-sm">{t("lawyer_register.declaration.accept", { defaultValue: "أوافق على الإقرار" })}</div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-end gap-2">
          {mode === "admin" && (
            <Button type="button" variant="outline" onClick={() => onDone?.()}>
              {t("common.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
