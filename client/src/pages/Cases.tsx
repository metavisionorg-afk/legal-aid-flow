import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Plus, Search, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { casesAPI, beneficiariesAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function Cases() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [caseNumber, setCaseNumber] = useState("");
  const [title, setTitle] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [caseType, setCaseType] = useState<string>("civil");
  const [description, setDescription] = useState("");

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: casesAPI.getAll,
  });

  const { data: beneficiaries, isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
  });

  const createCaseMutation = useMutation({
    mutationFn: casesAPI.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      setCaseNumber("");
      setTitle("");
      setBeneficiaryId("");
      setCaseType("civil");
      setDescription("");
      setCreateOpen(false);
      toast({ title: t("cases.created") });
    },
    onError: () => {
      toast({ title: t("cases.create_failed"), variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!caseNumber.trim() || !title.trim() || !beneficiaryId || !description.trim()) {
      toast({ title: t("common.error"), variant: "destructive" });
      return;
    }

    createCaseMutation.mutate({
      caseNumber: caseNumber.trim(),
      title: title.trim(),
      beneficiaryId,
      caseType,
      description: description.trim(),
      status: "open",
      priority: "medium",
    });
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.cases')}</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-case">
              <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t('app.add_new')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dashboard.new_case")}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("cases.case_number")}</Label>
                <Input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("cases.case_title")}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{t("consultations.beneficiary")}</Label>
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger data-testid="select-case-beneficiary">
                    <SelectValue placeholder={beneficiariesLoading ? t("common.loading") : t("consultations.select_beneficiary")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(beneficiaries || []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.fullName} ({b.idNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("intake.case_type")}</Label>
                <Select value={caseType} onValueChange={setCaseType}>
                  <SelectTrigger data-testid="select-case-type">
                    <SelectValue placeholder={t("intake.case_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="civil">Civil</SelectItem>
                    <SelectItem value="criminal">Criminal</SelectItem>
                    <SelectItem value="family">Family/Personal Status</SelectItem>
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="asylum">Asylum/Refugee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("intake.description")}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={createCaseMutation.isPending}>
                {createCaseMutation.isPending ? t("common.loading") : t("cases.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="all">All Cases</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
              <Input
                placeholder={t('app.search')}
                className="pl-9 rtl:pr-9 rtl:pl-3"
                data-testid="input-search"
              />
            </div>
            <Button variant="outline" size="icon" data-testid="button-filter">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="all" className="mt-0">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case Number</TableHead>
                  <TableHead>{t('intake.case_type')}</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>{t('app.priority')}</TableHead>
                  <TableHead>{t('app.status')}</TableHead>
                  <TableHead className="text-right rtl:text-left">{t('app.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    </TableRow>
                  ))
                ) : cases && cases.length > 0 ? (
                  cases.map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-case-${c.id}`}>
                      <TableCell className="font-medium">
                        <div>{c.caseNumber}</div>
                      </TableCell>
                      <TableCell>{c.caseType}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.title}</TableCell>
                      <TableCell>
                        <Badge variant={c.priority === "urgent" ? "destructive" : c.priority === "high" ? "default" : "secondary"}>
                          {c.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${
                            c.status === "in_progress" ? "bg-blue-500" : 
                            c.status === "open" ? "bg-green-500" : 
                            c.status === "urgent" ? "bg-red-500" : "bg-gray-500"
                          }`} />
                          {c.status}
                        </div>
                      </TableCell>
                      <TableCell className="text-right rtl:text-left">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${c.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Edit Case</DropdownMenuItem>
                            <DropdownMenuItem>Assign Lawyer</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("cases.no_cases")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="active">
          <div className="p-4 text-center text-muted-foreground">Active cases view</div>
        </TabsContent>
        <TabsContent value="pending">
          <div className="p-4 text-center text-muted-foreground">Pending cases view</div>
        </TabsContent>
        <TabsContent value="closed">
          <div className="p-4 text-center text-muted-foreground">Closed cases view</div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
