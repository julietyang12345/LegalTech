import type { Dispatch, SetStateAction } from 'react';
import { Save } from 'lucide-react';
import type { CanonicalPerson, EntityModelResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalHouseholdDraft } from './review-types';

type HouseholdDraftFieldsProps = {
  householdId: string;
  draft: FinalHouseholdDraft;
  members: CanonicalPerson[];
  formatPersonName: (person: CanonicalPerson) => string;
  updateFinalHouseholdDraft: (householdId: string, updates: Partial<FinalHouseholdDraft>) => void;
  primaryEmptyLabel?: string;
  optionKeyPrefix?: string;
};

export function HouseholdDraftFields({
  householdId,
  draft,
  members,
  formatPersonName,
  updateFinalHouseholdDraft,
  primaryEmptyLabel,
  optionKeyPrefix,
}: HouseholdDraftFieldsProps) {
  return (
    <div className="th-household-final-grid">
      <label className="th-stack">
        <span className="th-helper">Household label</span>
        <input className="th-input" value={draft.label} onChange={(event) => updateFinalHouseholdDraft(householdId, { label: event.target.value })} />
      </label>
      <label className="th-stack">
        <span className="th-helper">Primary contact</span>
        <select className="th-input" value={draft.primaryPersonId ?? ''} onChange={(event) => updateFinalHouseholdDraft(householdId, { primaryPersonId: event.target.value || null })}>
          <option value="">{primaryEmptyLabel ?? 'Unset'}</option>
          {members.map((member) => (
            <option key={`${optionKeyPrefix ?? householdId}-primary-${member.id}`} value={member.id}>{formatPersonName(member)}</option>
          ))}
        </select>
      </label>
      <label className="th-stack">
        <span className="th-helper">Addressee</span>
        <input className="th-input" value={draft.addressee} onChange={(event) => updateFinalHouseholdDraft(householdId, { addressee: event.target.value })} />
      </label>
      <label className="th-stack">
        <span className="th-helper">Formal salutation</span>
        <input className="th-input" value={draft.formalSalutation} onChange={(event) => updateFinalHouseholdDraft(householdId, { formalSalutation: event.target.value })} />
      </label>
      <label className="th-stack">
        <span className="th-helper">Informal salutation</span>
        <input className="th-input" value={draft.informalSalutation} onChange={(event) => updateFinalHouseholdDraft(householdId, { informalSalutation: event.target.value })} />
      </label>
      <label className="th-stack">
        <span className="th-helper">Event salutation</span>
        <input className="th-input" value={draft.eventSalutation} onChange={(event) => updateFinalHouseholdDraft(householdId, { eventSalutation: event.target.value })} />
      </label>
    </div>
  );
}

type AttributionDraftFieldsProps = {
  rowRef: string;
  draft: PreviewAttributionDraft;
  members: CanonicalPerson[];
  formatPersonName: (person: CanonicalPerson) => string;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  updateFinalAttributionDraft: (rowRef: string, updates: Partial<PreviewAttributionDraft>) => void;
  optionKeyPrefix?: string;
  summaryPrimaryPerson?: CanonicalPerson | null;
  showSummary?: boolean;
};

export function AttributionDraftFields({
  rowRef,
  draft,
  members,
  formatPersonName,
  summarizeAttributionDraft,
  updateFinalAttributionDraft,
  optionKeyPrefix,
  summaryPrimaryPerson,
  showSummary = true,
}: AttributionDraftFieldsProps) {
  return (
    <>
      <div className="th-household-final-grid">
        <label className="th-stack">
          <span className="th-helper">Credit mode</span>
          <select className="th-input" value={draft.mode} onChange={(event) => updateFinalAttributionDraft(rowRef, { mode: event.target.value as PreviewAttributionDraft['mode'] })}>
            <option value="person">Person only</option>
            <option value="joint_split">Joint split</option>
            <option value="soft_credit">Soft credit</option>
            <option value="org_match">Org match</option>
          </select>
        </label>
        <label className="th-stack">
          <span className="th-helper">Primary person</span>
          <select className="th-input" value={draft.primaryPersonId ?? ''} onChange={(event) => updateFinalAttributionDraft(rowRef, { primaryPersonId: event.target.value || null })}>
            <option value="">Unset</option>
            {members.map((member) => (
              <option key={`${optionKeyPrefix ?? rowRef}-primary-${member.id}`} value={member.id}>{formatPersonName(member)}</option>
            ))}
          </select>
        </label>
        <label className="th-stack">
          <span className="th-helper">Secondary person</span>
          <select className="th-input" value={draft.secondaryPersonId ?? ''} onChange={(event) => updateFinalAttributionDraft(rowRef, { secondaryPersonId: event.target.value || null })}>
            <option value="">None</option>
            {members.map((member) => (
              <option key={`${optionKeyPrefix ?? rowRef}-secondary-${member.id}`} value={member.id}>{formatPersonName(member)}</option>
            ))}
          </select>
        </label>
        <label className="th-stack">
          <span className="th-helper">Split % primary</span>
          <input className="th-input" type="number" min="0" max="100" value={draft.splitPercent} onChange={(event) => updateFinalAttributionDraft(rowRef, { splitPercent: Math.min(100, Math.max(0, Number(event.target.value || 0))) })} />
        </label>
        <label className="th-stack">
          <span className="th-helper">Organization</span>
          <input className="th-input" value={draft.organizationName} onChange={(event) => updateFinalAttributionDraft(rowRef, { organizationName: event.target.value })} />
        </label>
        <label className="th-stack">
          <span className="th-helper">Notes</span>
          <input className="th-input" value={draft.notes} onChange={(event) => updateFinalAttributionDraft(rowRef, { notes: event.target.value })} />
        </label>
      </div>
      {showSummary && (
        <p className="th-helper" style={{ padding: 0, marginTop: 10 }}>
          Preview: {summarizeAttributionDraft(draft, members, summaryPrimaryPerson ?? members.find((member) => member.id === draft.primaryPersonId) ?? null)}
        </p>
      )}
    </>
  );
}

