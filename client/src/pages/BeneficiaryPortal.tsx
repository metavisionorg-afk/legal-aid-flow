import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { beneficiaryAPI, casesAPI, documentsAPI, uploadsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

type PreferredLanguage = "ar" | "en";

export default function BeneficiaryPortal() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: me, isLoading: loadingMe } = useQuery({
    queryKey: ["beneficiary", "me"],
    queryFn: () => beneficiaryAPI.me(),
  });

  const { data: myCases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases", "my"],
    queryFn: () => casesAPI.getMy(),
  });

  const { data: myDocuments, isLoading: loadingDocuments } = useQuery({
    queryKey: ["documents", "my"],
    queryFn: () => documentsAPI.listMy(),
  });

  const [draft, setDraft] = useState<any>({});

  const effectiveDraft = useMemo(() => {
    return {
      fullName: draft.fullName ?? me?.fullName ?? "",
      phone: draft.phone ?? me?.phone ?? "",
      city: draft.city ?? me?.city ?? "",
      address: draft.address ?? me?.address ?? "",
      preferredLanguage: (draft.preferredLanguage ?? me?.preferredLanguage ?? "ar") as PreferredLanguage,
      nationalId: draft.nationalId ?? me?.nationalId ?? "",
    };
  }, [draft, me]);

  const updateMutation = useMutation({
    mutationFn: async (values: any) => beneficiaryAPI.updateMe(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["beneficiary", "me"] });
      toast({ title: t("common.success"), description: t("beneficiary_portal.updated") });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("beneficiary_portal.update_failed"),
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file");
      const meta = await uploadsAPI.upload(uploadFile);
      return documentsAPI.uploadMy({ documents: [meta] });
    },
    onSuccess: () => {
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", "my"] });
      toast({ title: t("common.success"), description: t("beneficiary_portal.document_uploaded") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("beneficiary_portal.document_upload_failed"),
        variant: "destructive",
      });
    },
  });

  const formatSize = (size?: number | null) => {
    if (!size || size <= 0) return "-";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("beneficiary_portal.title")}</h1>
        <p className="text-muted-foreground">{t("beneficiary_portal.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("beneficiary_portal.profile")}</CardTitle>
          <Button
            variant={editing ? "secondary" : "default"}
            onClick={() => {
              if (!editing) setDraft({});
              setEditing((v) => !v);
            }}
            disabled={loadingMe}
          >
            {editing ? t("beneficiary_portal.cancel") : t("beneficiary_portal.edit")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingMe ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("beneficiary_portal.full_name")}</Label>
                <Input
                  value={effectiveDraft.fullName}
                  disabled={!editing}
                  onChange={(e) => setDraft((p: any) => ({ ...p, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("beneficiary_portal.phone")}</Label>
                <Input
                  value={effectiveDraft.phone}
                  disabled={!editing}
                  onChange={(e) => setDraft((p: any) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("beneficiary_portal.city")}</Label>
                <Input
                  value={effectiveDraft.city}
                  disabled={!editing}
                  onChange={(e) => setDraft((p: any) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("beneficiary_portal.preferred_language")}</Label>
                <Select
                  value={effectiveDraft.preferredLanguage}
                  onValueChange={(v) => setDraft((p: any) => ({ ...p, preferredLanguage: v }))}
                  disabled={!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{t("beneficiary_register.language_ar")}</SelectItem>
                    <SelectItem value="en">{t("beneficiary_register.language_en")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("beneficiary_portal.address")}</Label>
                <Input
                  value={effectiveDraft.address}
                  disabled={!editing}
                  onChange={(e) => setDraft((p: any) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("beneficiary_portal.national_id")}</Label>
                <Input
                  value={effectiveDraft.nationalId}
                  disabled={!editing}
                  onChange={(e) => setDraft((p: any) => ({ ...p, nationalId: e.target.value }))}
                />
              </div>

              {editing ? (
                <div className="md:col-span-2">
                  <Button
                    onClick={() =>
                      updateMutation.mutate({
                        fullName: effectiveDraft.fullName,
                        phone: effectiveDraft.phone,
                        city: effectiveDraft.city,
                        address: effectiveDraft.address || null,
                        preferredLanguage: effectiveDraft.preferredLanguage,
                        nationalId: effectiveDraft.nationalId || null,
                      })
                    }
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? t("common.loading") : t("common.save")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("beneficiary_portal.my_cases")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCases ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : !myCases?.length ? (
            <div className="text-sm text-muted-foreground">{t("beneficiary_portal.no_cases")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("beneficiary_portal.case_number")}</TableHead>
                  <TableHead>{t("beneficiary_portal.case_title")}</TableHead>
                  <TableHead>{t("beneficiary_portal.case_status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myCases.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.caseNumber}</TableCell>
                    <TableCell>{c.title}</TableCell>
                    <TableCell>{c.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("beneficiary_portal.upload_document")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          />
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!uploadFile || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? t("common.loading") : t("beneficiary_portal.upload")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("beneficiary_portal.my_documents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDocuments ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : !myDocuments?.length ? (
            <div className="text-sm text-muted-foreground">{t("beneficiary_portal.no_documents")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("beneficiary_portal.document_name")}</TableHead>
                  <TableHead>{t("beneficiary_portal.document_type")}</TableHead>
                  <TableHead>{t("beneficiary_portal.document_size")}</TableHead>
                  <TableHead>{t("beneficiary_portal.document_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myDocuments.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.fileName || d.title}</TableCell>
                    <TableCell>{d.mimeType || d.fileType}</TableCell>
                    <TableCell>{formatSize(d.size ?? d.fileSize)}</TableCell>
                    <TableCell>
                      {d.fileUrl ? (
                        <a className="underline" href={d.fileUrl} target="_blank" rel="noreferrer">
                          {t("beneficiary_portal.open")}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
