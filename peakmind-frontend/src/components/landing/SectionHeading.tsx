import { RevealTitle } from './RevealTitle';

type SectionHeadingProps = {
  label: string;
  title: string;
  copy?: string;
  revealTitle?: boolean;
};

export function SectionHeading({
  label,
  title,
  copy,
  revealTitle = true,
}: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <span className="label-pill">{label}</span>
      <RevealTitle enabled={revealTitle}>{title}</RevealTitle>
      {copy ? <p>{copy}</p> : null}
    </div>
  );
}