type DonationContext = {
  donation: EntityModelResult['donations'][number];
  previewRecord: PreviewRecord;
  household: EntityModelResult['households'][number] | null;
  members: CanonicalPerson[];
  primaryPerson: CanonicalPerson | null;
  draft: PreviewAttributionDraft;
  linkedAttributions: EntityModelResult['attributions'];
};

type HouseholdContext = {
  household: EntityModelResult['households'][number];
  members: CanonicalPerson[];
  draft: FinalHouseholdDraft;
  linkedDonations: EntityModelResult['donations'];
};

type PersonContext = {
  person: CanonicalPerson;
  household: EntityModelResult['households'][number] | null;
  draft: FinalHouseholdDraft | null;
  availableHouseholds: EntityModelResult['households'];
  linkedDonations: EntityModelResult['donations'];
};

type OrganizationContext = {
  organization: EntityModelResult['organizations'][number];
  draftName: string;
  linkedAttributions: EntityModelResult['attributions'];
  linkedDonations: EntityModelResult['donations'];
  linkedPreviewRecords: PreviewRecord[];
};

type EntityGraphEditorsProps = {
  variant: 'final' | 'output';
  selectedEntityGraphDonationContext: DonationContext | null;
  selectedEntityGraphHouseholdContext: HouseholdContext | null;
  selectedEntityGraphPersonContext: PersonContext | null;
  selectedEntityGraphOrganizationContext: OrganizationContext | null;
  finalReviewReady: boolean;
  isLoading: boolean;
  formatPersonName: (person: CanonicalPerson) => string;
  formatCurrencyAmount: (amount: number) => string;
  previewRecordLabel: (record: PreviewRecord) => string;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  getCompactSourceRef: (sourceRef: string | null | undefined) => { primary: string; context: string | null };
  updateFinalHouseholdDraft: (householdId: string, updates: Partial<FinalHouseholdDraft>) => void;
  updateFinalAttributionDraft: (rowRef: string, updates: Partial<PreviewAttributionDraft>) => void;
  handleApplyFinalHouseholdEdits: () => Promise<void> | void;
  assignPersonToHouseholdDraft: (personId: string, householdId: string) => void;
  setPersonAsHouseholdPrimary: (personId: string, householdId: string) => void;
  organizationGraphDraftsSetter: Dispatch<SetStateAction<Record<string, string>>>;
  updateOrganizationDrafts: (organizationId: string, draftName: string) => void;
};

