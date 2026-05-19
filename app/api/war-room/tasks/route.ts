import { NextResponse } from 'next/server';
import {
  buildWarRoomLinearDescription,
  buildWarRoomLinearIssuePayload,
  buildWarRoomLinearLabels,
  validateWarRoomTaskIntake,
} from '@/lib/war-room/commandBridge';
import { passWarRoomTaskGate } from '@/lib/war-room/api-gate';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

interface LinearCreateIssueResponse {
  data?: {
    issueCreate?: {
      success?: boolean;
      issue?: {
        id: string;
        identifier: string;
        url: string;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function POST(request: Request) {
  const gate = await passWarRoomTaskGate(request);
  if (!gate.ok) return gate.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validateWarRoomTaskIntake(payload, gate.actorEmail);
  if (!validation.ok || !validation.intake) {
    return NextResponse.json({ error: 'Invalid War Room intake', details: validation.errors }, { status: 400 });
  }

  const intake = validation.intake;
  const linearApiKey = process.env.LINEAR_API_KEY;
  const linearTeamId = process.env.LINEAR_TEAM_ID || process.env.LINEAR_BANYANOS_TEAM_ID;
  const labels = buildWarRoomLinearLabels(intake);
  const description = buildWarRoomLinearDescription(intake);

  if (!linearApiKey || !linearTeamId) {
    return NextResponse.json({
      ok: true,
      mode: 'preview',
      message: 'War Room intake validated. Linear creation is disabled until LINEAR_API_KEY and LINEAR_TEAM_ID are configured.',
      intake,
      linearPreview: {
        title: intake.title,
        description,
        labels,
      },
    }, { status: 202 });
  }

  try {
    const issue = await createLinearIssue(linearApiKey, buildWarRoomLinearIssuePayload(intake, linearTeamId));

    return NextResponse.json({
      ok: true,
      mode: 'linear',
      intake: {
        ...intake,
        linkedLinearIssueId: issue.id,
        linkedLinearIdentifier: issue.identifier,
        linkedLinearUrl: issue.url,
      },
      linearIssue: issue,
      linearMetadata: {
        labels,
        description,
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Linear issue creation failed',
      details: error instanceof Error ? error.message : String(error),
      safeFailure: 'No agents were dispatched and no non-Linear systems were written.',
    }, { status: 502 });
  }
}

async function createLinearIssue(apiKey: string, input: ReturnType<typeof buildWarRoomLinearIssuePayload>) {
  const mutation = `
    mutation WarRoomIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query: mutation, variables: { input } }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Linear write failed: ${response.status}`);
  }

  const payload = await response.json() as LinearCreateIssueResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(error => error.message).join('; '));
  }

  const issue = payload.data?.issueCreate?.issue;
  if (!payload.data?.issueCreate?.success || !issue) {
    throw new Error('Linear did not return a created issue');
  }

  return issue;
}
