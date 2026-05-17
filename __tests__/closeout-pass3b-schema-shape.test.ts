import {
  project_lifecycle_states,
  punch_list_items,
  substantial_completion_certs,
  warranties,
  warranty_claims,
  notices_of_completion,
  deliverable_documents,
  unified_job_packets,
  gold_dataset_entries,
  project_search_indexes,
  projectLifecycleStateEnum,
  punchListItemSourceEnum,
  punchListItemCategoryEnum,
  punchListItemResponsiblePartyEnum,
  punchListItemStatusEnum,
  warrantyStatusEnum,
  warrantyClaimInboundSourceEnum,
  warrantyClaimTriageResultEnum,
  warrantyClaimResolutionEnum,
  deliverableTypeEnum,
} from '@/db/schema';

describe('BAN-304 Pass 3b Drizzle schema shape', () => {
  describe('enum exports (10 pgEnum types)', () => {
    it('project_lifecycle_state has all 4 states from §5', () => {
      expect(projectLifecycleStateEnum.enumValues).toEqual([
        'IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED',
      ]);
    });

    it('punch_list_item_source has all 6 sources from §6.2', () => {
      expect(punchListItemSourceEnum.enumValues).toEqual([
        'FIELD_ISSUE', 'SUBSTANTIAL_WALKTHROUGH', 'GC_TRANSMITTAL',
        'OWNER_WALKTHROUGH', 'ARCHITECT_WALKTHROUGH', 'INTERNAL_QA',
      ]);
    });

    it('punch_list_item_category has all 8 categories', () => {
      expect(punchListItemCategoryEnum.enumValues).toEqual([
        'GLASS', 'FRAMING', 'HARDWARE', 'SEALANT',
        'FINISH', 'CLEANING', 'DOCUMENTATION', 'OTHER',
      ]);
    });

    it('punch_list_item_responsible_party has 4 values', () => {
      expect(punchListItemResponsiblePartyEnum.enumValues).toEqual([
        'KULA', 'OTHER_TRADE', 'GC', 'DISPUTED',
      ]);
    });

    it('punch_list_item_status has all 7 lifecycle states', () => {
      expect(punchListItemStatusEnum.enumValues).toEqual([
        'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
        'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY',
      ]);
    });

    it('warranty_status has 3 states from §8.1', () => {
      expect(warrantyStatusEnum.enumValues).toEqual([
        'ACTIVE', 'EXPIRED', 'PARTIALLY_EXPIRED',
      ]);
    });

    it('warranty_claim_inbound_source has 4 channels', () => {
      expect(warrantyClaimInboundSourceEnum.enumValues).toEqual([
        'EMAIL', 'PHONE', 'PORTAL', 'FIELD_DISCOVERY',
      ]);
    });

    it('warranty_claim_triage_result has 5 values from §8.6', () => {
      expect(warrantyClaimTriageResultEnum.enumValues).toEqual([
        'KULA_RESPONSIBLE', 'MANUFACTURER_RESPONSIBLE',
        'OTHER_TRADE_RESPONSIBLE', 'OUT_OF_WARRANTY', 'DISPUTED',
      ]);
    });

    it('warranty_claim_resolution has 4 terminal values', () => {
      expect(warrantyClaimResolutionEnum.enumValues).toEqual([
        'COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED',
      ]);
    });

    it('deliverable_type has 5 types from §11.3 + §12', () => {
      expect(deliverableTypeEnum.enumValues).toEqual([
        'AS_BUILT_DRAWING', 'OM_MANUAL_COMPONENT', 'OM_MANUAL_COMPLETE',
        'UNIFIED_JOB_PACKET', 'OTHER',
      ]);
    });
  });

  describe('10 Closeout v1.1 entity tables (Drizzle exports)', () => {
    const entities: Array<[string, Record<string, unknown>, string[]]> = [
      ['project_lifecycle_states', project_lifecycle_states, ['lifecycle_state_id', 'state', 'entered_at', 'exited_at', 'reopen_reason', 'reopen_by']],
      ['punch_list_items', punch_list_items, ['item_id', 'item_number', 'source', 'description', 'category', 'responsible_party', 'photos_required', 'photo_evidence', 'assigned_to', 'due_date', 'status', 'completion_evidence', 'signoff_evidence', 'dispute_reason', 'dispute_resolution']],
      ['substantial_completion_certs', substantial_completion_certs, ['cert_id', 'walkthrough_date', 'attendees', 'per_system_completion', 'cert_evidence_drive_id', 'gc_signoff_evidence_drive_id', 'signed_at']],
      ['warranties', warranties, ['warranty_id', 'start_date', 'scope_warranties', 'status']],
      ['warranty_claims', warranty_claims, ['claim_id', 'warranty_id', 'inbound_source', 'inbound_evidence', 'inbound_date', 'reported_by', 'issue_description', 'affected_scope', 'triage_result', 'triage_by', 'triage_at', 'triage_reasoning', 'service_wo_id', 'back_charge_id', 'resolution', 'resolution_evidence_drive_id', 'resolved_at']],
      ['notices_of_completion', notices_of_completion, ['noc_id', 'filed_date', 'recording_number', 'recording_evidence_drive_id', 'hrs_basis', 'lien_deadline_days', 'lien_deadline_date', 'filed_by']],
      ['deliverable_documents', deliverable_documents, ['doc_id', 'deliverable_type', 'category', 'drive_file_id', 'version', 'uploaded_by', 'uploaded_at', 'required_for_state']],
      ['unified_job_packets', unified_job_packets, ['packet_id', 'template_version', 'drive_file_id', 'generated_at', 'generated_by', 'sections_included']],
      ['gold_dataset_entries', gold_dataset_entries, ['entry_id', 'project_classification', 'bid_data', 'actual_data', 'schedule_data', 'punch_list_data', 'warranty_data', 'inter_island_logistics_data', 'test_project']],
      ['project_search_indexes', project_search_indexes, ['search_index_id', 'index_payload', 'last_indexed_at', 'index_version']],
    ];

    it('count is exactly 10 (per §19.1)', () => {
      expect(entities).toHaveLength(10);
    });

    it.each(entities)('%s exposes tenant_id, engagement_id, audit columns + required fields', (_name, table, required) => {
      const cols = table as Record<string, unknown>;
      expect(cols.tenant_id).toBeDefined();
      expect(cols.engagement_id).toBeDefined();
      expect(cols.created_at).toBeDefined();
      expect(cols.updated_at).toBeDefined();
      expect(cols.created_by).toBeDefined();
      expect(cols.updated_by).toBeDefined();
      for (const c of required) {
        expect(cols[c]).toBeDefined();
      }
    });
  });

  describe('inheritance + boundary invariants', () => {
    it('Closeout child tables do not carry per-row is_test_project / test_data columns (D2)', () => {
      const inheritedOnly = [
        project_lifecycle_states, punch_list_items, substantial_completion_certs,
        warranties, warranty_claims, notices_of_completion, deliverable_documents,
        unified_job_packets, project_search_indexes,
      ];
      for (const table of inheritedOnly) {
        const cols = table as Record<string, unknown>;
        expect(cols.is_test_project).toBeUndefined();
        expect(cols.test_data).toBeUndefined();
      }
    });

    it('gold_dataset_entries is the singular exception with an explicit test_project column (§16.2)', () => {
      const cols = gold_dataset_entries as Record<string, unknown>;
      expect(cols.test_project).toBeDefined();
    });
  });
});
