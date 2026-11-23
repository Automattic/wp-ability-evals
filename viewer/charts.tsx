// The viewer's charts, drawn as hand-written SVG and coloured strictly with @wordpress/theme tokens through
// `style.css`: coverage group bar, legend, pass/fail track, and an interactive trend chart with point inspection.

import { Link, Stack, Text } from '@wordpress/ui';
import { useState } from 'react';
import type { CoverageGroup } from '../src/results/types.ts';
import { separateLabels, topOf } from './chart-scale.ts';
import { runHref } from './data.ts';

/** The groups in the order the bars, the legend and the filters show them, with their names on the page. */
export const GROUPS: { group: CoverageGroup; label: string }[] = [
  { group: 'passing', label: 'Passing' },
  { group: 'in-failing-scenario', label: 'In a failing scenario' },
  { group: 'known-defect-or-not-built', label: 'Known defect or not built yet' },
  { group: 'no-result-yet', label: 'No result yet' },
  { group: 'not-tested', label: 'Not tested' },
  { group: 'missing-from-site', label: 'Missing from the site' },
];

export function groupLabel(group: CoverageGroup): string {
  return GROUPS.find((one) => one.group === group)?.label ?? group;
}

/** A group's colour, as a small square. */
export function Swatch({ group }: { group: CoverageGroup }) {
  return <span className={`swatch g-${group}`} aria-hidden="true" />;
}

/** One bar split by group, in the groups' order. */
export function GroupBar({ groups }: { groups: Record<CoverageGroup, number> }) {
  const total = GROUPS.reduce((sum, { group }) => sum + groups[group], 0);
  return (
    <div className="group-bar" role="img" aria-label={GROUPS.map(({ group, label }) => `${groups[group]} ${label.toLowerCase()}`).join(', ')}>
      {GROUPS.filter(({ group }) => groups[group] > 0).map(({ group, label }) => (
        <span key={group} className={`seg g-${group}`} style={{ flexGrow: groups[group] / Math.max(total, 1) }} title={`${groups[group]} ${label.toLowerCase()}`} />
      ))}
    </div>
  );
}

export function Legend({ groups }: { groups: Record<CoverageGroup, number> }) {
  return (
    <div className="legend">
      {GROUPS.map(({ group, label }) => (
        <span key={group} className="legend-item">
          <Swatch group={group} />
          {label}
          <strong>{groups[group]}</strong>
        </span>
      ))}
    </div>
  );
}

/** How scenarios ended: passed, failed, and every other way, on one compact track. */
export function PassFail({ passed, failed, other }: { passed: number; failed: number; other: number }) {
  const total = Math.max(passed + failed + other, 1);
  return (
    <div className="pass-fail" role="img" aria-label={`${passed} passed, ${failed} failed, ${other} other`}>
      <span className="seg g-passing" style={{ flexGrow: passed / total }} />
      <span className="seg g-in-failing-scenario" style={{ flexGrow: failed / total }} />
      <span className="seg g-no-result-yet" style={{ flexGrow: other / total }} />
    </div>
  );
}

export interface Series {
  label: string;
  /** Its colour, from `style.css`. */
  className: string;
  values: number[];
}

export interface ChartRunRef {
  runId: string;
  label: string;
}

/** Interactive trend chart over saved runs: hover or focus any point to inspect exact values, click to open the run. */
export function LineChart({ runs, series }: { runs: ChartRunRef[]; series: Series[] }) {
  const [activeIndex, setActiveIndex] = useState<number>(runs.length - 1);
  const clamped = Math.min(Math.max(activeIndex, 0), Math.max(runs.length - 1, 0));
  const width = 680;
  const height = 210;
  const pad = { top: 18, right: 64, bottom: 28, left: 38 };
  const maxVal = Math.max(...series.flatMap(({ values }) => values), 0);
  const top = topOf(maxVal);
  const x = (index: number) => pad.left + (index / Math.max(runs.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const endYs = separateLabels(
    series.map(({ values }) => y(values.at(-1) ?? 0)),
    15,
    pad.top,
    height - pad.bottom,
  );
  const activeRun = runs[clamped];

  return (
    <figure className="chart-figure">
      {activeRun !== undefined && (
        <div className="chart-readout">
          <Stack direction="row" gap="md" align="center" wrap="wrap">
            <Text variant="body-sm">
              <strong>{activeRun.label}</strong>
            </Text>
            {series.map(({ label, className, values }) => (
              <span key={label} className="legend-item">
                <span className={`swatch ${className}`} aria-hidden="true" />
                {label}: <strong>{values[clamped] ?? 0}</strong>
              </span>
            ))}
            <Link href={runHref(activeRun.runId)}>Open run</Link>
          </Stack>
        </div>
      )}
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={series.map(({ label, values }) => `${label}: ${values.at(-1)}`).join(', ')}
      >
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
            <text className="axis" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="central">
              {tick}
            </text>
          </g>
        ))}
        {activeRun !== undefined && (
          <line className="active-guide" x1={x(clamped)} x2={x(clamped)} y1={pad.top} y2={height - pad.bottom} />
        )}
        <text className="axis" x={x(0)} y={height - 8} textAnchor="start">
          {runs[0]?.label ?? ''}
        </text>
        <text className="axis" x={x(runs.length - 1)} y={height - 8} textAnchor="end">
          {runs.at(-1)?.label ?? ''}
        </text>
        {series.map(({ label, className, values }, seriesIndex) => (
          <g key={label} className={className}>
            <polyline className="line" points={values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
            {values.map((value, index) => (
              <circle
                key={index}
                className={`dot ${index === clamped ? 'dot-active' : ''}`}
                cx={x(index)}
                cy={y(value)}
                r={index === clamped ? 5 : 3.5}
              />
            ))}
            <text className="end-label" x={x(values.length - 1) + 10} y={endYs[seriesIndex] ?? y(values.at(-1) ?? 0)} dominantBaseline="central">
              {values.at(-1)}
            </text>
          </g>
        ))}
        {runs.map((run, index) => {
          const hitWidth = runs.length <= 1 ? width - pad.left - pad.right : (width - pad.left - pad.right) / (runs.length - 1);
          const left = Math.max(pad.left, x(index) - hitWidth / 2);
          const right = Math.min(width - pad.right, x(index) + hitWidth / 2);
          return (
            <a key={run.runId} href={runHref(run.runId)} aria-label={`Open run ${run.label}`}>
              <rect
                className="chart-hit"
                x={left}
                y={pad.top}
                width={Math.max(right - left, 16)}
                height={height - pad.top - pad.bottom}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
              />
            </a>
          );
        })}
      </svg>
    </figure>
  );
}
