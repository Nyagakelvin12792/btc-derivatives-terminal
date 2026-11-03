import { describe, expect, it } from 'vitest';
import { createInitialAggregateTradeFeedState } from '../../lib/orderflow/aggregate-trade-feed-state';
import type { AggregateTradeFeedState } from '../../lib/orderflow/aggregate-trade-feed-state';
import { getAggregateTradeIntegrityStatus } from './trade-integrity-status';

function feed(overrides: Partial<AggregateTradeFeedState> = {}): AggregateTradeFeedState {
    return {
        ...createInitialAggregateTradeFeedState(10, 10),
        capability: 'ENABLED',
        ...overrides,
    };
}

describe('aggregate-trade integrity status', () => {
    it('fails closed outside live mode or when capability is disabled', () => {
        expect(getAggregateTradeIntegrityStatus(feed(), 'DEMO')).toBe('UNAVAILABLE');
        expect(getAggregateTradeIntegrityStatus(feed({ capability: 'DISABLED' }), 'LIVE')).toBe('UNAVAILABLE');
    });

    it('reports capability discovery and buffering as loading', () => {
        expect(getAggregateTradeIntegrityStatus(feed({ capability: 'CHECKING' }), 'LIVE')).toBe('LOADING');
        expect(getAggregateTradeIntegrityStatus(feed({
            coverage: { ...feed().coverage, sequenceState: 'BUFFERING' },
        }), 'LIVE')).toBe('LOADING');
    });

    it('reports sanitized capability and worker failures as errors', () => {
        expect(getAggregateTradeIntegrityStatus(feed({ capability: 'ERROR' }), 'LIVE')).toBe('ERROR');
        expect(getAggregateTradeIntegrityStatus(feed({
            error: { code: 'SOCKET_UNAVAILABLE', message: 'Unavailable.', recoverable: true },
        }), 'LIVE')).toBe('ERROR');
    });

    it('keeps stale, partial, and ready health states distinct', () => {
        expect(getAggregateTradeIntegrityStatus(feed({
            coverage: { ...feed().coverage, sequenceState: 'STALE', quality: 'LOW' },
        }), 'LIVE')).toBe('STALE');
        expect(getAggregateTradeIntegrityStatus(feed({
            coverage: { ...feed().coverage, sequenceState: 'GAP', gapCount: 1, quality: 'LOW' },
        }), 'LIVE')).toBe('PARTIAL');
        expect(getAggregateTradeIntegrityStatus(feed({
            coverage: { ...feed().coverage, sequenceState: 'LIVE', quality: 'MEDIUM' },
            stats: { ...feed().stats, acceptedCount: 2 },
        }), 'LIVE')).toBe('READY');
    });

    it('does not report ready before the first accepted trade', () => {
        expect(getAggregateTradeIntegrityStatus(feed({
            coverage: { ...feed().coverage, sequenceState: 'LIVE', quality: 'MEDIUM' },
        }), 'LIVE')).toBe('LOADING');
    });
});
