import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useAuthUser } from '@/lib/auth';
import { useCredits } from '@/hooks/useCredits';
import { ALLOWED_HOSTS, FUNCTIONS_BASE, HAS_USDA } from '@/lib/env';
import { resolveApiUrl } from '@/lib/api';

interface HealthSnapshot {
  ok: boolean;
  projectId?: string;
  timestamp?: string;
  hostingUrl?: string | null;
}

function prettyHosts(hosts: string[]): string {
  return hosts.length ? hosts.join(', ') : 'Any';
}

export default function Ops() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { tester, demo, projectId } = useCredits();
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const allowedDeveloper = useMemo(() => {
    const email = user?.email?.toLowerCase();
    return Boolean(email && tester && email === 'developer@adlrlabs.com');
  }, [user?.email, tester]);

  useEffect(() => {
    if (!allowedDeveloper && user && !demo) {
      toast({
        title: 'Access restricted',
        description: 'The /ops console is limited to developer accounts.',
        variant: 'destructive',
      });
      navigate('/today', { replace: true });
    }
  }, [allowedDeveloper, user, demo, navigate]);

  useEffect(() => {
    if (allowedDeveloper) {
      void fetchHealth();
    }
  }, [allowedDeveloper, fetchHealth]);

  const fetchHealth = useCallback(async () => {
    setHealthError(null);
    setHealthLoading(true);
    try {
      const response = await fetch('/system/health');
      if (!response.ok) {
        throw new Error(`status_${response.status}`);
      }
      const data = (await response.json()) as HealthSnapshot;
      setHealth(data);
      toast({ title: 'System health OK', description: data.projectId });
    } catch (error: any) {
      const message = error?.message ?? 'health_check_failed';
      setHealthError(message);
      toast({ title: 'System health check failed', description: message, variant: 'destructive' });
    } finally {
      setHealthLoading(false);
    }
  }, [toast]);

  async function refreshClaims() {
    try {
      await user?.getIdToken(true);
      toast({ title: 'Claims refreshed' });
    } catch (error: any) {
      toast({ title: 'Unable to refresh claims', description: error?.message ?? 'unknown error', variant: 'destructive' });
    }
  }

  async function seedDemo() {
    try {
      const url = resolveApiUrl('/api/admin/seed-demo');
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) {
        throw new Error(`seed_status_${response.status}`);
      }
      toast({ title: 'Demo seed requested', description: 'Check logs for progress.' });
    } catch (error: any) {
      toast({
        title: 'Seed script unavailable',
        description: 'Run `npm run seed:dev` locally to provision the developer account.',
      });
    }
  }

  function purgeStorage() {
    try {
      localStorage.clear();
      sessionStorage.clear();
      toast({ title: 'Storage cleared', description: 'Reloading…' });
    } catch (error: any) {
      toast({ title: 'Failed to clear storage', description: error?.message ?? 'unknown error', variant: 'destructive' });
      return;
    }
    setTimeout(() => window.location.reload(), 300);
  }

  const opsInfo = [
    { label: 'Project ID (client)', value: projectId ?? 'unknown' },
    { label: 'Functions base', value: FUNCTIONS_BASE || 'default rewrite' },
    { label: 'Allowed hosts', value: prettyHosts(ALLOWED_HOSTS) },
    { label: 'USDA key detected', value: HAS_USDA ? 'Yes' : 'No (OFF fallback active)' },
  ];

  const healthItems = [
    { label: 'Status', value: health?.ok ? 'ok' : 'unknown' },
    { label: 'Project (api)', value: health?.projectId ?? 'unknown' },
    { label: 'Timestamp', value: health?.timestamp ?? '—' },
    { label: 'Hosting URL', value: health?.hostingUrl ?? '—' },
  ];

  if (!allowedDeveloper) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Developer access required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The operations console is restricted to developer accounts. Sign in as developer@adlrlabs.com or contact the
                team to request access.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Operations console</h1>
            <p className="text-sm text-muted-foreground">Internal tools for verifying production readiness.</p>
          </div>
          <Badge variant="secondary">developer</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {opsInfo.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
                <div className="text-sm font-medium text-foreground break-all">{item.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>System health</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={healthLoading}>
              {healthLoading ? 'Checking…' : 'Ping /system/health'}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {healthItems.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
                <div className="text-sm font-medium text-foreground break-all">{item.value}</div>
              </div>
            ))}
            {healthError ? (
              <p className="text-sm text-destructive">Last error: {healthError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="default" onClick={seedDemo}>
              Seed Demo
            </Button>
            <Button variant="outline" onClick={refreshClaims}>
              Refresh Claims
            </Button>
            <Button variant="outline" onClick={purgeStorage}>
              Purge Local Storage
            </Button>
            <Button variant="outline" onClick={fetchHealth} disabled={healthLoading}>
              Call /system/health
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
