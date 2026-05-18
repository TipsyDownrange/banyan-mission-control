/**
 * BAN-340 PM-V1.0-A — CSI MasterFormat validation + submittal number
 * assembly for the Submittal Log entity.
 *
 * Per PM Trunk v1.0 §5, the submittal_number itself is informationally
 * dense — a PM reading the number knows project, section, subsection, and
 * item without a lookup. Format:
 *
 *   PRJ-YY-NNNN-SUB-{spec_section}-{subsection}-{sub_subsection}
 *     e.g. PRJ-26-0001-SUB-08410-1.3-A
 *
 * Validation rules:
 *   spec_section:    5-digit MF95 (08410) OR 6-digit MF18 (084113)
 *   subsection:      N.N (1.3)  — both halves are digit strings
 *   sub_subsection:  single A-Z OR single 1-9
 */

export const CSI_SPEC_SECTION_RE = /^\d{5}$|^\d{6}$/;
export const CSI_SUBSECTION_RE = /^\d+\.\d+$/;
export const CSI_SUB_SUBSECTION_RE = /^[A-Z]$|^[1-9]$/;

export type CsiCoordinate = {
  csi_spec_section: string;
  csi_subsection: string;
  csi_sub_subsection: string;
};

export type CsiValidationError = {
  field: 'csi_spec_section' | 'csi_subsection' | 'csi_sub_subsection';
  message: string;
};

export function validateCsiCoordinate(input: Partial<CsiCoordinate>): CsiValidationError[] {
  const errors: CsiValidationError[] = [];
  const spec = (input.csi_spec_section ?? '').trim();
  const sub = (input.csi_subsection ?? '').trim();
  const subSub = (input.csi_sub_subsection ?? '').trim();

  if (!CSI_SPEC_SECTION_RE.test(spec)) {
    errors.push({
      field: 'csi_spec_section',
      message: 'csi_spec_section must be 5-digit MF95 (e.g. 08410) or 6-digit MF18 (e.g. 084113)',
    });
  }
  if (!CSI_SUBSECTION_RE.test(sub)) {
    errors.push({
      field: 'csi_subsection',
      message: 'csi_subsection must be N.N (e.g. 1.3)',
    });
  }
  if (!CSI_SUB_SUBSECTION_RE.test(subSub)) {
    errors.push({
      field: 'csi_sub_subsection',
      message: 'csi_sub_subsection must be a single letter A-Z or a single digit 1-9',
    });
  }
  return errors;
}

export function deriveCsiDivisionFromSpec(specSection: string): string | null {
  if (!CSI_SPEC_SECTION_RE.test(specSection)) return null;
  // First two digits are the division (08410 → "08", 084113 → "08").
  return specSection.slice(0, 2);
}

/**
 * Assemble the submittal_number from project kID + CSI coordinate.
 * The project kID is expected to be the canonical PRJ-YY-NNNN string;
 * this function is permissive (any non-empty kID) but trims surrounding
 * whitespace and uppercases the sub_subsection letter when applicable.
 */
export function assembleSubmittalNumber(
  projectKid: string,
  csi: CsiCoordinate,
): string {
  const kid = (projectKid ?? '').trim();
  if (!kid) throw new Error('assembleSubmittalNumber: projectKid is required');
  const subSub = csi.csi_sub_subsection.trim();
  const subSubNorm = /^[a-z]$/.test(subSub) ? subSub.toUpperCase() : subSub;
  return `${kid}-SUB-${csi.csi_spec_section.trim()}-${csi.csi_subsection.trim()}-${subSubNorm}`;
}
