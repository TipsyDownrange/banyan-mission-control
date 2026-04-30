import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';
import {
  buildCrosswalkDiagnostics,
  ensureEntityCrosswalkSheet,
  getCrosswalkSheets,
  loadCrosswalkEntries,
  normalizeConfidence,
  normalizeCrosswalkSource,
  upsertCrosswalkEntry,
} from '@/lib/entityCrosswalk';

export async function GET(req: Request) {
  const { allowed } = await checkPermission(req, 'wo:view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:view required' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const customerId = (searchParams.get('customer_id') || '').trim();
    const sheets = getCrosswalkSheets();
    await ensureEntityCrosswalkSheet(sheets);
    const entries = await loadCrosswalkEntries(sheets, customerId || undefined);
    const allEntries = customerId ? await loadCrosswalkEntries(sheets) : entries;
    const diagnostics = await buildCrosswalkDiagnostics(sheets, allEntries);
    return NextResponse.json({
      crosswalk: customerId ? entries[0] || null : entries,
      entries,
      total: entries.length,
      diagnostics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { allowed } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });

  try {
    const body = await req.json();
    const sheets = getCrosswalkSheets();
    const entry = await upsertCrosswalkEntry(sheets, {
      customer_id: String(body.customer_id || ''),
      org_id: String(body.org_id || ''),
      source: normalizeCrosswalkSource(body.source),
      confidence: normalizeConfidence(body.confidence),
      updated_at: body.updated_at,
    });
    return NextResponse.json({ ok: true, crosswalk: entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const { allowed } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });

  try {
    const body = await req.json();
    const sheets = getCrosswalkSheets();
    const entry = await upsertCrosswalkEntry(sheets, {
      customer_id: String(body.customer_id || ''),
      org_id: String(body.org_id || ''),
      source: normalizeCrosswalkSource(body.source),
      confidence: normalizeConfidence(body.confidence),
      updated_at: body.updated_at,
    });
    return NextResponse.json({ ok: true, crosswalk: entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
