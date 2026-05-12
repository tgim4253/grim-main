import type { AnalyticsContributionDayDatum, AnalyticsContributionLevel } from '../../types';
import {
  addLocalDays,
  formatLocalDateKey,
  parseLocalDate,
  toContributionLevel,
} from '../analyticsUtils';

const VIEWBOX_WIDTH = 900;
const VIEWBOX_HEIGHT = 210;
const VIEWBOX = `0 0 ${String(VIEWBOX_WIDTH)} ${String(VIEWBOX_HEIGHT)}`;
const GRID_LEFT = 64;
const GRID_TOP = 42;
const CELL = 10;
const GAP = 4;
const STEP = CELL + GAP;
const WEEK_COUNT = 53;
const DAY_COUNT = 7;
const GRID_HEIGHT = (DAY_COUNT - 1) * STEP + CELL;
const LEGEND_Y = GRID_TOP + GRID_HEIGHT + 34;
const LEGEND_LABEL_Y = LEGEND_Y + CELL - 1;
const LEGEND_LESS_X = VIEWBOX_WIDTH - 158;
const LEGEND_CELL_START_X = VIEWBOX_WIDTH - 110;
const LEGEND_MORE_X = VIEWBOX_WIDTH - 42;
const LEGEND_GAP = 6;

const DAY_LABELS = [
  { index: 1, label: 'Mon' },
  { index: 3, label: 'Wed' },
  { index: 5, label: 'Fri' },
] as const;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const LEVEL_CLASS_NAMES: Record<AnalyticsContributionLevel, string> = {
  0: 'analytics-contribution-graph__cell--level-0',
  1: 'analytics-contribution-graph__cell--level-1',
  2: 'analytics-contribution-graph__cell--level-2',
  3: 'analytics-contribution-graph__cell--level-3',
  4: 'analytics-contribution-graph__cell--level-4',
};

const getDateDifferenceInDays = (start: Date, end: Date) => {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return Math.round((endUtc - startUtc) / 86_400_000);
};

const getMonthMarkers = (startDate: Date, endDate: Date) => {
  const markers: Array<{ key: string; label: string; x: number }> = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  if (cursor < startDate) {
    cursor = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  }

  while (cursor <= endDate) {
    const daysFromStart = getDateDifferenceInDays(startDate, cursor);
    const weekIndex = Math.floor(daysFromStart / DAY_COUNT);

    markers.push({
      key: formatLocalDateKey(cursor),
      label: MONTH_LABELS[cursor.getMonth()] ?? '',
      x: GRID_LEFT + weekIndex * STEP,
    });

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return markers;
};

export type ContributionGraphProps = {
  data: AnalyticsContributionDayDatum[];
  ariaLabel?: string;
  endDate?: string | Date;
};

export function ContributionGraph({
  data,
  ariaLabel = 'Daily contribution graph',
  endDate,
}: ContributionGraphProps) {
  const today = parseLocalDate(endDate ?? new Date());
  const currentWeekStart = addLocalDays(today, -today.getDay());
  const startDate = addLocalDays(currentWeekStart, -(WEEK_COUNT - 1) * DAY_COUNT);
  const contributionByDate = new Map(
    data.map(item => {
      const dateKey = formatLocalDateKey(parseLocalDate(item.date));
      const level = item.level ?? toContributionLevel(item.count);

      return [dateKey, { ...item, dateKey, level }] as const;
    }),
  );
  const days = Array.from({ length: getDateDifferenceInDays(startDate, today) + 1 }, (_, index) =>
    addLocalDays(startDate, index),
  );
  const monthMarkers = getMonthMarkers(startDate, today);
  const todayKey = formatLocalDateKey(today);

  return (
    <svg
      className="analytics-contribution-graph"
      viewBox={VIEWBOX}
      role="img"
      aria-label={ariaLabel}
    >
      {monthMarkers.map(marker => (
        <text key={marker.key} className="analytics-contribution-graph__month" x={marker.x} y="22">
          {marker.label}
        </text>
      ))}
      {DAY_LABELS.map(day => (
        <text
          key={day.label}
          className="analytics-contribution-graph__day"
          x="0"
          y={GRID_TOP + day.index * STEP + CELL / 2}
          dominantBaseline="middle"
        >
          {day.label}
        </text>
      ))}
      {days.map(date => {
        const dateKey = formatLocalDateKey(date);
        const daysFromStart = getDateDifferenceInDays(startDate, date);
        const weekIndex = Math.floor(daysFromStart / DAY_COUNT);
        const dayIndex = date.getDay();
        const datum = contributionByDate.get(dateKey);
        const count = datum?.count ?? 0;
        const level = datum?.level ?? 0;
        const x = GRID_LEFT + weekIndex * STEP;
        const y = GRID_TOP + dayIndex * STEP;

        return (
          <g key={dateKey}>
            <title>{`${dateKey}: ${String(count)} records`}</title>
            <rect
              className={`analytics-contribution-graph__cell ${LEVEL_CLASS_NAMES[level]}`}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx="2"
              data-date={dateKey}
              data-count={count}
              data-today={dateKey === todayKey ? 'true' : undefined}
            />
          </g>
        );
      })}
      <text
        className="analytics-contribution-graph__legend-label"
        x={LEGEND_LESS_X}
        y={LEGEND_LABEL_Y}
      >
        Less
      </text>
      {[0, 1, 2, 3, 4].map(level => (
        <rect
          key={level}
          className={`analytics-contribution-graph__legend-cell ${LEVEL_CLASS_NAMES[level as AnalyticsContributionLevel]}`}
          x={LEGEND_CELL_START_X + level * (CELL + LEGEND_GAP)}
          y={LEGEND_Y}
          width={CELL}
          height={CELL}
          rx="2"
          aria-hidden
        />
      ))}
      <text
        className="analytics-contribution-graph__legend-label"
        x={LEGEND_MORE_X}
        y={LEGEND_LABEL_Y}
      >
        More
      </text>
    </svg>
  );
}
