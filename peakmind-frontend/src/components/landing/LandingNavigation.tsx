import { useEffect, useRef, useState } from 'react';

const navItems = [
  { label: 'Home', href: '#top' },
  { label: 'Athlete Insight Check', href: '/pressure-check' },
  { label: 'Resources', href: '/tools' },
  { label: 'Find Support', href: '/providers' },
  { label: 'For Providers', href: '/providers' },
  { label: 'About', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
];

export function LandingNavigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [navTone, setNavTone] = useState('hero');
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sectionTones = [
      { selector: '.hero-section', tone: 'hero' },
      { selector: '.privacy-section', tone: 'green' },
      { selector: '.stories-section', tone: 'blue' },
      { selector: '.approach-section', tone: 'blue' },
      { selector: '.final-cta', tone: 'green' },
    ];

    const updateNavState = () => {
      const hero = document.querySelector('.hero-section');
      const navHeight = headerRef.current?.offsetHeight ?? 72;
      const BUFFER = 32;

      if (hero) {
        const heroBottom = hero.getBoundingClientRect().bottom;
        setIsScrolled(heroBottom <= navHeight + BUFFER);
      } else {
        setIsScrolled(window.scrollY > navHeight + BUFFER);
      }

      const activeTone =
        sectionTones.find(({ selector }) => {
          const section = document.querySelector(selector);
          if (!section) return false;

          const rect = section.getBoundingClientRect();
          return rect.top <= 90 && rect.bottom > 90;
        })?.tone ?? 'hero';

      setNavTone(activeTone);
    };

    updateNavState();
    window.addEventListener('scroll', updateNavState, { passive: true });
    window.addEventListener('resize', updateNavState);

    return () => {
      window.removeEventListener('scroll', updateNavState);
      window.removeEventListener('resize', updateNavState);
    };
  }, []);

  return (
    <>
      <header ref={headerRef} className={`site-nav nav-tone-${navTone}${isScrolled ? ' is-scrolled' : ''}`}>
        <a className="site-brand" href="#top" aria-label="PeakMind home">
          <span>PeakMind</span>
          <small>private athlete support</small>
        </a>

        <nav className="site-nav-links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a href={item.href} key={item.label}>
              {item.label}
            </a>
          ))}
        </nav>

        <details className="mobile-menu">
          <summary>Menu</summary>
          <div>
            {navItems.map((item) => (
              <a href={item.href} key={item.label}>
                {item.label}
              </a>
            ))}
          </div>
        </details>
      </header>

    </>
  );
}
