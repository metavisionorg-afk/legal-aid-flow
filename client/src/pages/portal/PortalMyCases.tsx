import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { casesAPI } from "@/lib/api";
import { NewCaseDialog } from "@/components/cases/NewCaseDialog";

export default function PortalMyCases() {
  const { t } = useTranslation();

  const { data: myCases, isLoading } = useQuery({
    queryKey: ["cases", "my"],
    queryFn: () => casesAPI.getMy(),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("portal.my_cases")}</CardTitle>
          <NewCaseDialog />
        </CardHeader>
        <CardContent>
          {isLoading ? (
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
    </div>
  );
}
