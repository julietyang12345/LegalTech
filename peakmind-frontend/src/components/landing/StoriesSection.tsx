import { type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { athleteStories } from '../../services/landingContent';

type ConstellationNode = {
  number: string;
  title: string;
  copy: string;
  image: string;
  imageAlt: string;
  top: string;
  left: string;
  width: string;
  height: string;
  tilt: string;
  variant: string;
  imagePosition: string;
};

const constellationNodes: ConstellationNode[] = [
  {
    number: '01',
    title: 'When one mistake keeps replaying.',
    copy: 'A bad game can keep running in your head long after practice ends.',
    image: athleteStories[1].image,
    imageAlt: athleteStories[1].imageAlt,
    top: '7%',
    left: '26.3%',
    width: '16%',
    height: '36.5%',
    tilt: '-1deg',
    variant: 'a',
    imagePosition: 'center 32%',
  },
  {
    number: '02',
    title: 'When your body is cleared, but your confidence is not.',
    copy: 'Coming back from injury is physical and emotional.',
    image: athleteStories[0].image,
    imageAlt: athleteStories[0].imageAlt,
    top: '1%',
    left: '48.6%',
    width: '21%',
    height: '25%',
    tilt: '1deg',
    variant: 'b',
    imagePosition: 'center 24%',
  },
  {
    number: '03',
    title: 'When your sport starts feeling like your whole identity.',
    copy: 'It gets harder to separate performance from self-worth.',
    image: athleteStories[3].image,
    imageAlt: athleteStories[3].imageAlt,
    top: '52.2%',
    left: '23.1%',
    width: '16%',
    height: '36.5%',
    tilt: '-1deg',
    variant: 'c',
    imagePosition: 'center 34%',
  },
  {
    number: '04',
    title: 'When being “disciplined” is hiding burnout.',
    copy: 'Sometimes exhaustion gets mistaken for toughness.',
    image: athleteStories[3].image,
    imageAlt: athleteStories[3].imageAlt,
    top: '6%',
    left: '77.5%',
    width: '17.5%',
    height: '33%',
    tilt: '1deg',
    variant: 'd',
    imagePosition: 'center 36%',
  },
  {
    number: '05',
    title: 'When you want support, but not through your coach.',
    copy: 'Private support matters when trust feels complicated.',
    image: athleteStories[2].image,
    imageAlt: athleteStories[2].imageAlt,
    top: '50.5%',
    left: '80.5%',
    width: '18.5%',
    height: '33%',
    tilt: '0deg',
    variant: 'e',
    imagePosition: 'center 42%',
  },
  {
    number: '06',
    title: 'When everyone sees performance, but no one sees pressure.',
    copy: 'Athlete life can look successful from the outside and heavy from the inside.',
    image: athleteStories[0].image,
    imageAlt: athleteStories[0].imageAlt,
    top: '72%',
    left: '47%',
    width: '22%',
    height: '25%',
    tilt: '-1deg',
    variant: 'f',
    imagePosition: 'center 38%',
  },
];

function buildCurve(node: ConstellationNode) {
  const fromX = 580;
  const fromY = 500;
  const nodeX = (parseFloat(node.left) + parseFloat(node.width) / 2) * 10;
  const nodeY = (parseFloat(node.top) + parseFloat(node.height) / 2) * 10;
  const dx = nodeX - fromX;
  const dy = nodeY - fromY;
  const c1x = fromX + dx * 0.34;
  const c1y = fromY + dy * 0.08;
  const c2x = nodeX - dx * 0.2;
  const c2y = nodeY - dy * 0.12;

  return `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nodeX} ${nodeY}`;
}

export function StoriesSection() {
  const curves = constellationNodes.map((node) => ({
    d: buildCurve(node),
  }));
  return (
    <section className="section athlete-constellation-section" id="stories">
      <div className="athlete-constellation-layout">
        <div className="athlete-constellation-intro">
          <h2>
            You&apos;re not
            <br />
            the only one
            <br />
            carrying
            <br />
            <span>this.</span>
          </h2>
          <p>
            Behind every performance is a real person. These moments are hard,
            but you do not have to face them alone.
          </p>
        </div>

        <div className="athlete-constellation-stage" aria-label="Athlete mental pressure map">
          <div className="athlete-constellation-core-glow" aria-hidden="true" />
          <div className="athlete-constellation-network" aria-hidden="true">
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
              <defs>
                <linearGradient id="constellationStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#b9d5de" stopOpacity="0.08" />
                  <stop offset="42%" stopColor="#8bbcc2" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#74a98f" stopOpacity="0.18" />
                </linearGradient>
              </defs>
              {curves.map((curve) => (
                <path
                  key={curve.d}
                  d={curve.d}
                  className="constellation-line"
                />
              ))}
            </svg>
            {constellationNodes.map((node) => (
              <span
                className="constellation-spark"
                key={`${node.number}-spark`}
              />
            ))}
          </div>

          <div className="athlete-constellation-core">
            <svg
              className="athlete-constellation-blob"
              viewBox="0 0 620 390"
              aria-hidden="true"
              focusable="false"
              preserveAspectRatio="none"
            >
              <defs>
                <radialGradient id="coreBlobFill" cx="50%" cy="42%" r="76%">
                  <stop offset="0%" stopColor="#0f514e" stopOpacity="0.46" />
                  <stop offset="44%" stopColor="#062630" stopOpacity="0.97" />
                  <stop offset="100%" stopColor="#020d17" stopOpacity="0.99" />
                </radialGradient>
                <linearGradient id="coreBlobStroke" x1="12%" y1="4%" x2="88%" y2="94%">
                  <stop offset="0%" stopColor="#e7fffc" stopOpacity="0.7" />
                  <stop offset="46%" stopColor="#64ffeb" stopOpacity="0.54" />
                  <stop offset="100%" stopColor="#18c5a3" stopOpacity="0.34" />
                </linearGradient>
              </defs>
              <path
                className="athlete-constellation-blob-outer-rim"
                d="M74 214C49 163 83 104 144 99C185 96 203 65 246 61C277 58 287 43 315 45C346 48 358 75 389 90C427 109 467 93 503 119C550 153 566 210 539 259C518 298 479 305 452 328C420 355 377 337 344 348C303 362 271 345 245 327C211 304 178 333 137 310C101 289 92 250 74 214Z"
              />
              <path
                className="athlete-constellation-blob-fill"
                d="M74 214C49 163 83 104 144 99C185 96 203 65 246 61C277 58 287 43 315 45C346 48 358 75 389 90C427 109 467 93 503 119C550 153 566 210 539 259C518 298 479 305 452 328C420 355 377 337 344 348C303 362 271 345 245 327C211 304 178 333 137 310C101 289 92 250 74 214Z"
              />
              <path
                className="athlete-constellation-blob-ring"
                d="M74 214C49 163 83 104 144 99C185 96 203 65 246 61C277 58 287 43 315 45C346 48 358 75 389 90C427 109 467 93 503 119C550 153 566 210 539 259C518 298 479 305 452 328C420 355 377 337 344 348C303 362 271 345 245 327C211 304 178 333 137 310C101 289 92 250 74 214Z"
              />
              <path
                className="athlete-constellation-blob-highlight"
                d="M112 190C110 146 145 118 187 116C229 114 244 82 286 78C326 74 343 94 379 113C423 136 462 121 504 151"
                />
              <path
                className="athlete-constellation-blob-contour"
                d="M115 220C104 181 129 134 176 130C218 127 236 99 279 94C320 90 345 111 380 129C421 150 461 137 493 163C525 190 520 235 494 260C469 284 436 287 413 306C383 330 351 314 320 323C283 333 259 313 232 300C198 283 170 305 142 282C123 266 123 242 115 220Z"
              />
            </svg>
            <span className="athlete-constellation-orbit" aria-hidden="true" />
            <div className="athlete-constellation-core-content">
              <Sparkles size={30} />
              <h3>
                Athlete life looks strong
                <br />
                from the outside.
                <br />
                It does not always feel
                <br />
                that way <span>inside</span>
              </h3>
              <p>Mental performance support for pressure, confidence, burnout, and identity.</p>
            </div>
          </div>

          {constellationNodes.map((node, index) => (
            <article
              className={`constellation-node constellation-node-${node.variant}`}
              key={node.number}
              style={
                {
                  top: node.top,
                  left: node.left,
                  width: node.width,
                  height: node.height,
                  transform: `rotate(${node.tilt})`,
                  ['--node-tilt' as string]: node.tilt,
                  ['--node-radius' as string]: '30px',
                } as CSSProperties
              }
            >
              <img
                src={node.image}
                alt={node.imageAlt}
                loading="lazy"
                decoding="async"
                style={{ objectPosition: node.imagePosition }}
              />
              <div className="constellation-node-overlay" />
              <div className="constellation-node-content">
                <span>{node.number}</span>
                <h3>{node.title}</h3>
                <p>{node.copy}</p>
              </div>
            </article>
          ))}

        </div>
      </div>
    </section>
  );
}
