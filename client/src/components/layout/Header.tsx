import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationsBell } from "@/components/layout/NotificationsBell";

export function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const initials = (user?.fullName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "U";

  const roleLabel = (user as any)?.role ? String((user as any).role) : (user as any)?.userType ? String((user as any).userType) : "";

  return (
    <header className="h-16 border-b bg-background px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="w-96">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input
            type="search"
            placeholder={t('app.search')}
            className="pl-9 bg-muted/50 border-none focus-visible:ring-1 rtl:pr-9 rtl:pl-3"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <LanguageSwitcher />

        <NotificationsBell />

        <div className="h-8 w-px bg-border mx-2" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block rtl:text-left">
            <p className="text-sm font-medium leading-none">{user?.fullName || ""}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Avatar className="h-8 w-8">
            <AvatarImage src={(user as any)?.avatarUrl || ""} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
