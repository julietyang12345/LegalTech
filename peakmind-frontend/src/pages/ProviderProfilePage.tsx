import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  Check,
  GraduationCap,
  Heart,
  Languages,
  MapPin,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Star,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProviderDirectoryItem } from '../types/landing';

type ProviderProfilePageProps = {
  provider: ProviderDirectoryItem;
};

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

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function credentialTitle(credentials: string) {
  if (credentials.includes('LPC')) return 'Licensed Professional Counselor';
  if (credentials.includes('LCSW')) return 'Licensed Clinical Social Worker';
  if (credentials.includes('LMFT')) return 'Licensed Marriage and Family Therapist';
  if (credentials.includes('PsyD')) return 'Clinical Psychologist';
  if (credentials.includes('PhD') || credentials.includes('Psychologist')) return 'Psychologist';
  return 'Athlete-focused mental health provider';
}

function providerBio(provider: ProviderDirectoryItem) {
  const state = stateNames[provider.state] ?? provider.state;

  return `${provider.name} supports athletes navigating ${provider.focus.toLowerCase()}. Their work is designed for people who want practical, private support that understands the demands of sport, school, recovery, and identity outside performance.`;
}

function ProfileCard({
  children,
  title,
  icon: Icon,
}: {
  children: ReactNode;
  title: string;
  icon: typeof Check;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-slate-300">
      <h2 className="mb-5 flex items-center gap-3 text-lg font-semibold text-slate-950">
        <Icon aria-hidden="true" className="h-5 w-5 text-slate-500" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 text-[15px] text-slate-600">
      {items.map((item) => (
        <li className="flex gap-3" key={item}>
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-slate-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Qualifications({ provider }: ProviderProfilePageProps) {
  return (
    <section id="qualifications" className="rounded-2xl border border-slate-200 bg-white p-7">
      <h2 className="mb-7 text-2xl font-semibold text-slate-950">Qualifications</h2>
      <div className="grid gap-7 md:grid-cols-2">
        <div className="flex gap-4">
          <GraduationCap aria-hidden="true" className="mt-1 h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-semibold text-slate-950">Education</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Graduate-level clinical training with athlete-focused practice experience.
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-semibold text-slate-950">Licensure</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {provider.credentials}, licensed in {stateNames[provider.state] ?? provider.state}.
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <Award aria-hidden="true" className="mt-1 h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-semibold text-slate-950">Board Certifications</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Credentials and specialty claims should be verified directly with the provider.
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <BookOpen aria-hidden="true" className="mt-1 h-5 w-5 text-slate-500" />
          <div>
            <h3 className="font-semibold text-slate-950">Additional Training</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{provider.focus}</p>
          </div>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
        <Languages aria-hidden="true" className="h-5 w-5 text-slate-500" />
        <span className="font-semibold text-slate-950">Languages</span>
        <span>English</span>
      </div>
    </section>
  );
}

export function ProviderProfilePage({ provider }: ProviderProfilePageProps) {
  const focusAreas = splitList(provider.focus);
  const insurance = splitList(provider.insurance);
  const state = stateNames[provider.state] ?? provider.state;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            href={`/provider-filter?type=${provider.type}`}
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to providers
          </a>
          <a
            className="hidden min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 sm:inline-flex"
            href="/pressure-check"
          >
            Book Consultation
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-[280px_minmax(0,1fr)] md:p-8">
            <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100">
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                <UserRound aria-hidden="true" className="h-14 w-14" />
                <span className="text-sm font-semibold">Profile Photo</span>
              </div>
            </div>

            <div className="flex flex-col justify-center">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                {credentialTitle(provider.credentials)}
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.03em] text-slate-950 md:text-5xl">
                {provider.name}, {provider.credentials}
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <Star aria-hidden="true" className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <strong className="text-slate-950">4.9</strong>
                </span>
                <span>42 reviews</span>
              </div>

              <dl className="mt-7 grid gap-4 text-[15px] text-slate-600">
                <div className="flex gap-3">
                  <MapPinIcon />
                  <div>
                    <dt className="font-semibold text-slate-950">Licensed in</dt>
                    <dd>{state}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Monitor aria-hidden="true" className="mt-0.5 h-5 w-5 text-slate-500" />
                  <div>
                    <dt className="font-semibold text-slate-950">Telehealth</dt>
                    <dd>{provider.telehealth ? 'Available' : 'Not listed'}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-slate-500" />
                  <div>
                    <dt className="font-semibold text-slate-950">Accepts</dt>
                    <dd>
                      {insurance.slice(0, 3).join(', ')}
                      {insurance.length > 3 ? ` +${insurance.length - 3}` : ''}
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                  href="/pressure-check"
                >
                  <CalendarDays aria-hidden="true" className="mr-2 h-4 w-4" />
                  Book Free 15-minute Consultation
                </a>
                <a
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300"
                  href="mailto:"
                >
                  <MessageCircle aria-hidden="true" className="mr-2 h-4 w-4" />
                  Message
                </a>
              </div>
            </div>
          </div>

          <aside className="grid gap-5 lg:sticky lg:top-6 lg:self-start">
            <ProfileCard icon={ShieldCheck} title="What insurance is accepted?">
              <CheckList items={insurance} />
            </ProfileCard>
            <a
              className="hidden min-h-12 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 lg:inline-flex"
              href="/pressure-check"
            >
              Book Free Consultation
            </a>
          </aside>
        </section>

        <nav className="sticky top-0 z-10 mt-8 border-y border-slate-200 bg-slate-50/95 backdrop-blur">
          <div className="flex gap-8 overflow-x-auto px-1">
            {['About', 'Qualifications', 'Insurance', 'Availability'].map((item) => (
              <a
                className="relative min-h-14 whitespace-nowrap py-4 text-sm font-semibold text-slate-600 transition after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-slate-950 after:transition hover:text-slate-950 hover:after:scale-x-100"
                href={`#${item.toLowerCase()}`}
                key={item}
              >
                {item}
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-8">
            <section id="about" className="rounded-2xl border border-slate-200 bg-white p-7">
              <h2 className="mb-5 text-2xl font-semibold text-slate-950">About</h2>
              <div className="space-y-5 text-[16px] leading-8 text-slate-700">
                <p>{providerBio(provider)}</p>
                <p>
                  Sessions are structured to help athletes identify what is getting in
                  the way, build practical coping tools, and make informed choices about
                  support without added pressure from team or school systems.
                </p>
              </div>
            </section>

            <Qualifications provider={provider} />

            <section id="insurance" className="rounded-2xl border border-slate-200 bg-white p-7">
              <h2 className="mb-5 text-2xl font-semibold text-slate-950">Insurance</h2>
              <div className="flex flex-wrap gap-3">
                {insurance.map((item) => (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    key={item}
                  >
                    <Check aria-hidden="true" className="h-4 w-4 text-slate-500" />
                    {item}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <aside className="grid gap-5 self-start">
            <ProfileCard icon={UsersRound} title="Works best with:">
              <CheckList
                items={[
                  'College athletes',
                  'Injured athletes',
                  'Athletes dealing with burnout',
                  'Athletes transitioning out of sport',
                ]}
              />
            </ProfileCard>
            <ProfileCard icon={Heart} title="Style:">
              <CheckList
                items={[
                  'Direct and structured',
                  'Reflective and relational',
                  'Skills-based',
                  'Trauma-informed',
                  'Performance-focused',
                ]}
              />
            </ProfileCard>
            <ProfileCard icon={CalendarDays} title="Availability">
              <div id="availability" className="grid gap-5 text-sm text-slate-600">
                <div>
                  <h3 className="font-semibold text-slate-950">Virtual</h3>
                  <p className="mt-1">Mon-Fri</p>
                </div>
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="font-semibold text-slate-950">Next available</h3>
                  <p className="mt-1 font-semibold text-slate-700">Tomorrow at 10:00 AM</p>
                </div>
              </div>
            </ProfileCard>
          </aside>
        </div>
      </div>
    </main>
  );
}

function MapPinIcon() {
  return <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 text-slate-500" />;
}
