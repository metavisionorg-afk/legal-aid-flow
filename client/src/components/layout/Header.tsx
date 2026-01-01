import { useTranslation } from "react-i18next";
import { Bell, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Header() {
  const { t } = useTranslation();

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
        
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        <div className="h-8 w-px bg-border mx-2" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block rtl:text-left">
            <p className="text-sm font-medium leading-none">Sarah Ahmed</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          <Avatar className="h-8 w-8">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>SA</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
