export type AnalyticsChartKind = 'pie' | 'radar' | 'contribution';

export type AnalyticsTagBarDatum = {
  id: string;
  label: string;
  value: number;
  color?: string;
  unit?: string;
};

export type AnalyticsPieDatum = AnalyticsTagBarDatum;

export type AnalyticsRadarDatum = AnalyticsTagBarDatum & {
  maxValue?: number;
};

export type AnalyticsContributionLevel = 0 | 1 | 2 | 3 | 4;

export type AnalyticsContributionDayDatum = {
  date: string | Date;
  count: number;
  level?: AnalyticsContributionLevel;
};
