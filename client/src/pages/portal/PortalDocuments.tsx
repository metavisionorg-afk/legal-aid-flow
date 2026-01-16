import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Upload, FileText, Download, Calendar, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { documentsAPI, uploadsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/hooks/use-toast";
import type { Document } from "@shared/schema";

export default function PortalDocuments() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  // Fetch documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ["/api/documents/my"],
    queryFn: () => documentsAPI.listMy(),
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedDocs = [];

      for (const file of files) {
        setUploadingFiles(prev => [...prev, file.name]);
        try {
          const uploaded = await uploadsAPI.upload(file);
          uploadedDocs.push(uploaded);
        } catch (error) {
          toast({
            title: t("portal_documents.upload_error"),
            description: `${file.name}: ${getErrorMessage(error, t)}`,
            variant: "destructive",
          });
          throw error;
        } finally {
          setUploadingFiles(prev => prev.filter(name => name !== file.name));
        }
      }

      return documentsAPI.uploadMy({ documents: uploadedDocs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/my"] });
      toast({
        title: t("portal_documents.upload_success_title"),
        description: t("portal_documents.upload_success_description"),
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      toast({
        title: t("portal_documents.upload_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploadMutation.mutate(files);
    }
  };

  const handleDownload = (doc: Document) => {
    window.open(doc.fileUrl, "_blank");
  };

  const canDelete = (doc: Document) => {
    // Beneficiary can only delete their own uploads
    // Staff-uploaded documents (isPublic=false or no uploadedBy match) cannot be deleted
    return !doc.isPublic || doc.uploadedBy === doc.beneficiaryId;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  const myDocuments = (documents || []) as Document[];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("portal_documents.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("portal_documents.subtitle")}
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("portal_documents.upload_title")}
          </CardTitle>
          <CardDescription>
            {t("portal_documents.upload_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending
                ? t("portal_documents.uploading")
                : t("portal_documents.select_files")}
            </Button>
            {uploadingFiles.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {t("portal_documents.uploading_files", { count: uploadingFiles.length })}
              </div>
            )}
          </div>
          <Alert className="mt-4">
            <AlertDescription>
              {t("portal_documents.upload_note")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Documents List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("portal_documents.documents_title")} ({myDocuments.length})
        </h2>

        {myDocuments.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground space-y-2">
                <FileText className="h-12 w-12 mx-auto opacity-50" />
                <p className="font-medium">{t("portal_documents.no_documents")}</p>
                <p className="text-sm">{t("portal_documents.no_documents_description")}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {myDocuments.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{doc.title}</h3>
                          {!doc.isPublic && (
                            <Badge variant="secondary">
                              {t("portal_documents.official")}
                            </Badge>
                          )}
                          {doc.category && (
                            <Badge variant="outline">{doc.category}</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(doc.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            <span>{doc.mimeType}</span>
                          </div>
                          {doc.size && (
                            <div className="flex items-center gap-1">
                              <span>{formatFileSize(doc.size)}</span>
                            </div>
                          )}
                        </div>

                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t("portal_documents.download")}
                      </Button>
                      
                      {canDelete(doc) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled
                          title={t("portal_documents.delete_disabled")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