export function EntityGraphEditors({
  variant,
  selectedEntityGraphDonationContext,
  selectedEntityGraphHouseholdContext,
  selectedEntityGraphPersonContext,
  selectedEntityGraphOrganizationContext,
  finalReviewReady,
  isLoading,
  formatPersonName,
  formatCurrencyAmount,
  previewRecordLabel,
  summarizeAttributionDraft,
  getCompactSourceRef,
  updateFinalHouseholdDraft,
  updateFinalAttributionDraft,
  handleApplyFinalHouseholdEdits,
  assignPersonToHouseholdDraft,
  setPersonAsHouseholdPrimary,
  organizationGraphDraftsSetter,
  updateOrganizationDrafts,
}: EntityGraphEditorsProps) {
  return (
    <>
      {selectedEntityGraphDonationContext && (
        <div className="th-mini-block" style={{ marginTop: 12 }}>
          <div className="th-panel-head" style={{ marginBottom: 10 }}>
            <span>{variant === 'final' ? 'Selected donation detail' : 'Drill-down editor'}</span>
            <span>{getCompactSourceRef(selectedEntityGraphDonationContext.donation.rowId).primary}</span>
          </div>
          <p className="th-helper" style={{ padding: 0 }}>
            {previewRecordLabel(selectedEntityGraphDonationContext.previewRecord)} · {variant === 'final'
              ? `${selectedEntityGraphDonationContext.donation.amount ? formatCurrencyAmount(selectedEntityGraphDonationContext.donation.amount) : 'No amount'} · ${selectedEntityGraphDonationContext.household?.label || selectedEntityGraphDonationContext.household?.lastName || 'No household'}`
              : `${selectedEntityGraphDonationContext.household?.label || selectedEntityGraphDonationContext.household?.lastName || 'No household'} · ${selectedEntityGraphDonationContext.linkedAttributions.length} linked attribution${selectedEntityGraphDonationContext.linkedAttributions.length === 1 ? '' : 's'}`}
          </p>
          <div style={{ marginTop: 10 }}>
            <AttributionDraftFields
              rowRef={selectedEntityGraphDonationContext.donation.rowId || ''}
              draft={selectedEntityGraphDonationContext.draft}
              members={selectedEntityGraphDonationContext.members}
              formatPersonName={formatPersonName}
              summarizeAttributionDraft={summarizeAttributionDraft}
              updateFinalAttributionDraft={updateFinalAttributionDraft}
              optionKeyPrefix={`${variant}-graph`}
              summaryPrimaryPerson={selectedEntityGraphDonationContext.primaryPerson}
              showSummary={false}
            />
          </div>
          <div className="th-review-match-actions" style={{ marginTop: 12 }}>
            <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyFinalHouseholdEdits()} disabled={!finalReviewReady || isLoading}>
              <Save size={14} /> {variant === 'final' ? 'Apply selected graph edits' : 'Apply graph edits'}
            </button>
            <span className="th-helper" style={{ padding: 0 }}>
              {summarizeAttributionDraft(selectedEntityGraphDonationContext.draft, selectedEntityGraphDonationContext.members, selectedEntityGraphDonationContext.primaryPerson)}
            </span>
          </div>
          {variant === 'final' && selectedEntityGraphDonationContext.linkedAttributions.length > 0 && (
            <div className="th-chip-row" style={{ marginTop: 10 }}>
              {selectedEntityGraphDonationContext.linkedAttributions.map((entry) => (
                <span key={`linked-${entry.id}`} className="th-chip">
                  {entry.kind} · {entry.personId || entry.organizationId || '—'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {selectedEntityGraphHouseholdContext && (
        <div className="th-mini-block" style={{ marginTop: 12 }}>
          <div className="th-panel-head" style={{ marginBottom: 10 }}>
            <span>{variant === 'final' ? 'Selected household detail' : 'Selected household editor'}</span>
            <span>{selectedEntityGraphHouseholdContext.household.id}</span>
          </div>
          <p className="th-helper" style={{ padding: 0 }}>
            {selectedEntityGraphHouseholdContext.members.map((member) => formatPersonName(member)).join(' · ') || 'No linked members'} · {selectedEntityGraphHouseholdContext.linkedDonations.length} linked donation{selectedEntityGraphHouseholdContext.linkedDonations.length === 1 ? '' : 's'}
          </p>
          <div style={{ marginTop: 10 }}>
            <HouseholdDraftFields
              householdId={selectedEntityGraphHouseholdContext.household.id}
              draft={selectedEntityGraphHouseholdContext.draft}
              members={selectedEntityGraphHouseholdContext.members}
              formatPersonName={formatPersonName}
              updateFinalHouseholdDraft={updateFinalHouseholdDraft}
              optionKeyPrefix={`${variant}-graph-household`}
            />
          </div>
          <div className="th-review-match-actions" style={{ marginTop: 12 }}>
            <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyFinalHouseholdEdits()} disabled={!finalReviewReady || isLoading}>
              <Save size={14} /> {variant === 'final' ? 'Apply selected household edits' : 'Apply household graph edits'}
            </button>
            <span className="th-helper" style={{ padding: 0 }}>
              {selectedEntityGraphHouseholdContext.draft.addressee}
            </span>
          </div>
        </div>
      )}
      {selectedEntityGraphPersonContext && (
        <div className="th-mini-block" style={{ marginTop: 12 }}>
          <div className="th-panel-head" style={{ marginBottom: 10 }}>
            <span>{variant === 'final' ? 'Selected person detail' : 'Selected person editor'}</span>
            <span>{selectedEntityGraphPersonContext.person.id}</span>
          </div>
          <p className="th-helper" style={{ padding: 0 }}>
            {formatPersonName(selectedEntityGraphPersonContext.person)} · {variant === 'final'
              ? `${selectedEntityGraphPersonContext.person.email || 'No email'} · ${selectedEntityGraphPersonContext.linkedDonations.length} linked donation${selectedEntityGraphPersonContext.linkedDonations.length === 1 ? '' : 's'}`
              : `${selectedEntityGraphPersonContext.linkedDonations.length} linked donation${selectedEntityGraphPersonContext.linkedDonations.length === 1 ? '' : 's'} · ${selectedEntityGraphPersonContext.household?.label || selectedEntityGraphPersonContext.household?.lastName || 'No household'}`}
          </p>
          <div className="th-household-final-grid" style={{ marginTop: 10 }}>
            <label className="th-stack">
              <span className="th-helper">Assigned household</span>
              <select
                className="th-input"
                value={selectedEntityGraphPersonContext.household?.id ?? ''}
                onChange={(event) => {
                  if (event.target.value) assignPersonToHouseholdDraft(selectedEntityGraphPersonContext.person.id, event.target.value);
                }}
              >
                <option value="">No household</option>
                {selectedEntityGraphPersonContext.availableHouseholds.map((household) => (
                  <option key={`${variant}-graph-person-household-${household.id}`} value={household.id}>
                    {household.id} · {household.label || household.lastName || 'Household'}
                  </option>
                ))}
              </select>
            </label>
            <label className="th-stack">
              <span className="th-helper">Current primary role</span>
              <input className="th-input" value={selectedEntityGraphPersonContext.household?.primaryPersonId === selectedEntityGraphPersonContext.person.id ? 'Primary contact' : 'Member'} readOnly />
            </label>
            <label className="th-stack">
              <span className="th-helper">Household addressee</span>
              <input className="th-input" value={selectedEntityGraphPersonContext.draft?.addressee ?? '—'} readOnly />
            </label>
          </div>
          <div className="th-review-match-actions" style={{ marginTop: 12 }}>
            {selectedEntityGraphPersonContext.household && (
              <button
                type="button"
                className="th-button th-button-secondary"
                onClick={() => setPersonAsHouseholdPrimary(selectedEntityGraphPersonContext.person.id, selectedEntityGraphPersonContext.household!.id)}
              >
                Set as primary contact
              </button>
            )}
            <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyFinalHouseholdEdits()} disabled={!finalReviewReady || isLoading}>
              <Save size={14} /> {variant === 'final' ? 'Apply person graph edits' : 'Apply person edits'}
            </button>
          </div>
        </div>
      )}
      {selectedEntityGraphOrganizationContext && (
        <div className="th-mini-block" style={{ marginTop: 12 }}>
          <div className="th-panel-head" style={{ marginBottom: 10 }}>
            <span>{variant === 'final' ? 'Selected organization detail' : 'Selected organization editor'}</span>
            <span>{selectedEntityGraphOrganizationContext.organization.id}</span>
          </div>
          <p className="th-helper" style={{ padding: 0 }}>
            {selectedEntityGraphOrganizationContext.linkedDonations.length} linked donation{selectedEntityGraphOrganizationContext.linkedDonations.length === 1 ? '' : 's'} · {selectedEntityGraphOrganizationContext.linkedAttributions.length} linked attribution{selectedEntityGraphOrganizationContext.linkedAttributions.length === 1 ? '' : 's'}
          </p>
          <div className="th-household-final-grid" style={{ marginTop: 10 }}>
            <label className="th-stack">
              <span className="th-helper">Organization credit label</span>
              <input
                className="th-input"
                value={selectedEntityGraphOrganizationContext.draftName}
                onChange={(event) => organizationGraphDraftsSetter((current) => ({ ...current, [selectedEntityGraphOrganizationContext.organization.id]: event.target.value }))}
              />
            </label>
            <label className="th-stack">
              <span className="th-helper">Normalized key</span>
              <input className="th-input" value={selectedEntityGraphOrganizationContext.organization.normalizedName || '—'} readOnly />
            </label>
            <label className="th-stack">
              <span className="th-helper">Linked rows</span>
              <input className="th-input" value={String(selectedEntityGraphOrganizationContext.linkedPreviewRecords.length)} readOnly />
            </label>
          </div>
          <div className="th-review-match-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="th-button th-button-secondary"
              onClick={() => updateOrganizationDrafts(selectedEntityGraphOrganizationContext.organization.id, selectedEntityGraphOrganizationContext.draftName)}
            >
              Update linked org credits
            </button>
            <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyFinalHouseholdEdits()} disabled={!finalReviewReady || isLoading}>
              <Save size={14} /> Apply organization edits
            </button>
          </div>
        </div>
      )}
    </>
  );
}
