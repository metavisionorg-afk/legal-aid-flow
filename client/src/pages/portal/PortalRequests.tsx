import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, FileText, Upload, Calendar, Building2, AlertCircle, X } from "lucide-react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { judicialServicesAPI, judicialServiceTypesAPI, uploadsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/hooks/use-toast";

interface JudicialService {
  id: string;
  serviceNumber: string;
  title: string;
  description: string | null;
  beneficiaryId: string;
  serviceTypeId: string | null;
  serviceTypeNameAr: string | null;
  serviceTypeNameEn: string | null;
  status: "new" | "in_review" | "accepted" | "rejected";
  priority: "low" | "medium" | "high" | "urgent";
  assignedLawyerId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ServiceType {
  id: string;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
}

export default function PortalRequests() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    serviceTypeId: "",
    priority: "medium" as const,
  });

  // Fetch judicial services
  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["/api/judicial-services/my"],
    queryFn: () => judicialServicesAPI.listMy(),
  });

  // Fetch service types
  const { data: serviceTypes } = useQuery({
    queryKey: ["/api/judicial-service-types/active"],
    queryFn: () => judicialServiceTypesAPI.listActive(),
  });

  // Fetch attachments for selected service
  const { data: attachments } = useQuery({
    queryKey: ["/api/judicial-services", selectedServiceId, "attachments"],
    queryFn: () => judicialServicesAPI.listAttachments(selectedServiceId!),
    enabled: !!selectedServiceId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = {
        title: data.title,
        description: data.description || null,
        serviceTypeId: data.serviceTypeId || null,
        priority: data.priority,
      };

      const created = await judicialServicesAPI.create(payload);

      // Upload attachments if any
      if (uploadedDocs.length > 0) {
        await judicialServicesAPI.addAttachments(created.id, {
          isPublic: true,
          documents: uploadedDocs,
        });
      }

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/judicial-services/my"] });
      toast({
        title: t("portal_requests.create_success_title"),
        description: t("portal_requests.create_success_description"),
      });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: t("portal_requests.create_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      serviceTypeId: "",
      priority: "medium",
    });
    setUploadedDocs([]);
    setUploadingFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFiles(files);

    try {
      const uploadedResults: any[] = [];
      for (const file of files) {
        const uploaded = await uploadsAPI.upload(file);
        uploadedResults.push(uploaded);
      }
      setUploadedDocs((prev) => [...prev, ...uploadedResults]);
      toast({
        title: t("portal_requests.upload_success"),
        description: t("portal_requests.files_uploaded", { count: files.length }),
      });
    } catch (error) {
      toast({
        title: t("portal_requests.upload_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    } finally {
      setUploadingFiles([]);
    }
  };

  const removeUploadedDoc = (index: number) => {
    setUploadedDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: t("portal_requests.validation_error"),
        description: t("portal_requests.title_required"),
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      new: { variant: "default", label: t("portal_requests.status.new") },
      in_review: { variant: "secondary", label: t("portal_requests.status.in_review") },
      accepted: { variant: "default", label: t("portal_requests.status.accepted") },
      rejected: { variant: "destructive", label: t("portal_requests.status.rejected") },
    };
    const config = statusMap[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { variant: any; label: string }> = {
      low: { variant: "outline", label: t("portal_requests.priority.low") },
      medium: { variant: "secondary", label: t("portal_requests.priority.medium") },
      high: { variant: "default", label: t("portal_requests.priority.high") },
      urgent: { variant: "destructive", label: t("portal_requests.priority.urgent") },
    };
    const config = priorityMap[priority] || { variant: "outline", label: priority };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const canEdit = (service: JudicialService) => {
    // Lock edits after status moves to "in_review" or beyond
    return service.status === "new";
  };

  const myServices = (services || []) as JudicialService[];
  const activeServices = myServices.filter((s) => s.status === "new" || s.status === "in_review");
  const completedServices = myServices.filter((s) => s.status === "accepted" || s.status === "rejected");

  if (servicesLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("portal_requests.title")}</h1>
          <p className="text-muted-foreground mt-2">{t("portal_requests.subtitle")}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("portal_requests.create_request")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("portal_requests.create_dialog_title")}</DialogTitle>
              <DialogDescription>{t("portal_requests.create_dialog_description")}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  {t("portal_requests.form.title")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t("portal_requests.form.title_placeholder")}
                  disabled={createMutation.isPending}
                />
              </div>

              {/* Service Type */}
              <div className="space-y-2">
                <Label htmlFor="serviceType">{t("portal_requests.form.service_type")}</Label>
                <Select
                  value={formData.serviceTypeId}
                  onValueChange={(value) => setFormData({ ...formData, serviceTypeId: value })}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("portal_requests.form.select_service_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(serviceTypes || []).map((type: ServiceType) => (
                      <SelectItem key={type.id} value={type.id}>
                        {i18n.language === "ar" ? type.nameAr : type.nameEn || type.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">{t("portal_requests.form.priority")}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("portal_requests.priority.low")}</SelectItem>
                    <SelectItem value="medium">{t("portal_requests.priority.medium")}</SelectItem>
                    <SelectItem value="high">{t("portal_requests.priority.high")}</SelectItem>
                    <SelectItem value="urgent">{t("portal_requests.priority.urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">{t("portal_requests.form.description")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("portal_requests.form.description_placeholder")}
                  rows={4}
                  disabled={createMutation.isPending}
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <Label>{t("portal_requests.form.attachments")}</Label>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="request-file-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFiles.length > 0 || createMutation.isPending}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingFiles.length > 0
                      ? t("portal_requests.uploading_files")
                      : t("portal_requests.attach_files")}
                  </Button>

                  {uploadedDocs.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {uploadedDocs.map((doc, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted rounded-md"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm">{doc.fileName}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeUploadedDoc(index)}
                            disabled={createMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={createMutation.isPending}
                >
                  {t("portal_requests.form.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending
                    ? t("portal_requests.submitting")
                    : t("portal_requests.form.submit")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active">
            {t("portal_requests.tabs.active")} ({activeServices.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            {t("portal_requests.tabs.completed")} ({completedServices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeServices.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground space-y-2">
                  <Building2 className="h-12 w-12 mx-auto opacity-50" />
                  <p className="font-medium">{t("portal_requests.no_active")}</p>
                  <p className="text-sm">{t("portal_requests.no_active_description")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            activeServices.map((service) => (
              <Card key={service.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{service.title}</CardTitle>
                        {!canEdit(service) && (
                          <Badge variant="outline">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {t("portal_requests.locked")}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        {t("portal_requests.request_number")}: {service.serviceNumber}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(service.status)}
                      {getPriorityBadge(service.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {service.description && (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(service.createdAt), "PPP", { locale })}
                      </span>
                    </div>
                    {service.serviceTypeNameAr && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        <span>
                          {i18n.language === "ar"
                            ? service.serviceTypeNameAr
                            : service.serviceTypeNameEn || service.serviceTypeNameAr}
                        </span>
                      </div>
                    )}
                  </div>

                  {!canEdit(service) && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {t("portal_requests.locked_message")}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedServices.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground space-y-2">
                  <Building2 className="h-12 w-12 mx-auto opacity-50" />
                  <p className="font-medium">{t("portal_requests.no_completed")}</p>
                  <p className="text-sm">{t("portal_requests.no_completed_description")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            completedServices.map((service) => (
              <Card key={service.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{service.title}</CardTitle>
                      <CardDescription>
                        {t("portal_requests.request_number")}: {service.serviceNumber}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(service.status)}
                      {getPriorityBadge(service.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {service.description && (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(service.createdAt), "PPP", { locale })}
                      </span>
                    </div>
                    {service.serviceTypeNameAr && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        <span>
                          {i18n.language === "ar"
                            ? service.serviceTypeNameAr
                            : service.serviceTypeNameEn || service.serviceTypeNameAr}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
