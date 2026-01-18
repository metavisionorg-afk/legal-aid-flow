import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { lawyerNotesAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pin, Edit2, Trash2, Save, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getErrorMessage } from "@/lib/errors";

interface LawyerCaseNotesProps {
  caseId: string;
}

export function LawyerCaseNotes({ caseId }: LawyerCaseNotesProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["lawyer-case-notes", caseId],
    queryFn: () => lawyerNotesAPI.list(caseId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { noteText: string; isPinned?: boolean }) =>
      lawyerNotesAPI.create(caseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      toast.success(t("lawyer.notes.created"));
      setIsAdding(false);
      setNoteText("");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      lawyerNotesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      toast.success(t("lawyer.notes.updated"));
      setEditingId(null);
      setNoteText("");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lawyerNotesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lawyer-case-notes", caseId] });
      toast.success(t("lawyer.notes.deleted"));
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t));
    },
  });

  const handleAdd = () => {
    if (!noteText.trim()) {
      toast.error(t("lawyer.notes.note_text_required"));
      return;
    }
    createMutation.mutate({ noteText: noteText.trim() });
  };

  const handleEdit = (note: any) => {
    setEditingId(note.id);
    setNoteText(note.noteText);
  };

  const handleUpdate = () => {
    if (!noteText.trim()) {
      toast.error(t("lawyer.notes.note_text_required"));
      return;
    }
    updateMutation.mutate({ id: editingId!, data: { noteText: noteText.trim() } });
  };

  const handleTogglePin = (note: any) => {
    updateMutation.mutate({
      id: note.id,
      data: { isPinned: !note.isPinned },
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNoteText("");
    setIsAdding(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("lawyer.notes.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("lawyer.notes.description")}</p>
        </div>
        {!isAdding && !editingId && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("lawyer.notes.add")}
          </Button>
        )}
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t("lawyer.notes.note_text_placeholder")}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  disabled={createMutation.isPending || !noteText.trim()}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {t("common.save")}
                </Button>
                <Button onClick={handleCancelEdit} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      {notes.length === 0 && !isAdding ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{t("lawyer.notes.no_notes")}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("lawyer.notes.no_notes_description")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note: any) => (
            <Card key={note.id} className={note.isPinned ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {note.isPinned && (
                      <Badge variant="secondary" className="text-xs">
                        <Pin className="h-3 w-3 mr-1" />
                        {t("lawyer.notes.pinned")}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {editingId !== note.id && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleTogglePin(note)}
                        disabled={updateMutation.isPending}
                      >
                        <Pin
                          className={`h-4 w-4 ${note.isPinned ? "fill-current" : ""}`}
                        />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(note)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(note.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingId === note.id ? (
                  <div className="space-y-4">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleUpdate}
                        disabled={updateMutation.isPending || !noteText.trim()}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {t("common.save")}
                      </Button>
                      <Button onClick={handleCancelEdit} variant="outline" size="sm">
                        <X className="h-4 w-4 mr-2" />
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.noteText}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lawyer.notes.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("lawyer.notes.confirm_delete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
