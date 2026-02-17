import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, LogIn, UserPlus, AlertCircle, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

const STORAGE_KEY = "israel-spotter-remember";

function getSavedCredentials() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

export default function Auth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const saved = getSavedCredentials();
  const [email, setEmail] = useState(saved?.email || "");
  const [password, setPassword] = useState(saved?.password || "");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(!!saved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("login");

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  // Auto-login if saved credentials exist
  useEffect(() => {
    const tryAutoLogin = async () => {
      const creds = getSavedCredentials();
      if (creds?.email && creds?.password && !user && !loading) {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (error) {
          localStorage.removeItem(STORAGE_KEY);
          setError("הכניסה האוטומטית נכשלה, נסה שוב");
        }
        setLoading(false);
      }
    };
    tryAutoLogin();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else if (rememberMe) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setError(error.message);
    } else if (rememberMe) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md gold-border gold-glow">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <MapPin className="h-8 w-8 text-accent" />
          </div>
          <CardTitle className="text-3xl font-bold">Israel Spotter</CardTitle>
          <CardDescription>התחבר כדי לגשת למערכת</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="login" className="gap-2">
                <LogIn className="h-4 w-4" />
                כניסה
              </TabsTrigger>
              <TabsTrigger value="signup" className="gap-2">
                <UserPlus className="h-4 w-4" />
                הרשמה
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="login-email">אימייל</Label>
                  <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" required className="border-accent/30 focus-visible:ring-accent text-right" />
                </div>
                <div>
                  <Label htmlFor="login-password">סיסמה</Label>
                  <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" required className="border-accent/30 focus-visible:ring-accent text-right" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" checked={rememberMe} onCheckedChange={(c) => setRememberMe(!!c)} />
                  <Label htmlFor="remember" className="text-sm cursor-pointer">זכור אותי</Label>
                </div>
                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <LogIn className="h-4 w-4 ml-2" />}
                  התחבר
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="signup-name">שם תצוגה</Label>
                  <Input id="signup-name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="אופציונלי" className="border-accent/30 focus-visible:ring-accent text-right" />
                </div>
                <div>
                  <Label htmlFor="signup-email">אימייל</Label>
                  <Input id="signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" required className="border-accent/30 focus-visible:ring-accent text-right" />
                </div>
                <div>
                  <Label htmlFor="signup-password">סיסמה</Label>
                  <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" minLength={6} required className="border-accent/30 focus-visible:ring-accent text-right" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="remember-signup" checked={rememberMe} onCheckedChange={(c) => setRememberMe(!!c)} />
                  <Label htmlFor="remember-signup" className="text-sm cursor-pointer">זכור אותי</Label>
                </div>
                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <UserPlus className="h-4 w-4 ml-2" />}
                  הרשם
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
