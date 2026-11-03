import type { AggregateTradeFeedState } from '../../lib/orderflow/aggregate-trade-feed-state';
import type { DataIntegrityStatus } from '../../lib/orderflow/contracts';

export type TerminalTradeDataMode = 'LIVE' | 'DEMO' | 'DEGRADED';

/** Maps shadow capture telemetry to UI health without presenting it as execution. */
export function getAggregateTradeIntegrityStatus(
    feed: Pick<AggregateTradeFeedState, 'capability' | 'coverage' | 'error'> & {
        stats: Pick<AggregateTradeFeedState['stats'], 'acceptedCount'>;
    },
    dataMode: TerminalTradeDataMode,
): DataIntegrityStatus {
    if (dataMode !== 'LIVE' || feed.capability === 'DISABLED') return 'UNAVAILABLE';
    if (feed.capability === 'CHECKING') return 'LOADING';
    if (feed.capability === 'ERROR' || feed.error) return 'ERROR';
    if (feed.coverage.sequenceState === 'BUFFERING') return 'LOADING';
    if (feed.coverage.sequenceState === 'STALE') return 'STALE';
    if (feed.coverage.sequenceState === 'GAP'
        || feed.coverage.gapCount > 0
        || feed.coverage.quality === 'LOW') return 'PARTIAL';
    if (feed.coverage.sequenceState === 'LIVE' && feed.stats.acceptedCount > 0) return 'READY';
    return 'LOADING';
}
