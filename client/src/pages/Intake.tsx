import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { beneficiariesAPI, intakeAPI } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const formSchema = z.object({
  fullName: z.string().min(2, "Name is required"),
  phone: z.string().min(8, "Valid phone number required"),
  idNumber: z.string().min(5, "ID Number required"),
  email: z.string().email().optional().or(z.literal("")),
  caseType: z.string(),
  description: z.string().min(10, "Description must be at least 10 characters"),
});

export default function Intake() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      idNumber: "",
      email: "",
      caseType: "civil",
      description: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      // First create or find beneficiary
      const beneficiary = await beneficiariesAPI.create({
        fullName: values.fullName,
        idNumber: values.idNumber,
        phone: values.phone,
        email: values.email || undefined,
        status: "pending",
      });

      // Then create intake request
      await intakeAPI.create({
        beneficiaryId: beneficiary.id,
        caseType: values.caseType,
        description: values.description,
        status: "pending",
      });

      toast({
        title: "Request Submitted",
        description: "The intake request has been successfully recorded.",
      });

      queryClient.invalidateQueries({ queryKey: ["intake-requests"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('intake.new_request')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>{t('intake.personal_info')}</CardTitle>
                  <CardDescription>Enter the beneficiary's basic details.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t('intake.full_name')}</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} data-testid="input-fullname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="idNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('intake.id_number')}</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789" {...field} data-testid="input-idnumber" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('intake.phone')}</FormLabel>
                        <FormControl>
                          <Input placeholder="+1234567890" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('intake.case_details')}</CardTitle>
                  <CardDescription>Information about the legal issue.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="caseType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('intake.case_type')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-casetype">
                              <SelectValue placeholder="Select case type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
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
                      <FormItem>
                        <FormLabel>{t('intake.description')}</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe the legal issue..." 
                            className="min-h-[120px]"
                            {...field} 
                            data-testid="textarea-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Button 
                type="submit" 
                size="lg" 
                className="w-full sm:w-auto"
                disabled={isSubmitting}
                data-testid="button-submit"
              >
                {isSubmitting ? "Submitting..." : t('intake.submit')}
              </Button>
            </form>
          </Form>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('intake.documents')}</CardTitle>
              <CardDescription>Upload relevant files.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <h4 className="text-sm font-medium mb-1">{t('intake.upload_docs')}</h4>
                <p className="text-xs text-muted-foreground mb-4">Drag and drop or click to upload</p>
                <Button variant="outline" size="sm">Select Files</Button>
              </div>
              
              <div className="mt-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Required</div>
                <div className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded border">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  ID Copy / Passport
                </div>
                <div className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded border">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                  Proof of Income (Optional)
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
