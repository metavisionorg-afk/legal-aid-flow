import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { useToast } from "@/hooks/use-toast";
import { authAPI, staffBeneficiariesAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

export type BeneficiaryRegistrationMode = "public" | "staff";

export type BeneficiaryRegistrationValues = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  gender?: "male" | "female";
  city: string;
  preferredLanguage: "ar" | "en";
};

export type BeneficiaryRegistrationPayload = any;

export type BeneficiaryRegistrationCardProps = {
  mode: BeneficiaryRegistrationMode;
  onSuccess?: (payload: BeneficiaryRegistrationPayload) => Promise<void> | void;
  onCancel?: () => void;
};

export function BeneficiaryRegistrationCard({ mode, onSuccess, onCancel }: BeneficiaryRegistrationCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const schema = useMemo(() => {
    const passwordStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    return z
      .object({
        fullName: z.string().min(1, t("beneficiary_register.validation.full_name_required")),
        username: z.string().min(3, t("beneficiary_register.validation.username_required")),
        email: z.string().email(t("beneficiary_register.validation.email_invalid")),
        password: z
          .string()
          .min(8, t("beneficiary_register.validation.password_min"))
          .regex(passwordStrong, t("beneficiary_register.validation.password_strong")),
        confirmPassword: z.string().min(8, t("beneficiary_register.validation.password_min")),
        phone: z.string().min(1, t("beneficiary_register.validation.phone_required")),
        gender: z.enum(["male", "female"]).optional(),
        city: z.string().min(1, t("beneficiary_register.validation.city_required")),
        preferredLanguage: z.enum(["ar", "en"], {
          required_error: t("beneficiary_register.validation.language_required"),
        }),
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

  const form = useForm<BeneficiaryRegistrationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      gender: undefined,
      city: "",
      preferredLanguage: "ar",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: BeneficiaryRegistrationValues) => {
      if (mode === "staff") {
        return staffBeneficiariesAPI.create(values);
      }

      // Public registration endpoint currently requires `serviceType`.
      // This form intentionally does not expose it; we send a safe default.
      return authAPI.registerBeneficiary({
        username: values.username,
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        fullName: values.fullName,
        phone: values.phone,
        city: values.city,
        preferredLanguage: values.preferredLanguage,
        gender: values.gender,
        serviceType: "other",
      });
    },
    onSuccess: async (payload) => {
      toast({
        title: t("common.success"),
        description: t("beneficiary_register.success"),
      });
      await onSuccess?.(payload);
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="w-12 h-12 bg-primary rounded-lg mx-auto mb-4 flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-2xl">A</span>
        </div>
        <CardTitle className="text-2xl font-bold">{t("beneficiary_register.title")}</CardTitle>
        <CardDescription>{t("beneficiary_register.subtitle")}</CardDescription>
      </CardHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <CardContent className="space-y-4">
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
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("beneficiary_register.username")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="username" />
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
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("beneficiary_register.gender")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("beneficiary_register.select_gender")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="male">{t("beneficiary_register.gender_male")}</SelectItem>
                      <SelectItem value="female">{t("beneficiary_register.gender_female")}</SelectItem>
                    </SelectContent>
                  </Select>
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
          </CardContent>

          <CardFooter className="flex items-center justify-end gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
                {t("common.cancel")}
              </Button>
            ) : null}

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("common.loading") : t("beneficiary_register.submit")}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
