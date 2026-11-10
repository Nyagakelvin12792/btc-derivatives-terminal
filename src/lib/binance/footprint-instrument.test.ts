import { describe, expect, it } from 'vitest';
import { normalizeFootprintInstrument } from './footprint-instrument';

describe('Footprint exchange metadata', () => {
    it('reads the BTCUSDT Spot price filter independently of display grouping', () => {
        expect(normalizeFootprintInstrument({ symbols: [
            { symbol: 'OTHER', filters: [{ filterType: 'PRICE_FILTER', tickSize: '100' }] },
            { symbol: 'BTCUSDT', filters: [{ filterType: 'LOT_SIZE' }, { filterType: 'PRICE_FILTER', tickSize: '0.01000000' }] },
        ] })).toEqual({ venue: 'BINANCE_SPOT', symbol: 'BTCUSDT', tickSize: 0.01 });
    });

    it('rejects missing or disabled price increments', () => {
        expect(() => normalizeFootprintInstrument({ symbols: [] })).toThrow();
        expect(() => normalizeFootprintInstrument({ symbols: [
            { symbol: 'BTCUSDT', filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.0' }] },
        ] })).toThrow();
    });
});
