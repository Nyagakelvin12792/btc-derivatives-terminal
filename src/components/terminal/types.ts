export type ChartTool =
    | 'cursor'
    | 'trendline'
    | 'horizontal'
    | 'vertical'
    | 'long-position'
    | 'short-position'
    | 'rectangle'
    | 'text';

export type ChartTimeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D';

export const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
    '1m': 60,
    '5m': 5 * 60,
    '15m': 15 * 60,
    '1H': 60 * 60,
    '4H': 4 * 60 * 60,
    '1D': 24 * 60 * 60,
};
