import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { signOutAll } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { openStripePortal } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const [notifications, setNotifications] = useState(true);
  const { credits, uid } = useCredits();
  const { t, language, changeLanguage, availableLanguages } = useI18n();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOutAll();
    navigate("/auth");
  };

  const handleDeleteAccount = () => {
    const subject = encodeURIComponent("Delete Account Request");
    const body = encodeURIComponent(`User ID: ${uid}\nEmail: Please delete my account and all associated data.`);
    window.location.href = `mailto:support@mybodyscanapp.com?subject=${subject}&body=${body}`;
  };


  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <Seo title="Settings - MyBodyScan" description="Manage your preferences and data." />
        <h1 className="text-2xl font-semibold text-foreground">{t('settings.title')}</h1>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.notifications')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Scan reminders</Label>
                <p className="text-sm text-muted-foreground">Get notified when it's time for your next scan</p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Interface language</Label>
              <Select value={language} onValueChange={changeLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLanguages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang === 'en' ? 'English' : lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Legal & Account */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.legal')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <a href="/legal/privacy" className="block text-sm underline hover:text-primary">
                Privacy Policy
              </a>
              <a href="/legal/terms" className="block text-sm underline hover:text-primary">
                Terms of Service  
              </a>
              <a href="/legal/refund" className="block text-sm underline hover:text-primary">
                Refund Policy
              </a>
            </div>
            <div className="space-y-2">
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                className="w-full"
              >
                {t('settings.delete_account')}
              </Button>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="w-full"
              >
                {t('settings.sign_out')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
};

export default Settings;
