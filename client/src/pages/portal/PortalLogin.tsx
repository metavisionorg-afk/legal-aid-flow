import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function PortalLogin() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, login } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user.userType === "beneficiary") {
      setLocation("/portal");
    }
  }, [user, setLocation]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    try {
      await login(username, password);
      toast({
        title: t('common.success'),
        description: "Logged in successfully",
      });
      setLocation("/portal");
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || "Invalid credentials",
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
          <CardTitle className="text-2xl font-bold">{t('portal.title')}</CardTitle>
          <CardDescription>
            {t('app.enter_credentials')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('portal.username')}</Label>
              <Input 
                id="username" 
                name="username" 
                type="text" 
                placeholder="ahmed.salem" 
                required 
                defaultValue="ahmed.salem"
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
                defaultValue="beneficiary123"
                data-testid="input-password"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Demo: ahmed.salem/beneficiary123
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t('portal.no_account')}{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setLocation("/register")}
              >
                {t('portal.create_new_account')}
              </button>
            </p>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
              {loading ? t('common.loading') : t('app.sign_in')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
