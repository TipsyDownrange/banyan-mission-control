import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import {
  passSuggestionsAuthGate,
  passSuggestionsReviewGate,
} from '@/lib/suggestions/api-gate';

const SHEET_ID = getBackendSheetId();

export async function POST(req: Request) {
  const gate = await passSuggestionsAuthGate(req);
  if (!gate.ok) return gate.response;

  const { description, email, name } = await req.json();
  if (!description) return NextResponse.json({ error: 'No description' }, { status: 400 });

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const id = `SUG-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const userName = name || email || gate.actorEmail || 'Unknown';

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Suggestions!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          id,
          email || gate.actorEmail || '',
          userName,
          description,
          '', // kai_interpretation (to be filled by Kai)
          '', // category
          'New',
          now,
          '',
          '',
        ]],
      },
    });

    // Also create a Task so the suggestion is visible on the Task Board
    const taskId = `TSK-SUG-${Date.now()}`;
    const taskTitle = `[SUGGESTION] ${description.slice(0, 60)}`;
    const taskDetail = `${description} | From: ${userName} (${email || gate.actorEmail || ''}) at ${now}`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Tasks!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          taskId,       // Task_ID
          taskTitle,    // Title
          taskDetail,   // Detail
          'queued',     // Status
          'medium',     // Priority
          'Suggestion', // Category
          'Kai',        // Assigned_To
          now,          // Created_At
          now,          // Updated_At
          '',           // Due_Date
          '',           // Blocked_By
          '',           // Parent_Task_ID
        ]],
      },
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const gate = await passSuggestionsReviewGate(req);
  if (!gate.ok) return gate.response;

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Suggestions!A2:J500' });
    const rows = (res.data.values || []).map(r => ({
      id: r[0], email: r[1], name: r[2], description: r[3],
      kai_interpretation: r[4], category: r[5], status: r[6],
      created_at: r[7], reviewed_at: r[8], notes: r[9],
    }));
    return NextResponse.json({ suggestions: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err), suggestions: [] }, { status: 500 });
  }
}
