import type { AnalyticsPieDatum } from '../../types';

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 88;
const START_ANGLE = -90;

const formatSvgNumber = (value: number) => Number(value.toFixed(3)).toString();

const polarToCartesian = (angle: number) => {
  const radians = (angle * Math.PI) / 180;

  return {
    x: CENTER + RADIUS * Math.cos(radians),
    y: CENTER + RADIUS * Math.sin(radians),
  };
};

const createArcPath = (startAngle: number, endAngle: number) => {
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${formatSvgNumber(CENTER)} ${formatSvgNumber(CENTER)}`,
    `L ${formatSvgNumber(start.x)} ${formatSvgNumber(start.y)}`,
    `A ${formatSvgNumber(RADIUS)} ${formatSvgNumber(RADIUS)} 0 ${String(largeArcFlag)} 1 ${formatSvgNumber(end.x)} ${formatSvgNumber(end.y)}`,
    'Z',
  ].join(' ');
};

export type PieChartProps = {
  data: AnalyticsPieDatum[];
  ariaLabel?: string;
};

export function PieChart({ data, ariaLabel = 'Pie chart' }: PieChartProps) {
  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  let cursor = START_ANGLE;

  return (
    <svg
      className="analytics-pie-chart"
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      role="img"
      aria-label={ariaLabel}
    >
      <circle className="analytics-pie-chart__guide" cx={CENTER} cy={CENTER} r={RADIUS} />
      {total <= 0
        ? null
        : data.map((item, index) => {
            const value = Math.max(item.value, 0);
            const angle = (value / total) * 360;
            const startAngle = cursor;
            const endAngle = index === data.length - 1 ? START_ANGLE + 360 : cursor + angle;
            cursor = endAngle;
            const color = item.color ?? 'var(--analytics-accent-primary)';

            if (angle <= 0) {
              return null;
            }

            if (angle >= 359.99) {
              return (
                <circle
                  key={item.id}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill={color}
                  opacity={Math.max(1 - index * 0.12, 0.5)}
                >
                  <title>{`${item.label}: ${String(item.value)}`}</title>
                </circle>
              );
            }

            return (
              <path
                key={item.id}
                className="analytics-pie-chart__slice"
                d={createArcPath(startAngle, endAngle)}
                fill={color}
                opacity={Math.max(1 - index * 0.12, 0.5)}
              >
                <title>{`${item.label}: ${String(item.value)}`}</title>
              </path>
            );
          })}
      <circle className="analytics-pie-chart__center-mark" cx={CENTER} cy={CENTER} r="4" />
    </svg>
  );
}
