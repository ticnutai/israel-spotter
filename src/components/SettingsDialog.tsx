import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Play, Upload, Loader2, CheckCircle2, XCircle, AlertTriangle, FileCode, Trash2, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
interface MigrationResult {
  statement: string;
  success: boolean;
  rows?: any[];
  rowCount?: number;
  error?: string;
}

interface RunSqlResponse {
  success: boolean;
  error?: string;
  results?: MigrationResult[];
  summary?: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

export function SettingsDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<RunSqlResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserEmail(user?.email ?? null);
  };

  const handleLogout = async () => {
    localStorage.removeItem("kfar_remember_me");
    await supabase.auth.signOut();
    setOpen(false);
    navigate("/auth");
  };

  const runMigration = async (sqlText: string) => {
    if (!sqlText.trim()) return;
    setRunning(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke("run-sql", {
        body: { sql: sqlText },
      });

      if (error) {
        setResponse({ success: false, error: error.message });
      } else {
        setResponse(data as RunSqlResponse);
      }
    } catch (err: any) {
      setResponse({ success: false, error: err.message || "שגיאה לא ידועה" });
    } finally {
      setRunning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setSql(text);
    e.target.value = "";
  };

  const clearAll = () => {
    setSql("");
    setResponse(null);
    setFileName(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="הגדרות" className="h-10 w-10 rounded-full shadow-lg bg-background hover:bg-accent border-border">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle>הגדרות</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="account" className="flex-1" onValueChange={(v) => { if (v === 'account') loadUser(); }}>
          <TabsList className="w-full">
            <TabsTrigger value="account" className="gap-2 flex-1">
              <User className="h-4 w-4" />
              חשבון
            </TabsTrigger>
            <TabsTrigger value="dev" className="gap-2 flex-1">
              <FileCode className="h-4 w-4" />
              פיתוח
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-4 space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">פרטי חשבון</h3>
              {userEmail && (
                <p className="text-sm text-muted-foreground">{userEmail}</p>
              )}
              <Separator />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  ניתוק החשבון ימחק את "זכור אותי" ויחזיר למסך הכניסה.
                </p>
                <Button variant="destructive" onClick={handleLogout} className="w-full gap-2">
                  <LogOut className="h-4 w-4" />
                  התנתק מהמערכת
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dev" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">הרצת מיגרציות SQL</h3>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sql,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 ml-1" />
                    העלאת קובץ
                  </Button>
                  {sql && (
                    <Button variant="ghost" size="sm" onClick={clearAll}>
                      <Trash2 className="h-3.5 w-3.5 ml-1" />
                      נקה
                    </Button>
                  )}
                </div>
              </div>

              {fileName && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileCode className="h-3 w-3" />
                  {fileName}
                </div>
              )}

              <textarea
                className="w-full h-48 font-mono text-sm bg-muted/50 border rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"-- הכנס פקודות SQL כאן...\nCREATE TABLE example (id SERIAL PRIMARY KEY);\nALTER TABLE example ADD COLUMN name TEXT;"}
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                dir="ltr"
              />

              <Button
                onClick={() => runMigration(sql)}
                disabled={running || !sql.trim()}
                className="w-full"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                ) : (
                  <Play className="h-4 w-4 ml-1" />
                )}
                {running ? "מריץ..." : "הרץ מיגרציה"}
              </Button>
            </div>

            {/* Results */}
            {response && (
              <div className="space-y-3">
                {/* Summary */}
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border ${
                    response.success
                      ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  }`}
                >
                  {response.success ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0" />
                  )}
                  <div className="text-sm">
                    {response.error && !response.results ? (
                      <span>שגיאה: {response.error}</span>
                    ) : response.summary ? (
                      <span>
                        {response.summary.succeeded} מתוך {response.summary.total} פקודות הצליחו
                        {response.summary.failed > 0 && (
                          <span className="text-destructive mr-2">
                            ({response.summary.failed} נכשלו)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>{response.success ? "הושלם בהצלחה" : "נכשל"}</span>
                    )}
                  </div>
                </div>

                {/* Per-statement results */}
                {response.results && (
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {response.results.map((r, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-md border text-xs ${
                            r.success
                              ? "bg-card border-border"
                              : "bg-destructive/5 border-destructive/30"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {r.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <pre className="font-mono whitespace-pre-wrap break-all text-muted-foreground" dir="ltr">
                                {r.statement}
                                {r.statement.length >= 200 && "..."}
                              </pre>
                              {r.success && r.rowCount !== undefined && r.rowCount > 0 && (
                                <div className="mt-1 text-muted-foreground">
                                  {r.rowCount} שורות הושפעו
                                </div>
                              )}
                              {r.error && (
                                <div className="mt-2 p-2 bg-destructive/10 rounded text-destructive font-mono" dir="ltr">
                                  <div className="flex items-center gap-1 mb-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="font-semibold">Error:</span>
                                  </div>
                                  {r.error}
                                </div>
                              )}
                              {r.success && r.rows && r.rows.length > 0 && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    הצג תוצאות ({r.rows.length} שורות)
                                  </summary>
                                  <pre className="mt-1 p-2 bg-muted rounded font-mono text-[10px] overflow-x-auto" dir="ltr">
                                    {JSON.stringify(r.rows, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
