import { useEffect, useRef, useState } from 'react';
import { ThemeToggleButton } from '../common/ThemeToggleButton';

const navItems = [
  { label: 'Start', href: '#top' },
  { label: 'Pressure check', href: '/pressure-check' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'Athlete moments', href: '#stories' },
  { label: 'Stories', href: '/stories' },
  { label: 'Next steps', href: '#paths' },
  { label: 'Tools', href: '/tools' },
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
          <a href="/pressure-check">Pressure check</a>
          <a href="#privacy">Privacy</a>
          <a href="/stories">Stories</a>
          <a href="#paths">Next steps</a>
        </nav>

        <a className="site-nav-cta" href="/pressure-check">
          Start privately
        </a>
        <ThemeToggleButton />

        <details className="mobile-menu">
          <summary>Menu</summary>
          <div>
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        </details>
      </header>

    </>
  );
}
