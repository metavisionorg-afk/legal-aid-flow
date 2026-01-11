import React, { useEffect, useMemo, useState } from "react";
import { docFoldersAPI, libraryDocsAPI, uploadsAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Folder, FileText, Search, Loader2, Plus, Upload, Download, Archive, Trash2, RefreshCw } from "lucide-react";
import { Layout } from "@/components/layout/Layout";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  isArchived: boolean;
};

type LibraryDocRow = {
  id: string;
  folderId: string | null;
  folderName?: string | null;
  title: string;
  docType: string | null;
  description: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  visibility: "internal" | "case_team" | "beneficiary" | string;
  isArchived: boolean;
  createdAt?: string;
};

function formatFileSize(size: number): string {
  const n = Number(size || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function visibilityLabel(v: string) {
  if (v === "internal") return { text: "Internal", variant: "secondary" as const };
  if (v === "case_team") return { text: "Case team", variant: "outline" as const };
  if (v === "beneficiary") return { text: "Beneficiary", variant: "default" as const };
  return { text: v || "—", variant: "secondary" as const };
}

export default function DocumentsLibrary() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [docs, setDocs] = useState<LibraryDocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibility, setVisibility] = useState<string>("all");

  // Create folder dialog state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [createFolderBusy, setCreateFolderBusy] = useState(false);

  // Upload document dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDocType, setUploadDocType] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState<"internal" | "case_team" | "beneficiary">("internal");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const selectedFolder = useMemo(
    () => folders.find((f) => String(f.id) === String(selectedFolderId)) || null,
    [folders, selectedFolderId],
  );

  async function loadFolders() {
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const list = (await docFoldersAPI.list({ includeArchived })) as any[];
      setFolders(list as any);
    } catch (error: any) {
      const status = error?.response?.status as number | undefined;
      if (status === 401) {
        toast({
          title: t("common.error", "خطأ"),
          description: t("common.unauthorized_desc", "يلزم تسجيل الدخول للمتابعة"),
          variant: "destructive",
        });
        setLocation("/login");
        return;
      }

      if (status === 403) {
        setFoldersError(t("common.unauthorized_desc", "ليس لديك صلاحية للوصول"));
        return;
      }

      setFoldersError(error?.message || t("documents.folders_load_failed", "تعذّر تحميل المجلدات"));
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.folders_load_failed", "تعذّر تحميل المجلدات"),
        variant: "destructive",
      });
    } finally {
      setFoldersLoading(false);
    }
  }

  async function loadDocs() {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const list = (await libraryDocsAPI.list({
        q: debouncedSearch || undefined,
        folderId: selectedFolderId,
        visibility: visibility === "all" ? null : visibility,
        includeArchived,
        limit: 200,
      })) as any[];
      setDocs(list as any);
    } catch (error: any) {
      const status = error?.response?.status as number | undefined;
      if (status === 401) {
        toast({
          title: t("common.error", "خطأ"),
          description: t("common.unauthorized_desc", "يلزم تسجيل الدخول للمتابعة"),
          variant: "destructive",
        });
        setLocation("/login");
        return;
      }

      if (status === 403) {
        setDocsError(t("common.unauthorized_desc", "ليس لديك صلاحية للوصول"));
        return;
      }

      setDocsError(error?.message || t("documents.docs_load_failed", "تعذّر تحميل المستندات"));
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.docs_load_failed", "تعذّر تحميل المستندات"),
        variant: "destructive",
      });
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, debouncedSearch, visibility, includeArchived]);

  const canArchiveSelectedFolder = Boolean(selectedFolderId && selectedFolder);

  async function onCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      toast({
        title: t("common.error", "خطأ"),
        description: t("documents.folder_name_required", "اسم المجلد مطلوب"),
        variant: "destructive",
      });
      return;
    }

    setCreateFolderBusy(true);
    try {
      await docFoldersAPI.create({
        name,
        parentId: selectedFolderId,
        description: newFolderDescription.trim() ? newFolderDescription.trim() : null,
      });

      toast({ title: t("common.success", "تم"), description: t("documents.folder_created", "تم إنشاء المجلد") });
      setCreateFolderOpen(false);
      setNewFolderName("");
      setNewFolderDescription("");
      await loadFolders();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.folder_create_failed", "تعذّر إنشاء المجلد"),
        variant: "destructive",
      });
    } finally {
      setCreateFolderBusy(false);
    }
  }

  async function onToggleFolderArchive(folderId: string, isArchivedNext: boolean) {
    setFoldersLoading(true);
    try {
      await docFoldersAPI.archive(folderId, isArchivedNext);
      toast({
        title: t("common.success", "تم"),
        description: isArchivedNext
          ? t("documents.folder_archived", "تمت أرشفة المجلد")
          : t("documents.folder_unarchived", "تمت إعادة المجلد"),
      });
      await loadFolders();
      await loadDocs();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.folder_archive_failed", "تعذّر تحديث حالة المجلد"),
        variant: "destructive",
      });
    } finally {
      setFoldersLoading(false);
    }
  }

  async function onDeleteFolder(folderId: string) {
    const ok = window.confirm(t("documents.confirm_delete_folder", "هل تريد حذف المجلد؟"));
    if (!ok) return;
    setFoldersLoading(true);
    try {
      await docFoldersAPI.delete(folderId);
      toast({ title: t("common.success", "تم"), description: t("documents.folder_deleted", "تم حذف المجلد") });
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      await loadFolders();
      await loadDocs();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.folder_delete_failed", "تعذّر حذف المجلد"),
        variant: "destructive",
      });
    } finally {
      setFoldersLoading(false);
    }
  }

  function handleDownload(doc: LibraryDocRow) {
    const url = `/uploads/${doc.storageKey}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function onToggleDocArchive(docId: string, isArchivedNext: boolean) {
    setDocsLoading(true);
    try {
      await libraryDocsAPI.archive(docId, isArchivedNext);
      toast({
        title: t("common.success", "تم"),
        description: isArchivedNext
          ? t("documents.doc_archived", "تمت أرشفة المستند")
          : t("documents.doc_unarchived", "تمت إعادة المستند"),
      });
      await loadDocs();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.doc_archive_failed", "تعذّر تحديث حالة المستند"),
        variant: "destructive",
      });
    } finally {
      setDocsLoading(false);
    }
  }

  async function onDeleteDoc(docId: string) {
    const ok = window.confirm(t("documents.confirm_delete_doc", "هل تريد حذف المستند؟"));
    if (!ok) return;
    setDocsLoading(true);
    try {
      await libraryDocsAPI.delete(docId);
      toast({ title: t("common.success", "تم"), description: t("documents.doc_deleted", "تم حذف المستند") });
      await loadDocs();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.doc_delete_failed", "تعذّر حذف المستند"),
        variant: "destructive",
      });
    } finally {
      setDocsLoading(false);
    }
  }

  async function onUploadDoc() {
    if (!uploadFile) {
      toast({
        title: t("common.error", "خطأ"),
        description: t("documents.file_required", "الملف مطلوب"),
        variant: "destructive",
      });
      return;
    }

    const title = (uploadTitle || uploadFile.name).trim();
    if (!title) {
      toast({
        title: t("common.error", "خطأ"),
        description: t("documents.title_required", "عنوان المستند مطلوب"),
        variant: "destructive",
      });
      return;
    }

    setUploadBusy(true);
    try {
      const fileMeta = await uploadsAPI.upload(uploadFile);
      const tags = uploadTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await libraryDocsAPI.create({
        folderId: selectedFolderId,
        title,
        docType: uploadDocType.trim() ? uploadDocType.trim() : null,
        description: uploadDescription.trim() ? uploadDescription.trim() : null,
        tags: tags.length ? tags : null,
        visibility: uploadVisibility,
        file: fileMeta,
      });

      toast({ title: t("common.success", "تم"), description: t("documents.upload_success", "تم رفع المستند") });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadDocType("");
      setUploadDescription("");
      setUploadTags("");
      setUploadVisibility("internal");
      await loadDocs();
    } catch (error: any) {
      toast({
        title: t("common.error", "خطأ"),
        description: error?.message || t("documents.upload_failed", "تعذّر رفع المستند"),
        variant: "destructive",
      });
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("documents.library_title", "مكتبة المستندات")}</h1>

        <div className="flex items-center gap-2">
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("documents.upload", "رفع مستند")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("documents.upload", "رفع مستند")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "documents.upload_desc",
                    "ارفع ملفًا ثم أدخل بياناته ليُضاف إلى مكتبة المستندات",
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t("documents.file", "الملف")}</Label>
                  <Input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setUploadFile(f);
                      if (f && !uploadTitle.trim()) setUploadTitle(f.name);
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {t("documents.upload_hint", "الرفع يدعم: PDF، صور، Word (حسب إعدادات السيرفر)")}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("documents.title", "العنوان")}</Label>
                    <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("documents.doc_type", "نوع المستند")}</Label>
                    <Input value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("common.description", "الوصف")}</Label>
                  <Textarea value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("documents.tags", "وسوم")}</Label>
                    <Input
                      placeholder={t("documents.tags_hint", "مثال: عقد, فاتورة, قضية")}
                      value={uploadTags}
                      onChange={(e) => setUploadTags(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("documents.visibility", "الظهور")}</Label>
                    <Select value={uploadVisibility} onValueChange={(v) => setUploadVisibility(v as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="internal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">internal</SelectItem>
                        <SelectItem value="case_team">case_team</SelectItem>
                        <SelectItem value="beneficiary">beneficiary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadBusy}>
                  {t("common.cancel", "إلغاء")}
                </Button>
                <Button onClick={onUploadDoc} disabled={uploadBusy}>
                  {uploadBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t("documents.upload", "رفع")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("documents.new_folder", "مجلد جديد")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("documents.new_folder", "مجلد جديد")}</DialogTitle>
                <DialogDescription>
                  {selectedFolder
                    ? t("documents.new_folder_in", "سيتم إنشاء المجلد داخل") + `: ${selectedFolder.name}`
                    : t("documents.new_folder_desc", "أنشئ مجلدًا لتنظيم المستندات")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t("documents.folder_name", "اسم المجلد")}</Label>
                  <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.description", "الوصف")}</Label>
                  <Textarea value={newFolderDescription} onChange={(e) => setNewFolderDescription(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateFolderOpen(false)} disabled={createFolderBusy}>
                  {t("common.cancel", "إلغاء")}
                </Button>
                <Button onClick={onCreateFolder} disabled={createFolderBusy}>
                  {createFolderBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t("common.create", "إنشاء")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input
            placeholder={t("documents.search_placeholder", "ابحث عن مستند...")}
            className="pl-9 rtl:pr-9 rtl:pl-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t("documents.visibility", "الظهور")}</Label>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="all" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="internal">internal</SelectItem>
              <SelectItem value="case_team">case_team</SelectItem>
              <SelectItem value="beneficiary">beneficiary</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={loadDocs} disabled={docsLoading}>
            {docsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {t("common.refresh", "تحديث")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr]">
          <aside className="border-b lg:border-b-0 lg:border-r bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="font-semibold flex items-center gap-2">
                <Folder className="w-5 h-5" />
                {t("documents.folders", "المجلدات")}
              </div>

              <Button variant="ghost" size="icon" onClick={loadFolders} disabled={foldersLoading}>
                <RefreshCw className={cn("w-4 h-4", foldersLoading && "animate-spin")} />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Switch id="includeArchived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
                <Label htmlFor="includeArchived">{t("documents.include_archived", "عرض المؤرشف")}</Label>
              </div>
            </div>

            <ul className="space-y-1">
              <li>
                <button
                  className={cn(
                    "w-full px-2 py-2 rounded hover:bg-muted flex items-center justify-between gap-2 text-left rtl:text-right",
                    !selectedFolderId && "bg-muted font-semibold",
                  )}
                  onClick={() => setSelectedFolderId(null)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    {t("documents.all_documents", "جميع المستندات")}
                  </span>
                </button>
              </li>

              {folders.map((f) => (
                <li key={f.id}>
                  <div
                    className={cn(
                      "w-full px-2 py-2 rounded hover:bg-muted flex items-center justify-between gap-2",
                      selectedFolderId === f.id && "bg-muted font-semibold",
                    )}
                  >
                    <button
                      className="flex-1 inline-flex items-center gap-2 text-left rtl:text-right"
                      onClick={() => setSelectedFolderId(f.id)}
                    >
                      <Folder className="w-4 h-4" />
                      <span className="truncate" title={f.name}>
                        {f.name}
                      </span>
                      {f.isArchived ? <Badge variant="outline">{t("common.archived", "مؤرشف")}</Badge> : null}
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <span className="sr-only">{t("common.actions", "إجراءات")}</span>
                          <span className="text-xl leading-none">⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onToggleFolderArchive(f.id, !f.isArchived)}>
                          <Archive className="w-4 h-4 mr-2" />
                          {f.isArchived ? t("common.unarchive", "إلغاء الأرشفة") : t("common.archive", "أرشفة")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => onDeleteFolder(f.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("common.delete", "حذف")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <main className="p-6">
            {(foldersError || docsError) && !docsLoading ? (
              <Card className="p-4 mb-4 border-destructive/40">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-destructive">{t("common.error", "خطأ")}</div>
                    <div className="text-sm text-muted-foreground mt-1">{docsError || foldersError}</div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      loadFolders();
                      loadDocs();
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("common.retry", "إعادة المحاولة")}
                  </Button>
                </div>
              </Card>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <div className="text-lg font-semibold">
                  {selectedFolder ? selectedFolder.name : t("documents.all_documents", "جميع المستندات")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("documents.docs_count", "عدد المستندات")}: {docs.length}
                </div>
              </div>

              <div className="flex gap-2">
                {canArchiveSelectedFolder ? (
                  <Button
                    variant="outline"
                    onClick={() => onToggleFolderArchive(selectedFolder!.id, !selectedFolder!.isArchived)}
                    disabled={foldersLoading}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    {selectedFolder!.isArchived ? t("common.unarchive", "إلغاء الأرشفة") : t("common.archive", "أرشفة")}
                  </Button>
                ) : null}
              </div>
            </div>

            <Card className="p-0">
              {docsLoading ? (
                <div className="p-6 text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("common.loading", "جاري التحميل...")}
                </div>
              ) : docs.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">{t("documents.no_documents", "لا توجد مستندات")}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("documents.title", "العنوان")}</TableHead>
                      <TableHead>{t("documents.folder", "المجلد")}</TableHead>
                      <TableHead>{t("documents.visibility", "الظهور")}</TableHead>
                      <TableHead>{t("documents.file", "الملف")}</TableHead>
                      <TableHead className="w-[140px]">{t("common.actions", "إجراءات")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map((doc) => {
                      const v = visibilityLabel(String(doc.visibility));
                      return (
                        <TableRow key={doc.id} className={doc.isArchived ? "opacity-70" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary" />
                              <div className="min-w-0">
                                <div className="font-medium truncate" title={doc.title}>
                                  {doc.title}
                                </div>
                                {doc.docType ? <div className="text-xs text-muted-foreground truncate">{doc.docType}</div> : null}
                              </div>
                              {doc.isArchived ? <Badge variant="outline">{t("common.archived", "مؤرشف")}</Badge> : null}
                            </div>
                            {doc.description ? (
                              <div className="text-xs text-muted-foreground mt-1 truncate" title={doc.description || ""}>
                                {doc.description}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {doc.folderName || (doc.folderId ? t("documents.folder", "مجلد") : "—")}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={v.variant}>{v.text}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="truncate" title={doc.fileName}>
                                {doc.fileName}
                              </div>
                              <div className="text-xs text-muted-foreground">{formatFileSize(doc.size)}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                                <Download className="w-4 h-4 mr-1" />
                                {t("documents.download", "تنزيل")}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    ⋯
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => onToggleDocArchive(doc.id, !doc.isArchived)}>
                                    <Archive className="w-4 h-4 mr-2" />
                                    {doc.isArchived ? t("common.unarchive", "إلغاء الأرشفة") : t("common.archive", "أرشفة")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => onDeleteDoc(doc.id)}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t("common.delete", "حذف")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </main>
        </div>
      </div>
    </Layout>
  );
}
