import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { User, Mail, Phone, MapPin, Globe, Calendar, Shield, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

import { beneficiaryAPI, authAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

interface Beneficiary {
  id: string;
  fullName: string;
  idNumber: string;
  nationalId: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  preferredLanguage: "ar" | "en" | null;
  nationality: string | null;
  gender: "male" | "female" | null;
  birthDate: string | null;
}

export default function PortalProfile() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Form states
  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    city: "",
    address: "",
    preferredLanguage: "",
    nationality: "",
    gender: "",
    birthDate: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Fetch beneficiary profile
  const { data: beneficiary, isLoading } = useQuery<Beneficiary>({
    queryKey: ["/api/beneficiary/me"],
    queryFn: () => beneficiaryAPI.me(),
  });

  // Initialize form with current values when data loads
  useEffect(() => {
    if (beneficiary) {
      setProfileForm({
        phone: beneficiary.phone || "",
        email: beneficiary.email || "",
        city: beneficiary.city || "",
        address: beneficiary.address || "",
        preferredLanguage: beneficiary.preferredLanguage || "",
        nationality: beneficiary.nationality || "",
        gender: beneficiary.gender || "",
        birthDate: beneficiary.birthDate || "",
      });
    }
  }, [beneficiary]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => beneficiaryAPI.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/beneficiary/me"] });
      refresh(); // Refresh auth context
      setIsEditingProfile(false);
      toast({
        title: t("portal_profile.update_success"),
        description: t("portal_profile.update_success_message"),
      });
    },
    onError: (error) => {
      toast({
        title: t("portal_profile.update_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      authAPI.changePassword(data),
    onSuccess: () => {
      setIsChangingPassword(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({
        title: t("portal_profile.password_success"),
        description: t("portal_profile.password_success_message"),
      });
    },
    onError: (error) => {
      toast({
        title: t("portal_profile.password_error"),
        description: getErrorMessage(error, t),
        variant: "destructive",
      });
    },
  });

  const handleCancelEdit = () => {
    if (beneficiary) {
      setProfileForm({
        phone: beneficiary.phone || "",
        email: beneficiary.email || "",
        city: beneficiary.city || "",
        address: beneficiary.address || "",
        preferredLanguage: beneficiary.preferredLanguage || "",
        nationality: beneficiary.nationality || "",
        gender: beneficiary.gender || "",
        birthDate: beneficiary.birthDate || "",
      });
    }
    setIsEditingProfile(false);
  };

  const handleSaveProfile = () => {
    const updates: any = {};
    Object.keys(profileForm).forEach((key) => {
      const value = (profileForm as any)[key];
      if (value && value.trim && value.trim()) {
        updates[key] = value.trim();
      } else if (value) {
        updates[key] = value;
      }
    });
    updateProfileMutation.mutate(updates);
  };

  const handleChangePassword = () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: t("portal_profile.password_mismatch"),
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        title: t("portal_profile.password_too_short"),
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!beneficiary) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("portal_profile.error_loading")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <User className="h-8 w-8" />
          {t("portal_profile.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("portal_profile.subtitle")}
        </p>
      </div>

      {/* Legal Identity (Read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("portal_profile.legal_identity")}
          </CardTitle>
          <CardDescription>
            {t("portal_profile.legal_identity_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("portal_profile.full_name")}</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{beneficiary.fullName}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("portal_profile.id_number")}</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{beneficiary.idNumber}</span>
              </div>
            </div>

            {beneficiary.nationalId && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t("portal_profile.national_id")}</Label>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{beneficiary.nationalId}</span>
                </div>
              </div>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t("portal_profile.legal_identity_notice")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Contact Information (Editable) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                {t("portal_profile.contact_info")}
              </CardTitle>
              <CardDescription>
                {t("portal_profile.contact_info_description")}
              </CardDescription>
            </div>
            {!isEditingProfile && (
              <Button onClick={() => setIsEditingProfile(true)}>
                {t("portal_profile.edit")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("portal_profile.phone")} *</Label>
              {isEditingProfile ? (
                <Input
                  id="phone"
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder={t("portal_profile.phone_placeholder")}
                />
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{beneficiary.phone}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("portal_profile.email")}</Label>
              {isEditingProfile ? (
                <Input
                  id="email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  placeholder={t("portal_profile.email_placeholder")}
                />
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{beneficiary.email || t("portal_profile.not_provided")}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">{t("portal_profile.city")}</Label>
              {isEditingProfile ? (
                <Input
                  id="city"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  placeholder={t("portal_profile.city_placeholder")}
                />
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{beneficiary.city || t("portal_profile.not_provided")}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredLanguage">{t("portal_profile.preferred_language")}</Label>
              {isEditingProfile ? (
                <Select
                  value={profileForm.preferredLanguage}
                  onValueChange={(value) => setProfileForm({ ...profileForm, preferredLanguage: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("portal_profile.select_language")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{t("portal_profile.arabic")}</SelectItem>
                    <SelectItem value="en">{t("portal_profile.english")}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {beneficiary.preferredLanguage === "ar"
                      ? t("portal_profile.arabic")
                      : beneficiary.preferredLanguage === "en"
                        ? t("portal_profile.english")
                        : t("portal_profile.not_provided")}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">{t("portal_profile.address")}</Label>
              {isEditingProfile ? (
                <Input
                  id="address"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                  placeholder={t("portal_profile.address_placeholder")}
                />
              ) : (
                <div className="flex items-center gap-2 p-3 border rounded-md">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{beneficiary.address || t("portal_profile.not_provided")}</span>
                </div>
              )}
            </div>
          </div>

          {isEditingProfile && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? t("portal_profile.saving") : t("portal_profile.save_changes")}
              </Button>
              <Button variant="outline" onClick={handleCancelEdit}>
                {t("portal_profile.cancel")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t("portal_profile.change_password")}
          </CardTitle>
          <CardDescription>
            {t("portal_profile.change_password_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isChangingPassword ? (
            <Button onClick={() => setIsChangingPassword(true)}>
              {t("portal_profile.change_password")}
            </Button>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t("portal_profile.current_password")} *</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      placeholder={t("portal_profile.current_password_placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t("portal_profile.new_password")} *</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      placeholder={t("portal_profile.new_password_placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("portal_profile.password_requirements")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("portal_profile.confirm_password")} *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder={t("portal_profile.confirm_password_placeholder")}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    changePasswordMutation.isPending ||
                    !passwordForm.currentPassword ||
                    !passwordForm.newPassword ||
                    !passwordForm.confirmPassword
                  }
                >
                  {changePasswordMutation.isPending ? t("portal_profile.changing") : t("portal_profile.change_password")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  }}
                >
                  {t("portal_profile.cancel")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
