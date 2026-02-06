import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL") ?? "";

const SQL_EDITOR_ADMIN_TOKEN = Deno.env.get("SQL_EDITOR_ADMIN_TOKEN") ?? "";
const SQL_EDITOR_ALLOWED_EMAILS = Deno.env.get("SQL_EDITOR_ALLOWED_EMAILS") ?? "";
const SQL_EDITOR_MAX_ROWS = Number(Deno.env.get("SQL_EDITOR_MAX_ROWS") ?? "200");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-token, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_DB_URL) {
    return jsonResponse(500, { error: "Supabase env vars missing" });
  }

  let userId: string | null = null;
  let userEmail: string | null = null;
  let authMode: "admin_token" | "user" = "admin_token";

  if (SQL_EDITOR_ADMIN_TOKEN) {
    const token = req.headers.get("x-admin-token") ?? "";
    if (token !== SQL_EDITOR_ADMIN_TOKEN) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader || !SUPABASE_ANON_KEY) {
      return jsonResponse(401, { error: "Authorization required" });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) {
      return jsonResponse(401, { error: "Invalid user" });
    }
    authMode = "user";
    userId = data.user.id;
    userEmail = data.user.email ?? null;
    if (SQL_EDITOR_ALLOWED_EMAILS) {
      const allowed = SQL_EDITOR_ALLOWED_EMAILS.split(",").map((v) => v.trim()).filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(data.user.email ?? "")) {
        return jsonResponse(403, { error: "Forbidden" });
      }
    }
  }

  const body = await req.json().catch(() => null);
  const sql = typeof body?.sql === "string" ? body.sql.trim() : "";
  const maxRows = Math.min(
    Math.max(Number(body?.maxRows ?? SQL_EDITOR_MAX_ROWS), 1),
    1000,
  );

  if (!sql) {
    return jsonResponse(400, { error: "SQL is required" });
  }
  if (sql.length > 5000) {
    return jsonResponse(400, { error: "SQL too long" });
  }

  const lowered = sql.toLowerCase();
  if (!/^(with|select)\b/.test(lowered)) {
    return jsonResponse(400, { error: "Only SELECT/CTE queries are allowed" });
  }
  if (lowered.includes(";") && !/;\s*$/.test(lowered)) {
    return jsonResponse(400, { error: "Multiple statements are not allowed" });
  }
  const blocked = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "grant",
    "revoke",
    "truncate",
    "vacuum",
    "copy",
    "call",
    "execute",
    "commit",
    "rollback",
    "set",
  ];
  if (blocked.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(lowered))) {
    return jsonResponse(400, { error: "Read-only queries only" });
  }

  let finalSql = sql.replace(/;\s*$/, "");
  if (!/\blimit\b/i.test(finalSql)) {
    finalSql = `${finalSql} limit ${maxRows}`;
  }

  const db = postgres(SUPABASE_DB_URL, { max: 1 });
  const startedAt = Date.now();
  const logClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  try {
    const rows = await db.unsafe(finalSql);
    const durationMs = Date.now() - startedAt;
    await logClient.from("sql_editor_logs").insert({
      user_id: userId,
      user_email: userEmail,
      sql_text: finalSql,
      rows_returned: rows.length ?? 0,
      duration_ms: durationMs,
      status: "success",
      auth_mode: authMode,
    });
    return jsonResponse(200, { rows, duration_ms: durationMs });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await logClient.from("sql_editor_logs").insert({
      user_id: userId,
      user_email: userEmail,
      sql_text: finalSql,
      rows_returned: 0,
      duration_ms: durationMs,
      status: "error",
      error_message: err instanceof Error ? err.message : "Query failed",
      auth_mode: authMode,
    });
    return jsonResponse(400, { error: err instanceof Error ? err.message : "Query failed" });
  } finally {
    await db.end({ timeout: 2 });
  }
});

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
