import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocation } from "wouter";
import { useState } from "react";
import { portalAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function PortalRegister() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;
    const idNumber = formData.get("idNumber") as string;
    const phone = formData.get("phone") as string;

    try {
      await portalAPI.register({
        username,
        email,
        password,
        fullName,
        idNumber,
        phone,
      });
      
      toast({
        title: t('common.success'),
        description: t('portal.account_created'),
      });
      
      setTimeout(() => {
        setLocation("/portal/login");
      }, 1500);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || "Registration failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4 relative">
      <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto">
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 bg-primary rounded-lg mx-auto mb-4 flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-2xl">A</span>
          </div>
          <CardTitle className="text-2xl font-bold">{t('portal.register')}</CardTitle>
          <CardDescription>
            {t('portal.register_subtitle')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('portal.full_name')}</Label>
              <Input 
                id="fullName" 
                name="fullName" 
                type="text" 
                placeholder="Ahmed Salem" 
                required 
                data-testid="input-fullname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idNumber">{t('portal.id_number')}</Label>
              <Input 
                id="idNumber" 
                name="idNumber" 
                type="text" 
                placeholder="123456789" 
                required 
                data-testid="input-idnumber"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('portal.phone')}</Label>
              <Input 
                id="phone" 
                name="phone" 
                type="tel" 
                placeholder="+962 79 123 4567" 
                required 
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('app.email')}</Label>
              <Input 
                id="email" 
                name="email" 
                type="email" 
                placeholder="ahmed@example.com" 
                required 
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">{t('portal.username')}</Label>
              <Input 
                id="username" 
                name="username" 
                type="text" 
                placeholder="ahmed.salem" 
                required 
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('app.password')}</Label>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required 
                data-testid="input-password"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t('portal.have_account')}{' '}
              <a href="/portal/login" className="text-primary hover:underline">
                {t('app.sign_in')}
              </a>
            </p>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-register">
              {loading ? t('common.loading') : t('portal.create_account')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
