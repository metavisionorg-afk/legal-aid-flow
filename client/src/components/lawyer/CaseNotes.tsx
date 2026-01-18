import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { lawyerNotesAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pin, Trash2, Edit2, X, Check } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

interface CaseNotesProps {
  caseId: string;
}

export function CaseNotes({ caseId }: CaseNotesProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["lawyer-case-notes", caseId],
    queryFn: () => lawyerNotesAPI.list(caseId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { noteText: string; isPinned?: boolean }) =>
      lawyerNotesAPI.create(caseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      setNewNote("");
      toast({ title: t("lawyer.notes.created") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: getErrorMessage(error, t),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: any }) =>
      lawyerNotesAPI.update(noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      setEditingId(null);
      toast({ title: t("lawyer.notes.updated") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: getErrorMessage(error, t),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => lawyerNotesAPI.delete(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      toast({ title: t("lawyer.notes.deleted") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: getErrorMessage(error, t),
      });
    },
  });

  const handleCreate = () => {
    if (!newNote.trim()) return;
    createMutation.mutate({ noteText: newNote.trim() });
  };

  const handleTogglePin = (note: any) => {
    updateMutation.mutate({
      noteId: note.id,
      data: { isPinned: !note.isPinned },
    });
  };

  const handleStartEdit = (note: any) => {
    setEditingId(note.id);
    setEditText(note.noteText);
  };

  const handleSaveEdit = (noteId: string) => {
    if (!editText.trim()) return;
    updateMutation.mutate({
      noteId,
      data: { noteText: editText.trim() },
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const locale = i18n.language === "ar" ? ar : enUS;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("lawyer.notes.title")}</CardTitle>
          <CardDescription>{t("lawyer.notes.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Note */}
          <div className="space-y-2">
            <Textarea
              placeholder={t("lawyer.notes.placeholder")}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
            <Button
              onClick={handleCreate}
              disabled={!newNote.trim() || createMutation.isPending}
              size="sm"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              )}
              {t("lawyer.notes.add")}
            </Button>
          </div>

          {/* Notes List */}
          <div className="space-y-3">
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("lawyer.notes.no_notes")}
              </p>
            ) : (
              notes.map((note: any) => (
                <Card key={note.id} className={note.isPinned ? "border-primary" : ""}>
                  <CardContent className="pt-4">
                    {editingId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(note.id)}
                            disabled={!editText.trim() || updateMutation.isPending}
                          >
                            <Check className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                            {t("common.save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm whitespace-pre-wrap flex-1">
                            {note.noteText}
                          </p>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTogglePin(note)}
                              disabled={updateMutation.isPending}
                            >
                              <Pin
                                className={`h-4 w-4 ${note.isPinned ? "fill-primary text-primary" : ""}`}
                              />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(note)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(note.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(note.createdAt), "PPp", { locale })}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
