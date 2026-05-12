import type { AnalyticsRadarDatum } from '../../types';
import { clampNumber } from '../analyticsUtils';

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 78;
const LABEL_RADIUS = 118;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

const formatSvgNumber = (value: number) => Number(value.toFixed(3)).toString();

const getPoint = (index: number, total: number, radius: number) => {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;

  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
};

const toPoints = (points: Array<{ x: number; y: number }>) =>
  points.map(point => `${formatSvgNumber(point.x)},${formatSvgNumber(point.y)}`).join(' ');

const getAnchor = (x: number) => {
  if (Math.abs(x - CENTER) < 8) return 'middle';

  return x < CENTER ? 'end' : 'start';
};

export type RadarChartProps = {
  data: AnalyticsRadarDatum[];
  ariaLabel?: string;
  maxValue?: number;
};

export function RadarChart({ data, ariaLabel = 'Radar chart', maxValue }: RadarChartProps) {
  const total = Math.max(data.length, 1);
  const resolvedMaxValue = Math.max(
    maxValue ?? 0,
    ...data.map(item => item.maxValue ?? item.value),
    1,
  );
  const polygonPoints = data.map((item, index) => {
    const ratio = clampNumber(item.value / (item.maxValue ?? resolvedMaxValue), 0, 1);

    return getPoint(index, total, RADIUS * ratio);
  });

  return (
    <svg
      className="analytics-radar-chart"
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      role="img"
      aria-label={ariaLabel}
    >
      {GRID_LEVELS.map(level => (
        <polygon
          key={level}
          className="analytics-radar-chart__grid"
          points={toPoints(data.map((_, index) => getPoint(index, total, RADIUS * level)))}
        />
      ))}
      {data.map((_, index) => {
        const edge = getPoint(index, total, RADIUS);

        return (
          <line
            key={data[index]?.id ?? index}
            className="analytics-radar-chart__axis"
            x1={CENTER}
            y1={CENTER}
            x2={edge.x}
            y2={edge.y}
          />
        );
      })}
      <polygon className="analytics-radar-chart__area" points={toPoints(polygonPoints)} />
      <polyline className="analytics-radar-chart__line" points={toPoints(polygonPoints)} />
      {polygonPoints.map((point, index) => (
        <circle
          key={data[index]?.id ?? index}
          className="analytics-radar-chart__point"
          cx={point.x}
          cy={point.y}
          r="4"
        />
      ))}
      {data.map((item, index) => {
        const point = getPoint(index, total, LABEL_RADIUS);

        return (
          <text
            key={item.id}
            className="analytics-radar-chart__label"
            x={point.x}
            y={point.y}
            textAnchor={getAnchor(point.x)}
            dominantBaseline="middle"
          >
            {item.label}
          </text>
        );
      })}
    </svg>
  );
}
