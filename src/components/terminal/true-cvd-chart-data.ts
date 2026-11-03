import type { WhitespaceData } from 'lightweight-charts';

import type { TrueFlowSnapshotV1 } from '../../lib/orderflow/true-flow-contracts';
import type { DemoMarketBar } from '../../lib/ui/market-fixtures';

export interface FlowCvdBar {
    time: DemoMarketBar['time'];
    open: number;
    high: number;
    low: number;
    close: number;
    reset?: boolean;
}

export type FlowCvdPoint = FlowCvdBar | WhitespaceData<DemoMarketBar['time']>;

export function isCvdBar(point: FlowCvdPoint): point is FlowCvdBar {
    return 'close' in point;
}

/**
 * Projects the current uninterrupted CVD segment onto the exact price-candle
 * time grid. Earlier candles remain whitespace, so linked logical ranges and
 * crosshairs stay aligned without inventing pre-capture volume.
 */
export function projectCapturedCvdToChartTimes(
    chartTimes: readonly number[],
    snapshot: TrueFlowSnapshotV1,
): FlowCvdPoint[] {
    const currentSegment = snapshot.cvdSegments.at(-1);
    const captured = new Map<number, FlowCvdBar>();
    let previousClose = 0;
    currentSegment?.bars.forEach((bar, index) => {
        const time = Math.floor(bar.openTime / 1_000) as DemoMarketBar['time'];
        const close = bar.cumulativeDeltaNotionalUsd;
        captured.set(Number(time), {
            time,
            open: previousClose,
            high: Math.max(previousClose, close),
            low: Math.min(previousClose, close),
            close,
            reset: index === 0,
        });
        previousClose = close;
    });
    return chartTimes.map((time) => captured.get(time) ?? { time: time as DemoMarketBar['time'] });
}
