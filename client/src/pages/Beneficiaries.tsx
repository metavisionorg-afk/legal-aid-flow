import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { BeneficiaryRegistrationCard } from "@/components/beneficiaries/BeneficiaryRegistrationCard";
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
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Plus, Search, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { beneficiariesAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function Beneficiaries() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);

  const { data: beneficiaries, isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
  });

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.beneficiaries')}</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-beneficiary">
              <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t('app.add_new')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("beneficiaries.add_title")}</DialogTitle>
            </DialogHeader>

            <div className="flex justify-center">
              <BeneficiaryRegistrationCard
                mode="staff"
                onCancel={() => setCreateOpen(false)}
                onSuccess={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
                  setCreateOpen(false);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t('intake.full_name')}</TableHead>
              <TableHead>{t('intake.id_number')}</TableHead>
              <TableHead>{t('intake.phone')}</TableHead>
              <TableHead>{t('app.status')}</TableHead>
              <TableHead className="text-right rtl:text-left">{t('app.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                </TableRow>
              ))
            ) : beneficiaries && beneficiaries.length > 0 ? (
              beneficiaries.map((ben: any) => (
                <TableRow key={ben.id} data-testid={`row-beneficiary-${ben.id}`}>
                  <TableCell className="font-medium">{ben.id.slice(0, 8)}</TableCell>
                  <TableCell>{ben.fullName}</TableCell>
                  <TableCell>{ben.idNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{ben.phone}</TableCell>
                  <TableCell>
                    <Badge variant={ben.status === "active" ? "default" : "secondary"}>
                      {ben.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right rtl:text-left">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-actions-${ben.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                        <DropdownMenuItem>Edit Details</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Archive</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No beneficiaries found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
