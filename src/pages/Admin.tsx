import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useClaims } from "@/lib/claims";
import {
  AdminUserRecord,
  adminFetchStripeEvents,
  adminFetchTelemetry,
  adminGrantCredits,
  adminRefreshClaims,
  adminSearchUsers,
  adminToggleUnlimited,
  StripeEventRecord,
  TelemetryEventRecord,
} from "@/lib/admin";
import { APPCHECK_SITE_KEY, STRIPE_PUBLISHABLE_KEY } from "@/lib/flags";
import { buildErrorToast } from "@/lib/errorToasts";

const STAFF_EMAIL_ALLOW = new Set(["developer@adlrlabs.com"]);

function isStaffUser(user: { email?: string | null }, claims: Record<string, unknown> | null): boolean {
  const staffClaim = claims?.staff === true;
  const email = (user.email || "").toLowerCase();
  return staffClaim || STAFF_EMAIL_ALLOW.has(email);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatTimestamp(value: any): string {
  if (!value) return "—";
  if (typeof value === "string") return formatDate(value);
  if (typeof value === "number") return new Date(value * 1000).toLocaleString();
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toLocaleString();
  }
  return "—";
}

function maskStripeKey(): string {
  const key = STRIPE_PUBLISHABLE_KEY || "";
  if (!key) return "Not configured";
  const suffix = key.slice(-6);
  return `${key.startsWith("pk_live") ? "pk_live" : "pk_test"}…${suffix}`;
}

function AppCheckMatrix() {
  const rows = [
    { path: "/api/scan/start", enforced: true },
    { path: "/api/scan/submit", enforced: true },
    { path: "/api/coach/chat", enforced: true },
    { path: "/api/nutrition/search", enforced: true },
    { path: "/api/nutrition/barcode", enforced: true },
    { path: "/telemetry/log", enforced: false },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Endpoint</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.path}>
            <TableCell>{row.path}</TableCell>
            <TableCell>
              <Badge variant={row.enforced ? "default" : "secondary"}>
                {row.enforced ? "App Check enforced" : "Open"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function useIdentityToolkitStatus(): number | null {
  const [status, setStatus] = useState<number | null>(null);
  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent)?.detail as { itk?: number } | undefined;
      if (detail && typeof detail.itk === "number") {
        setStatus(detail.itk);
      }
    }
    window.addEventListener("mbs:boot", handle as EventListener);
    return () => window.removeEventListener("mbs:boot", handle as EventListener);
  }, []);
  return status;
}

