import { google } from 'googleapis';
import { normalizeKID } from './normalize-kid';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Using shared normalizeKID from normalize-kid.ts
const normalizeJobId = (value: string) => normalizeKID(value);

function matchesJobId(candidate: string, jobIds: Set<string>): boolean {
  return jobIds.has(normalizeJobId(candidate || ''));
}

export async function deriveWorkOrderStatus(params: {
  woId?: string;
  woNumber?: string;
  sheets?: ReturnType<typeof google.sheets>;
}): Promise<'new' | 'estimated' | 'scheduled' | 'in_progress' | 'completed'> {
  const jobIds = new Set(
    [params.woId || '', params.woNumber || '']
      .map(normalizeJobId)
      .filter(Boolean)
  );

  if (jobIds.size === 0) return 'new';

  const sheets = params.sheets ?? google.sheets({
    version: 'v4',
    auth: getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']),
  });

  const [plansRes, stepsRes, completionsRes, dispatchRes, estimatesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Plans!A2:G5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Install_Steps!A2:P5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Step_Completions!A2:I5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:P5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Carls_Method!A2:D5000' }),
  ]);

  const plans = (plansRes.data.values || []).filter(row =>
    row[2] !== '__JOB_DOCS__' && matchesJobId(row[1] || '', jobIds)
  );
  const planIds = new Set(plans.map(row => row[0]).filter(Boolean));
  const steps = (stepsRes.data.values || []).filter(row => planIds.has(row[1] || ''));
  const stepIds = new Set(steps.map(row => row[0]).filter(Boolean));
  const completions = (completionsRes.data.values || []).filter(row => stepIds.has(row[1] || ''));

  const hasEstimate = (estimatesRes.data.values || []).some(row =>
    matchesJobId(row[1] || '', jobIds)
  );

  if (steps.length == 0) {
    return hasEstimate ? 'estimated' : 'new';
  }

  if (completions.length == 0) {
    const hasDispatchSlot = (dispatchRes.data.values || []).some(row =>
      matchesJobId(row[2] || '', jobIds) || matchesJobId(row[3] || '', jobIds)
    );
    return hasDispatchSlot ? 'scheduled' : 'estimated';
  }

  const completionByStep = new Map<string, number>();
  for (const row of completions) {
    const stepId = row[1] || '';
    const percent = parseFloat(row[6] || '0');
    const existing = completionByStep.get(stepId) ?? 0;
    completionByStep.set(stepId, Math.max(existing, Number.isFinite(percent) ? percent : 0));
  }

  const allStepsComplete = steps.every(row => (completionByStep.get(row[0] || '') ?? 0) >= 100);
  if (allStepsComplete) {
    return 'completed';
  }

  // Any completion row means field work has started even if other steps do not have rows yet.
  return 'in_progress';
}
