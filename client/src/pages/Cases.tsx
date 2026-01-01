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

export default function Cases() {
  const { t } = useTranslation();

  const cases = [
    {
      id: "CASE-2023-001",
      title: "Labor Dispute - Unpaid Wages",
      type: "Labor",
      client: "Ahmed Salem",
      lawyer: "Sarah Ahmed",
      status: "In Progress",
      priority: "High",
      dueDate: "2023-11-01",
    },
    {
      id: "CASE-2023-002",
      title: "Residency Permit Appeal",
      type: "Asylum",
      client: "Layla Mahmoud",
      lawyer: "Pending",
      status: "Open",
      priority: "Medium",
      dueDate: "2023-11-15",
    },
    {
      id: "CASE-2023-003",
      title: "Custody Hearing",
      type: "Family",
      client: "Omar Khalid",
      lawyer: "Sarah Ahmed",
      status: "Urgent",
      priority: "Urgent",
      dueDate: "2023-10-25",
    },
  ];

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.cases')}</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
          {t('app.add_new')}
        </Button>
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
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="all" className="mt-0">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case ID</TableHead>
                  <TableHead>{t('intake.case_type')}</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>{t('app.assigned_to')}</TableHead>
                  <TableHead>{t('app.priority')}</TableHead>
                  <TableHead>{t('app.status')}</TableHead>
                  <TableHead className="text-right rtl:text-left">{t('app.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div>{c.id}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]">{c.title}</div>
                    </TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell>{c.client}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.lawyer === "Pending" ? <span className="text-yellow-600 italic">Pending</span> : c.lawyer}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.priority === "Urgent" ? "destructive" : c.priority === "High" ? "default" : "secondary"}>
                        {c.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          c.status === "In Progress" ? "bg-blue-500" : 
                          c.status === "Open" ? "bg-green-500" : 
                          c.status === "Urgent" ? "bg-red-500" : "bg-gray-500"
                        }`} />
                        {c.status}
                      </div>
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
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Edit Case</DropdownMenuItem>
                          <DropdownMenuItem>Assign Lawyer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        {/* Placeholder for other tabs */}
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
