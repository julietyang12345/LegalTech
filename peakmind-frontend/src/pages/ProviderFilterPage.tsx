import { ArrowLeft, ArrowRight, MapPin, Monitor, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { providerDirectory, providerTypes } from '../services/landingContent';
import type { ProviderDirectoryItem, ProviderTypeSlug } from '../types/landing';
import { ProviderProfilePage } from './ProviderProfilePage';

const fallbackType: ProviderTypeSlug = 'therapists';
type SortOption = 'best-match' | 'insurance' | 'alphabetical' | 'availability';

const stateNames: Record<string, string> = {
  AZ: 'Arizona',
  CA: 'California',
  CO: 'Colorado',
  FL: 'Florida',
  NC: 'North Carolina',
  NJ: 'New Jersey',
  OR: 'Oregon',
  TX: 'Texas',
};

function getInitialType(): ProviderTypeSlug {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');

  if (type === 'therapists' || type === 'sports-psychologists' || type === 'performance-coaches') {
    return type;
  }

  return fallbackType;
}

function formatFocusAreas(focus: string) {
  return focus
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function formatInsurance(insurance: string) {
  const insurers = insurance
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (insurers.length <= 2) {
    return insurers.join(', ');
  }

  return `${insurers.slice(0, 2).join(', ')} +${insurers.length - 2}`;
}

function getProfileHref(provider: ProviderDirectoryItem) {
  return `/provider-filter?type=${provider.type}&profile=${encodeURIComponent(provider.name)}`;
}

function sortProviders(providers: ProviderDirectoryItem[], sortBy: SortOption) {
  return [...providers].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.name.localeCompare(b.name);
    }

    if (sortBy === 'insurance') {
      return b.insurance.split(',').length - a.insurance.split(',').length;
    }

    if (sortBy === 'availability') {
      return a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
    }

    return 0;
  });
}

