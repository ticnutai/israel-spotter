/// <reference types="https://esm.sh/@supabase/functions-js@2.96.0/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sql } = await req.json();

    if (!sql || typeof sql !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid SQL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use the REST API to execute SQL via pg_net or direct postgres connection
    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
    
    // Use postgres connection
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const pgSql = postgres(dbUrl, { max: 1 });

    const statements = sql
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    const results: Array<{ statement: string; success: boolean; rows?: any[]; rowCount?: number; error?: string }> = [];

    for (const stmt of statements) {
      try {
        const rows = await pgSql.unsafe(stmt);
        results.push({
          statement: stmt.substring(0, 200),
          success: true,
          rows: Array.isArray(rows) ? rows.slice(0, 100) : [],
          rowCount: Array.isArray(rows) ? rows.length : 0,
        });
      } catch (err: any) {
        results.push({
          statement: stmt.substring(0, 200),
          success: false,
          error: err.message || String(err),
        });
      }
    }

    await pgSql.end();

    const allSuccess = results.every((r) => r.success);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        results,
        summary: {
          total: results.length,
          succeeded: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
