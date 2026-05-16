export type FieldIssueStatus = {
  status?: string | null;
};

export function effectiveFieldIssueStatus(issue: FieldIssueStatus): string {
  const status = issue.status?.trim();
  return status ? status.toUpperCase() : 'OPEN';
}

export function isOpenFieldIssue(issue: FieldIssueStatus): boolean {
  return effectiveFieldIssueStatus(issue) !== 'RESOLVED';
}

export function countOpenFieldIssues<T extends FieldIssueStatus>(issues: T[]): number {
  return issues.filter(isOpenFieldIssue).length;
}
