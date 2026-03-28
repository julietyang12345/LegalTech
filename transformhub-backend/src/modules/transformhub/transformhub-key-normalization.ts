const NOISE_PREFIXES = [
  'donor',
  'constituent',
  'contact',
  'person',
  'crm',
  'gift',
  'giving',
  'mailing',
  'billing',
  'home',
  'work',
  'primary',
  'secondary',
  'custom',
  'raw',
  'source',
  'import',
];

const NOISE_SUFFIXES = [
  'field',
  'value',
  'text',
  'string',
  'column',
  'col',
  'info',
  'data',
];

const SYNONYM_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /e ?mail/g, replacement: 'email' },
  { pattern: /electronicmail/g, replacement: 'email' },
  { pattern: /telephone/g, replacement: 'phone' },
  { pattern: /mobilephone/g, replacement: 'phone' },
  { pattern: /cellphone/g, replacement: 'phone' },
  { pattern: /phonenumber/g, replacement: 'phone' },
  { pattern: /zipcode/g, replacement: 'postalcode' },
  { pattern: /zip/g, replacement: 'postalcode' },
  { pattern: /postcode/g, replacement: 'postalcode' },
  { pattern: /postal/g, replacement: 'postalcode' },
  { pattern: /addr/g, replacement: 'address' },
  { pattern: /streetaddress/g, replacement: 'address' },
  { pattern: /address1/g, replacement: 'address' },
  { pattern: /addressline1/g, replacement: 'address' },
  { pattern: /fullname/g, replacement: 'name' },
  { pattern: /lastname/g, replacement: 'lastname' },
  { pattern: /firstname/g, replacement: 'firstname' },
  { pattern: /organizationname/g, replacement: 'organizationname' },
  { pattern: /householdname/g, replacement: 'householdname' },
  { pattern: /campaignname/g, replacement: 'campaignname' },
  { pattern: /fundname/g, replacement: 'fund' },
  { pattern: /appealname/g, replacement: 'appeal' },
  { pattern: /createddate/g, replacement: 'createdat' },
  { pattern: /updateddate/g, replacement: 'updatedat' },
  { pattern: /lastupdateddate/g, replacement: 'updatedat' },
];

export type NormalizedKey = {
  rawKey: string;
  cleanedKey: string;
  strippedKey: string;
  canonicalHint: string | null;
};

function tokenize(input: string): string[] {
  return input.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

function cleanKey(rawKey: string): string {
  return String(rawKey || '')
    .toLowerCase()
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(tokens: string[]): string[] {
  let next = [...tokens];
  while (next.length > 1 && NOISE_PREFIXES.includes(next[0])) next = next.slice(1);
  while (next.length > 1 && NOISE_SUFFIXES.includes(next[next.length - 1])) next = next.slice(0, -1);
  return next;
}

function collapseSynonyms(value: string): string {
  return SYNONYM_PATTERNS.reduce((acc, { pattern, replacement }) => acc.replace(pattern, replacement), value);
}

function inferCanonicalHint(strippedKey: string): string | null {
  if (!strippedKey) return null;
  if (strippedKey.includes('email')) return 'email';
  if (strippedKey.includes('phone')) return 'phone';
  if (strippedKey.includes('postalcode')) return 'postal_code';
  if (strippedKey.includes('address')) return 'address';
  if (strippedKey.includes('householdname')) return 'household_name';
  if (strippedKey.includes('organizationname')) return 'organization_name';
  if (strippedKey.includes('firstname')) return 'first_name';
  if (strippedKey.includes('lastname')) return 'last_name';
  if (strippedKey.includes('campaignname')) return 'campaign_name';
  if (strippedKey === 'campaign') return 'campaign_name';
  if (strippedKey === 'fund') return 'fund';
  if (strippedKey === 'appeal') return 'appeal';
  if (strippedKey.includes('createdat')) return 'created_at';
  if (strippedKey.includes('updatedat')) return 'updated_at';
  return null;
}

export function normalizeKey(rawKey: string): NormalizedKey {
  const cleanedKey = cleanKey(rawKey);
  const strippedTokens = stripNoise(tokenize(cleanedKey));
  const strippedKey = collapseSynonyms(strippedTokens.join(''));
  return {
    rawKey: String(rawKey || ''),
    cleanedKey,
    strippedKey,
    canonicalHint: inferCanonicalHint(strippedKey),
  };
}

export function normalizeKeys(keys: string[]): NormalizedKey[] {
  return keys.map((key) => normalizeKey(key));
}

export function matchesNormalizedKey(rawKey: string, aliases: string[]): boolean {
  const candidate = normalizeKey(rawKey);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return candidate.strippedKey === normalizedAlias.strippedKey || candidate.cleanedKey === normalizedAlias.cleanedKey;
  });
}