export function ProviderFilterPage() {
  const [activeType, setActiveType] = useState<ProviderTypeSlug>(getInitialType);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [insuranceFilter, setInsuranceFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('best-match');

  const states = useMemo(
    () => Array.from(new Set(providerDirectory.map((provider) => provider.state))).sort(),
    [],
  );

  const insurances = useMemo(() => {
    const values = providerDirectory.flatMap((provider) =>
      provider.insurance.split(',').map((insurance) => insurance.trim()),
    );

    return Array.from(new Set(values)).sort();
  }, []);

  const filteredProviders = sortProviders(
    providerDirectory.filter((provider) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const searchableText = [
        provider.name,
        provider.credentials,
        provider.focus,
        provider.insurance,
        provider.state,
        stateNames[provider.state],
        provider.type,
        providerTypes.find((providerType) => providerType.slug === provider.type)?.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesType = provider.type === activeType;
      const matchesSearch = normalizedQuery === '' || searchableText.includes(normalizedQuery);
      const matchesState = stateFilter === 'all' || provider.state === stateFilter;
      const matchesInsurance =
        insuranceFilter === 'all' || provider.insurance.includes(insuranceFilter);

      return matchesType && matchesSearch && matchesState && matchesInsurance;
    }),
    sortBy,
  );

  const profileName = new URLSearchParams(window.location.search).get('profile');
  const selectedProvider = profileName
    ? providerDirectory.find((provider) => provider.name === profileName)
    : undefined;

  if (selectedProvider) {
    return <ProviderProfilePage provider={selectedProvider} />;
  }

  return (
    <main className="route-shell provider-filter-shell">
      <nav className="survey-nav">
        <a href="/providers" className="back-link">
          <ArrowLeft size={17} />
          Provider types
        </a>
        <div className="survey-nav-actions">
          <a className="nav-pill" href="/pressure-check">
            Start check-in
          </a>
        </div>
      </nav>

      <section className="provider-filter-hero">
        <span className="label-pill">
          <Search size={15} />
          Provider finder
        </span>
        <h1>Filter athlete-focused support by provider type</h1>
      </section>

      <section className="provider-filter-panel">
        <div className="provider-filter-controls">
          <div className="provider-filter-tabs" aria-label="Provider type">
            {providerTypes.map((providerType) => (
              <button
                className={providerType.slug === activeType ? 'is-active' : ''}
                key={providerType.slug}
                onClick={() => setActiveType(providerType.slug)}
                type="button"
              >
                <span>{providerType.title}</span>
                <small>{providerDirectory.filter((provider) => provider.type === providerType.slug).length}</small>
              </button>
            ))}
          </div>

          <div className="provider-filter-toolbar">
            <label>
              State
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="all">All states</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {stateNames[state] ?? state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Insurance
              <select
                value={insuranceFilter}
                onChange={(event) => setInsuranceFilter(event.target.value)}
              >
                <option value="all">All listed</option>
                {insurances.map((insurance) => (
                  <option key={insurance} value={insurance}>
                    {insurance}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort by
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
              >
                <option value="best-match">Best Match</option>
                <option value="insurance">Insurance</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="availability">Availability</option>
              </select>
            </label>
          </div>
        </div>

        <div className="provider-filter-summary">
          <div className="provider-search-control">
            <div>
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Search providers by name, focus area, insurance, credential, or state"
                id="provider-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Name, focus, insurance..."
                type="search"
                value={searchQuery}
              />
            </div>
          </div>
        </div>

        {filteredProviders.length > 0 ? (
          <>
            <table className="provider-results-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Focus Areas</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Insurance</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProviders.map((provider) => (
                  <tr
                    key={`${provider.name}-${provider.state}`}
                    onClick={() => {
                      window.location.href = getProfileHref(provider);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.location.href = getProfileHref(provider);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <div className="provider-name-cell">
                        <strong>{provider.name}</strong>
                        <span>{provider.credentials}</span>
                      </div>
                    </td>
                    <td>
                      <div className="provider-focus-list">
                        {formatFocusAreas(provider.focus).map((focus) => (
                          <span key={focus}>{focus}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="provider-availability">
                        <span>
                          <MapPin size={16} />
                          {stateNames[provider.state] ?? provider.state}
                        </span>
                        <span>
                          <Monitor size={16} />
                          Telehealth
                        </span>
                      </div>
                    </td>
                    <td>{formatInsurance(provider.insurance)}</td>
                    <td>
                      <a
                        className="provider-profile-action"
                        href={getProfileHref(provider)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        View profile <ArrowRight size={18} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="provider-results-mobile">
              {filteredProviders.map((provider) => (
                <a
                  className="provider-mobile-row"
                  href={getProfileHref(provider)}
                  key={`${provider.name}-${provider.state}-mobile`}
                >
                  <div className="provider-name-cell">
                    <strong>{provider.name}</strong>
                    <span>{provider.credentials}</span>
                  </div>
                  <div className="provider-focus-list">
                    {formatFocusAreas(provider.focus).map((focus) => (
                      <span key={focus}>{focus}</span>
                    ))}
                  </div>
                  <div className="provider-mobile-meta">
                    <span>
                      <MapPin size={15} />
                      {stateNames[provider.state] ?? provider.state}
                    </span>
                    <span>
                      <Monitor size={15} />
                      Telehealth
                    </span>
                  </div>
                  <p>{formatInsurance(provider.insurance)}</p>
                  <span className="provider-profile-action">
                    View profile <ArrowRight size={18} />
                  </span>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="provider-empty-state">
            <h2>No listed providers in this category yet.</h2>
            <p>
              Performance coaches are usually self-pay and may not appear in an
              insurance-based provider list. Use the check-in if you want help deciding
              whether coaching or clinical support is a better fit.
            </p>
            <a className="primary-button" href="/pressure-check">
              Help me choose <ArrowRight size={18} />
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
