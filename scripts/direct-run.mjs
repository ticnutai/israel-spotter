// Direct Migration Runner for Kfar Chabad GIS (meida)
// Uses the run-sql Edge Function to execute SQL directly
// No admin login needed - the Edge Function has verify_jwt = false

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Supabase configuration (meida project) ─────────────────────────────────
const SUPABASE_URL = 'https://txltujmbkhsszpvsgujs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw';

// ─── Run SQL via Edge Function ──────────────────────────────────────────────

async function runSQL(sql) {
  const url = `${SUPABASE_URL}/functions/v1/run-sql`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Edge Function error ${resp.status}: ${text}`);
  }

  return await resp.json();
}

// ─── Run a migration ────────────────────────────────────────────────────────

async function runMigration(name, sql) {
  console.log(`\n🚀 Running migration: ${name}`);
  console.log('─'.repeat(50));

  try {
    const result = await runSQL(sql);
    const summary = result.summary || {};

    if (result.success) {
      console.log(`✅ Migration completed successfully!`);
      console.log(`   ${summary.succeeded || 0} statements executed`);
    } else {
      console.log(`⚠️  Migration completed with errors:`);
      console.log(`   Succeeded: ${summary.succeeded || 0}`);
      console.log(`   Failed: ${summary.failed || 0}`);

      // Show failures
      for (const r of (result.results || [])) {
        if (!r.success) {
          const stmt = r.statement || '';
          const err = r.error || '';
          // Skip "already exists" which is fine for idempotent migrations
          if (err.toLowerCase().includes('already exists')) {
            continue;
          }
          console.log(`   ❌ ${stmt.substring(0, 80)}...`);
          console.log(`      ${err}`);
        }
      }
    }

    return result;
  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Run pending migrations from JSON ───────────────────────────────────────

async function runPendingMigrations() {
  const pendingPath = path.join(__dirname, '..', 'public', 'pending-migrations.json');

  if (!fs.existsSync(pendingPath)) {
    console.log('ℹ️  No pending-migrations.json found');
    return;
  }

  const content = fs.readFileSync(pendingPath, 'utf-8');
  const data = JSON.parse(content);
  const pending = data.migrations.filter(m => m.status === 'pending');

  if (pending.length === 0) {
    console.log('ℹ️  No pending migrations');
    return;
  }

  console.log(`\n📋 Found ${pending.length} pending migration(s)\n`);

  for (const migration of pending) {
    console.log(`📦 ${migration.name}`);
    if (migration.description) console.log(`   ${migration.description}`);

    const result = await runMigration(migration.name, migration.sql);

    migration.status = result.success ? 'completed' : 'failed';
    migration.executedAt = new Date().toISOString();
    if (!result.success) {
      migration.errorMessage = result.error;
    }
  }

  fs.writeFileSync(pendingPath, JSON.stringify(data, null, 2));
  console.log('\n✅ Updated pending-migrations.json');
}

// ─── Query helper (for SELECT statements) ───────────────────────────────────

async function runQuery(sql) {
  console.log(`\n🔍 Running query...`);
  console.log('─'.repeat(50));

  try {
    const result = await runSQL(sql);
    const firstResult = (result.results || [])[0];

    if (firstResult && firstResult.success) {
      const rows = firstResult.rows || [];
      if (rows.length === 0) {
        console.log('ℹ️  No rows returned');
      } else {
        // Pretty-print as table
        console.table(rows);
        console.log(`\n📊 ${rows.length} row(s) returned`);
      }
    } else {
      console.error('❌ Query failed:', firstResult?.error || 'Unknown error');
    }

    return result;
  } catch (err) {
    console.error(`❌ Query failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Reload PostgREST schema cache ──────────────────────────────────────────

async function reloadSchema() {
  console.log('\n🔄 Reloading PostgREST schema cache...');

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    // Also send NOTIFY to reload schema
    await runSQL("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema cache reload requested');
  } catch (err) {
    console.log(`⚠️  Schema reload: ${err.message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(50));
  console.log('   🔧 Direct Migration Runner (meida)');
  console.log('═'.repeat(50));
  console.log(`☁️  Project: ${SUPABASE_URL}`);

  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'pending':
      await runPendingMigrations();
      break;

    case 'sql': {
      const sql = args[1];
      if (!sql) {
        console.error('❌ Please provide SQL');
        console.log('Usage: node scripts/direct-run.mjs sql "SELECT 1"');
        process.exit(1);
      }
      await runQuery(sql);
      break;
    }

    case 'file': {
      const filePath = args[1];
      if (!filePath) {
        console.error('❌ Please provide file path');
        console.log('Usage: node scripts/direct-run.mjs file "supabase/migrations/002_enrich_tables.sql"');
        process.exit(1);
      }
      const fullPath = path.resolve(filePath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${fullPath}`);
        process.exit(1);
      }
      const fileSql = fs.readFileSync(fullPath, 'utf-8');
      const fileName = path.basename(filePath, '.sql');
      const result = await runMigration(fileName, fileSql);

      // After migration, reload PostgREST schema cache
      if (result.success) {
        await reloadSchema();
      }
      break;
    }

    case 'reload':
      await reloadSchema();
      break;

    default:
      console.log('\n📋 Commands:');
      console.log('  file <path>     - Run SQL migration from file');
      console.log('  sql "..."       - Run SQL query directly');
      console.log('  pending         - Run all pending migrations');
      console.log('  reload          - Reload PostgREST schema cache');
      console.log('\n📌 Examples:');
      console.log('  node scripts/direct-run.mjs file "supabase/migrations/002_enrich_tables.sql"');
      console.log('  node scripts/direct-run.mjs sql "SELECT COUNT(*) FROM plans"');
      console.log('  node scripts/direct-run.mjs sql "SELECT table_name FROM information_schema.tables WHERE table_schema=\'public\'"');
      console.log('  node scripts/direct-run.mjs reload');
  }

  console.log('\n🏁 Done!');
}

main().catch(console.error);
