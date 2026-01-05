import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useToast } from "@/hooks/use-toast";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";

const SERVICE_TYPES = [
  "legal_consultation",
  "case_filing",
  "contract_review",
  "representation",
  "mediation",
  "other",
] as const;

type ServiceType = (typeof SERVICE_TYPES)[number];

type FormValues = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  city: string;
  preferredLanguage: "ar" | "en";
  serviceType: ServiceType;
  details?: string;
  nationalId?: string;
  address?: string;
};

export default function BeneficiaryRegister() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refresh } = useAuth();

  const schema = useMemo(() => {
    const passwordStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    return z
      .object({
        fullName: z.string().min(1, t("beneficiary_register.validation.full_name_required")),
        email: z.string().email(t("beneficiary_register.validation.email_invalid")),
        password: z
          .string()
          .min(8, t("beneficiary_register.validation.password_min"))
          .regex(passwordStrong, t("beneficiary_register.validation.password_strong")),
        confirmPassword: z.string().min(8, t("beneficiary_register.validation.password_min")),
        phone: z.string().min(1, t("beneficiary_register.validation.phone_required")),
        city: z.string().min(1, t("beneficiary_register.validation.city_required")),
        preferredLanguage: z.enum(["ar", "en"], {
          required_error: t("beneficiary_register.validation.language_required"),
        }),
        serviceType: z.enum(SERVICE_TYPES, {
          required_error: t("beneficiary_register.validation.service_required"),
        }),
        details: z.string().optional(),
        nationalId: z.string().optional(),
        address: z.string().optional(),
      })
      .superRefine((data, ctx) => {
        if (data.password !== data.confirmPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["confirmPassword"],
            message: t("beneficiary_register.validation.password_mismatch"),
          });
        }
      });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      city: "",
      preferredLanguage: "ar",
      serviceType: "legal_consultation",
      details: "",
      nationalId: "",
      address: "",
    },
    mode: "onTouched",
  });

  const registerMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return authAPI.registerBeneficiary({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone,
        city: values.city,
        preferredLanguage: values.preferredLanguage,
        serviceType: values.serviceType,
        details: values.details?.trim() ? values.details.trim() : undefined,
        nationalId: values.nationalId?.trim() ? values.nationalId.trim() : undefined,
        address: values.address?.trim() ? values.address.trim() : undefined,
      });
    },
    onSuccess: async () => {
      await refresh();
      toast({
        title: t("common.success"),
        description: t("beneficiary_register.success"),
      });
      setLocation("/beneficiary/portal");
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("beneficiary_register.error"),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4 relative">
      <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto">
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 bg-primary rounded-lg mx-auto mb-4 flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-2xl">A</span>
          </div>
          <CardTitle className="text-2xl font-bold">{t("beneficiary_register.title")}</CardTitle>
          <CardDescription>{t("beneficiary_register.subtitle")}</CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => registerMutation.mutate(values))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.full_name")}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="name" />
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
                    <FormLabel>{t("beneficiary_register.email")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" autoComplete="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("beneficiary_register.password")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" autoComplete="new-password" />
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
                      <FormLabel>{t("beneficiary_register.confirm_password")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" autoComplete="new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.phone")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" autoComplete="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.city")}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="address-level2" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.preferred_language")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("beneficiary_register.select_language")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ar">{t("beneficiary_register.language_ar")}</SelectItem>
                        <SelectItem value="en">{t("beneficiary_register.language_en")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.service_type")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("beneficiary_register.select_service")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SERVICE_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`service_types.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nationalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("beneficiary_register.national_id")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("beneficiary_register.address")}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="street-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="details"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("beneficiary_register.details")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending
                  ? t("common.loading")
                  : t("beneficiary_register.submit")}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {t("beneficiary_register.have_account")} {" "}
                <a href="/portal/login" className="text-primary hover:underline">
                  {t("app.sign_in")}
                </a>
              </p>
            </form>
          </Form>
        </CardContent>

        <CardFooter className="justify-center">
          <div className="sr-only">
            <Label>{t("beneficiary_register.title")}</Label>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
