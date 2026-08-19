import { describe, expect, it } from 'vitest';
import {
    normalizeBookSummaryPayload,
    normalizeDeribitOptions,
    normalizeIndexPricePayload,
    parseDeribitExpiry,
    parseDeribitInstrument,
} from './normalization';

describe('Deribit normalization', () => {
    const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

    it('parses BTC option instruments with Deribit expiry timestamps', () => {
        const parsed = parseDeribitInstrument('BTC-25DEC26-70000-C');

        expect(parsed).toMatchObject({
            instrument: 'BTC-25DEC26-70000-C',
            currency: 'BTC',
            expiryStr: '25DEC26',
            strike: 70000,
            type: 'call',
        });
        expect(parsed?.expiryDate.toISOString()).toBe('2026-12-25T08:00:00.000Z');
    });

    it('rejects malformed instruments and invalid calendar expiries', () => {
        expect(parseDeribitInstrument('ETH-25DEC26-70000-C')).toBeNull();
        expect(parseDeribitInstrument('BTC-25DEC26-70000-X')).toBeNull();
        expect(parseDeribitInstrument('BTC-25DEC26--70000-C')).toBeNull();
        expect(parseDeribitExpiry('31FEB26')).toBeNull();
    });

    it('normalizes only valid Deribit book summary rows', () => {
        const payload = {
            result: [
                {
                    instrument_name: 'BTC-25DEC26-70000-C',
                    open_interest: 125.5,
                    mark_iv: 61.2,
                    volume: 7,
                },
                {
                    instrument_name: 'BTC-25DEC26-65000-P',
                    open_interest: 0,
                    mark_iv: null,
                },
                {
                    instrument_name: 'BTC-25DEC26-60000-P',
                    open_interest: -10,
                    mark_iv: 50,
                },
                {
                    instrument_name: 'BTC-BAD-60000-P',
                    open_interest: 10,
                    mark_iv: 50,
                },
            ],
        };

        const rows = normalizeBookSummaryPayload(payload);

        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({
            instrumentName: 'BTC-25DEC26-70000-C',
            openInterest: 125.5,
            markIv: 61.2,
            volume: 7,
        });
        expect(rows[1]).toEqual({
            instrumentName: 'BTC-25DEC26-65000-P',
            openInterest: 0,
            markIv: null,
            volume: 0,
        });
    });

    it('normalizes active options and clamps IV into supported bounds', () => {
        const options = normalizeDeribitOptions(
            [
                {
                    instrumentName: 'BTC-25DEC26-70000-C',
                    openInterest: 100,
                    markIv: 400,
                    volume: 4,
                },
                {
                    instrumentName: 'BTC-25DEC25-70000-C',
                    openInterest: 100,
                    markIv: 50,
                    volume: 4,
                },
                {
                    instrumentName: 'BTC-25DEC26-65000-P',
                    openInterest: 75,
                    markIv: null,
                    volume: 1,
                },
            ],
            now
        );

        expect(options).toHaveLength(2);
        expect(options[0]).toMatchObject({
            instrument: 'BTC-25DEC26-70000-C',
            openInterest: 100,
            ivPercent: 300,
            ivDecimal: 3,
            type: 'call',
        });
        expect(options[1]).toMatchObject({
            instrument: 'BTC-25DEC26-65000-P',
            ivPercent: 50,
            ivDecimal: 0.5,
            type: 'put',
        });
    });

    it('uses fallback spot when the index payload is invalid', () => {
        expect(normalizeIndexPricePayload({ result: { index_price: 68000 } }, 69000)).toBe(68000);
        expect(normalizeIndexPricePayload({ result: { index_price: -1 } }, 69000)).toBe(69000);
        expect(normalizeIndexPricePayload({}, 69000)).toBe(69000);
    });
});