function UsersPanel({ users, onRefresh }: { users: AdminUserRecord[]; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function handleGrant(uid: string, amount: number) {
    try {
      setBusy(`${uid}-grant-${amount}`);
      await adminGrantCredits(uid, amount);
      await onRefresh();
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Grant failed", description: "Check logs.", variant: "destructive" },
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleUnlimited(uid: string, value: boolean) {
    try {
      setBusy(`${uid}-toggle`);
      await adminToggleUnlimited(uid, value);
      await onRefresh();
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Toggle failed", description: "Try again later.", variant: "destructive" },
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh(uid: string) {
    try {
      setBusy(`${uid}-refresh`);
      await adminRefreshClaims(uid);
      await onRefresh();
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Refresh failed", description: "Try again later.", variant: "destructive" },
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Credits</TableHead>
          <TableHead>Unlimited</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const unlimited = user.unlimitedClaim || user.unlimitedMirror;
          return (
            <TableRow key={user.uid}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{user.email || "(no email)"}</span>
                  <span className="text-xs text-muted-foreground">{user.uid}</span>
                </div>
              </TableCell>
              <TableCell>{formatDate(user.createdAt)}</TableCell>
              <TableCell>{user.credits ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={unlimited ? "default" : "outline"}>{unlimited ? "Unlimited" : "Metered"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGrant(user.uid, 1)}
                  disabled={busy !== null}
                >
                  +1
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGrant(user.uid, 3)}
                  disabled={busy !== null}
                >
                  +3
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGrant(user.uid, 36)}
                  disabled={busy !== null}
                >
                  +36
                </Button>
                <Button
                  size="sm"
                  variant={unlimited ? "destructive" : "secondary"}
                  onClick={() => handleToggleUnlimited(user.uid, !unlimited)}
                  disabled={busy !== null}
                >
                  {unlimited ? "Disable unlimited" : "Enable unlimited"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRefresh(user.uid)}
                  disabled={busy !== null}
                >
                  Refresh claims
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PaymentsPanel({ events }: { events: StripeEventRecord[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No Stripe events recorded yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>When</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const stripeLink = `https://dashboard.stripe.com/events/${event.id}`;
          return (
            <TableRow key={event.id}>
              <TableCell>
                <a href={stripeLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {event.type}
                </a>
              </TableCell>
              <TableCell>{formatTimestamp(event.created)}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{event.email || "—"}</span>
                  <span className="text-xs text-muted-foreground">{event.uid || ""}</span>
                </div>
              </TableCell>
              <TableCell>{event.priceId || "—"}</TableCell>
              <TableCell>{event.amount != null ? (event.amount / 100).toFixed(2) : "—"}</TableCell>
              <TableCell>{event.status || "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function TelemetryPanel({ events }: { events: TelemetryEventRecord[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No telemetry entries captured yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kind</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>{event.kind || "—"}</TableCell>
            <TableCell className="max-w-sm truncate" title={event.message || undefined}>
              {event.message || "—"}
            </TableCell>
            <TableCell className="max-w-xs truncate" title={event.url || undefined}>
              {event.url || "—"}
            </TableCell>
            <TableCell>{event.code || "—"}</TableCell>
            <TableCell>{formatTimestamp(event.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AdminConsole() {
  const { user, claims, loading } = useClaims();
  const navigate = useNavigate();
  const [query, setQuery] = useState<string>("");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [events, setEvents] = useState<StripeEventRecord[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryEventRecord[]>([]);
  const itkStatus = useIdentityToolkitStatus();

  const authorized = useMemo(() => (user ? isStaffUser(user, claims) : false), [user, claims]);

  const refreshUsers = useCallback(async () => {
    if (!authorized) return;
    setSearching(true);
    try {
      const results = await adminSearchUsers(query.trim());
      setUsers(results);
    } catch (error) {
      console.error("admin_search_error", error);
    } finally {
      setSearching(false);
    }
  }, [authorized, query]);

  useEffect(() => {
    if (!loading && user && !authorized) {
      navigate("/", { replace: true });
    }
  }, [loading, user, authorized, navigate]);

  useEffect(() => {
    if (!authorized) return;
    const handle = window.setTimeout(() => {
      void refreshUsers();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, authorized, refreshUsers]);

  useEffect(() => {
    if (!authorized) return;
    void (async () => {
      try {
        const recent = await adminFetchStripeEvents(10);
        setEvents(recent);
      } catch (error) {
        console.error("admin_events_load_error", error);
      }
      try {
        const logs = await adminFetchTelemetry(50);
        setTelemetry(logs);
      } catch (error) {
        console.error("admin_telemetry_load_error", error);
      }
    })();
  }, [authorized]);

  if (!authorized) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Checking staff access…</p>
      </div>
    );
  }

  const stripeKey = maskStripeKey();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Search users, manage credits, review payments, and monitor telemetry. Staff access only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Health overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-medium">App Check</h3>
            <p className="text-sm text-muted-foreground">
              Site key: {APPCHECK_SITE_KEY ? "configured" : "missing"}
            </p>
            <AppCheckMatrix />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Runtime</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Identity Toolkit status: {itkStatus ?? "pending"}</li>
              <li>Stripe key: {stripeKey}</li>
              <li>Current user: {user?.email || user?.uid}</li>
            </ul>
            <div>
              <Button size="sm" disabled variant="outline">
                Impersonate (preview)
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">Read-only impersonation coming soon.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by email prefix"
              className="max-w-sm"
            />
            {searching && <span className="text-xs text-muted-foreground">Searching…</span>}
          </div>
          <UsersPanel users={users} onRefresh={refreshUsers} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsPanel events={events} />
        </TabsContent>
        <TabsContent value="telemetry">
          <TelemetryPanel events={telemetry} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
