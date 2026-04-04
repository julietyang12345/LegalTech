import type { CanonicalPerson, EntityModelResult } from './types';

export type EntityGraphView = 'donations' | 'attributions' | 'households' | 'persons' | 'organizations';
export type EntityGraphSelection = {
  type: EntityGraphView;
  id: string;
};

type EntityGraphTableProps = {
  entityGraphView: EntityGraphView;
  filteredEntityGraphRows: EntityModelResult['donations'] | EntityModelResult['attributions'] | EntityModelResult['households'] | EntityModelResult['persons'] | EntityModelResult['organizations'];
  entityGraphSelection: EntityGraphSelection | null;
  setEntityGraphSelection: (selection: EntityGraphSelection | null) => void;
  entityModelResult: EntityModelResult | null;
  formatPersonName: (person: CanonicalPerson) => string;
  formatCurrencyAmount: (amount: number) => string;
  keyPrefix?: string;
};

export function EntityGraphTable({
  entityGraphView,
  filteredEntityGraphRows,
  entityGraphSelection,
  setEntityGraphSelection,
  entityModelResult,
  formatPersonName,
  formatCurrencyAmount,
  keyPrefix = '',
}: EntityGraphTableProps) {
  const columnCount = entityGraphView === 'organizations' ? 3 : entityGraphView === 'persons' ? 5 : 6;
  const viewLabel = entityGraphView === 'donations'
    ? 'Canonical transaction'
    : entityGraphView === 'attributions'
      ? 'Transaction link'
      : entityGraphView === 'households'
        ? 'Household group'
        : entityGraphView === 'persons'
          ? 'Canonical profile'
          : 'Organization';

  return (
    <table className="th-table th-household-preview-table">
      <thead>
        {entityGraphView === 'donations' && (
          <tr>
            <th>{viewLabel}</th>
            <th>Source row</th>
            <th>Amount</th>
            <th>Matched profile</th>
            <th>Household</th>
            <th>Org</th>
            <th>Links</th>
          </tr>
        )}
        {entityGraphView === 'attributions' && (
          <tr>
            <th>{viewLabel}</th>
            <th>Canonical tx</th>
            <th>Link type</th>
            <th>Matched profile</th>
            <th>Org</th>
            <th>Workplace</th>
          </tr>
        )}
        {entityGraphView === 'households' && (
          <tr>
            <th>{viewLabel}</th>
            <th>Label</th>
            <th>Primary</th>
            <th>Addressee</th>
            <th>Members</th>
            <th>Salutation</th>
          </tr>
        )}
        {entityGraphView === 'persons' && (
          <tr>
            <th>{viewLabel}</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Lifecycle</th>
          </tr>
        )}
        {entityGraphView === 'organizations' && (
          <tr>
            <th>{viewLabel}</th>
            <th>Name</th>
            <th>Normalized</th>
          </tr>
        )}
      </thead>
      <tbody>
        {filteredEntityGraphRows.length === 0 ? (
          <tr>
            <td colSpan={columnCount}>No entity graph rows match this filter.</td>
          </tr>
        ) : entityGraphView === 'donations' ? (
          (filteredEntityGraphRows as EntityModelResult['donations']).slice(0, 24).map((donation) => (
            <tr key={`${keyPrefix}${donation.id}`} className={entityGraphSelection?.type === 'donations' && entityGraphSelection.id === donation.id ? 'th-entity-row is-selected' : 'th-entity-row'} onClick={() => setEntityGraphSelection({ type: 'donations', id: donation.id })}>
              <td>{donation.id}</td>
              <td>{donation.rowId || '—'}</td>
              <td>{formatCurrencyAmount(donation.amount || 0)}</td>
              <td>{donation.canonical_person_id || '—'}</td>
              <td>{donation.canonical_household_id || '—'}</td>
              <td>{donation.canonical_org_id || '—'}</td>
              <td>{entityModelResult?.attributions.filter((entry) => entry.donationId === donation.id).map((entry) => `${entry.kind}:${entry.personId || entry.organizationId || '—'}`).join(' · ') || donation.attribution_type}</td>
            </tr>
          ))
        ) : entityGraphView === 'attributions' ? (
          (filteredEntityGraphRows as EntityModelResult['attributions']).slice(0, 24).map((entry) => (
            <tr key={`${keyPrefix}${entry.id}`} className={entityGraphSelection?.type === 'attributions' && entityGraphSelection.id === entry.id ? 'th-entity-row is-selected' : 'th-entity-row'} onClick={() => setEntityGraphSelection({ type: 'attributions', id: entry.id })}>
              <td>{entry.id}</td>
              <td>{entry.donationId || '—'}</td>
              <td>{entry.kind}</td>
              <td>{entry.personId || '—'}</td>
              <td>{entry.organizationId || '—'}</td>
              <td>{entry.workplace ? 'Yes' : 'No'}</td>
            </tr>
          ))
        ) : entityGraphView === 'households' ? (
          (filteredEntityGraphRows as EntityModelResult['households']).slice(0, 24).map((household) => (
            <tr key={`${keyPrefix}${household.id}`} className={entityGraphSelection?.type === 'households' && entityGraphSelection.id === household.id ? 'th-entity-row is-selected' : 'th-entity-row'} onClick={() => setEntityGraphSelection({ type: 'households', id: household.id })}>
              <td>{household.id}</td>
              <td>{household.label || household.lastName || '—'}</td>
              <td>{household.primaryPersonId || '—'}</td>
              <td>{household.addressee || '—'}</td>
              <td>{household.memberIds.join(' · ') || '—'}</td>
              <td>{household.formalSalutation || household.salutationText || '—'}</td>
            </tr>
          ))
        ) : entityGraphView === 'persons' ? (
          (filteredEntityGraphRows as EntityModelResult['persons']).slice(0, 24).map((person) => (
            <tr key={`${keyPrefix}${person.id}`} className={entityGraphSelection?.type === 'persons' && entityGraphSelection.id === person.id ? 'th-entity-row is-selected' : 'th-entity-row'} onClick={() => setEntityGraphSelection({ type: 'persons', id: person.id })}>
              <td>{person.id}</td>
              <td>{formatPersonName(person)}</td>
              <td>{person.email || '—'}</td>
              <td>{person.phone || '—'}</td>
              <td>{person.lifecycle || '—'}</td>
            </tr>
          ))
        ) : (
          (filteredEntityGraphRows as EntityModelResult['organizations']).slice(0, 24).map((organization) => (
            <tr key={`${keyPrefix}${organization.id}`} className={entityGraphSelection?.type === 'organizations' && entityGraphSelection.id === organization.id ? 'th-entity-row is-selected' : 'th-entity-row'} onClick={() => setEntityGraphSelection({ type: 'organizations', id: organization.id })}>
              <td>{organization.id}</td>
              <td>{organization.name}</td>
              <td>{organization.normalizedName || '—'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
