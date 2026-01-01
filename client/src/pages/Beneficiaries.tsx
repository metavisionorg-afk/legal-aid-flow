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
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Plus, Search, Filter } from "lucide-react";

export default function Beneficiaries() {
  const { t } = useTranslation();

  const beneficiaries = [
    {
      id: "BEN-001",
      name: "Ahmed Salem",
      idNumber: "987654321",
      phone: "+962 79 123 4567",
      status: "Active",
      cases: 2,
      lastContact: "2023-10-15",
    },
    {
      id: "BEN-002",
      name: "Layla Mahmoud",
      idNumber: "123456789",
      phone: "+962 78 987 6543",
      status: "Pending",
      cases: 1,
      lastContact: "2023-10-20",
    },
    {
      id: "BEN-003",
      name: "Omar Khalid",
      idNumber: "456789123",
      phone: "+962 77 654 3210",
      status: "Archived",
      cases: 0,
      lastContact: "2023-09-01",
    },
  ];

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.beneficiaries')}</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
          {t('app.add_new')}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input
            placeholder={t('app.search')}
            className="pl-9 rtl:pr-9 rtl:pl-3"
          />
        </div>
        <Button variant="outline" size="icon">
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
            {beneficiaries.map((ben) => (
              <TableRow key={ben.id}>
                <TableCell className="font-medium">{ben.id}</TableCell>
                <TableCell>{ben.name}</TableCell>
                <TableCell>{ben.idNumber}</TableCell>
                <TableCell className="text-muted-foreground">{ben.phone}</TableCell>
                <TableCell>
                  <Badge variant={ben.status === "Active" ? "default" : "secondary"}>
                    {ben.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right rtl:text-left">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
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
            ))}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
