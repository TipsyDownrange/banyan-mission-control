import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kID = searchParams.get('kID') || '';
  
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Install_Tracking!A2:S5000',
    });
    
    const rows = (res.data.values || []).map(r => ({
      install_id: r[0] || '',
      kID: r[1] || '',
      location_ref: r[2] || '',
      system_type: r[3] || '',
      system_ref: r[4] || '',
      step_name: r[5] || '',
      step_sequence: parseInt(r[6]) || 0,
      hours_assigned: parseFloat(r[7]) || 0,
      hours_completed: parseFloat(r[8]) || 0,
      pct_complete: parseFloat(r[9]) || 0,
      status: r[10] || 'Not Started',
      assigned_to: r[11] || '',
      target_date: r[12] || '',
      completed_date: r[13] || '',
      qc_passed: r[14] === 'TRUE',
      qc_notes: r[15] || '',
      evidence_ref: r[16] || '',
    }));
    
    const filtered = kID ? rows.filter(r => r.kID === kID) : rows;
    
    const projects = [...new Set(filtered.map(r => r.kID).filter(Boolean))];
    const summary = projects.map(pid => {
      const pRows = filtered.filter(r => r.kID === pid);
      const total = pRows.length;
      const complete = pRows.filter(r => r.status === 'Complete').length;
      const inProgress = pRows.filter(r => r.status === 'In Progress').length;
      const qcPassed = pRows.filter(r => r.qc_passed).length;
      const qcFailed = pRows.filter(r => r.status === 'Failed QC').length;
      const locations = [...new Set(pRows.map(r => r.location_ref))];
      const systems = [...new Set(pRows.map(r => r.system_type).filter(Boolean))];
      const hoursAssigned = pRows.reduce((s, r) => s + r.hours_assigned, 0);
      const hoursCompleted = pRows.reduce((s, r) => s + r.hours_completed, 0);
      return {
        kID: pid,
        totalSteps: total,
        completedSteps: complete,
        inProgressSteps: inProgress,
        notStartedSteps: total - complete - inProgress - qcFailed,
        qcFailed,
        pctComplete: total > 0 ? Math.round((complete / total) * 100) : 0,
        qcPassRate: complete > 0 ? Math.round((qcPassed / complete) * 100) : 0,
        locationCount: locations.length,
        locations,
        systems,
        hoursAssigned,
        hoursCompleted,
        hoursRemaining: hoursAssigned - hoursCompleted,
      };
    });
    
    return NextResponse.json({ items: filtered, summary, total: filtered.length });
  } catch (err) {
    console.error('Install tracking error:', err);
    return NextResponse.json({ error: 'Failed to load install data', detail: String(err) }, { status: 500 });
  }
}
