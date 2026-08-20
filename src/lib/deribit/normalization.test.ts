import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
    BtcOpenInterest,
    Days,
    DeribitInstrumentName,
    ExpiryCode,
    NormalizedDeribitOption,
    Usd,
    VolatilityDecimal,
    VolatilityPercent,
    YearFraction,
} from './types';
import {
    DeribitValidationError,
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
        const throwingRow = {};
        Object.defineProperty(throwingRow, 'instrument_name', {
            get() {
                throw new Error('bad instrument getter');
            },
        });

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
                {
                    instrument_name: 'BTC-25DEC26-90000-C',
                    open_interest: 21_000_001,
                    mark_iv: 50,
                },
                {
                    instrument_name: 'BTC-25DEC26-95000-C',
                    mark_iv: 50,
                },
                {
                    instrument_name: 'BTC-25DEC26-100000-C',
                    open_interest: 10,
                    mark_iv: 50,
                    volume: '12',
                },
                throwingRow,
                {
                    instrument_name: 'BTC-25DEC26-105000-P',
                    open_interest: 11,
                    mark_iv: 45,
                    volume: 3,
                },
            ],
        };

        const rows = normalizeBookSummaryPayload(payload);

        expect(rows).toHaveLength(4);
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
        expect(rows[2]).toEqual({
            instrumentName: 'BTC-25DEC26-100000-C',
            openInterest: 10,
            markIv: 50,
            volume: 0,
        });
        expect(rows[3]).toEqual({
            instrumentName: 'BTC-25DEC26-105000-P',
            openInterest: 11,
            markIv: 45,
            volume: 3,
        });
    });

    it('normalizes active options and clamps IV into supported bounds', () => {
        const bookItems = normalizeBookSummaryPayload({
            result: [
                {
                    instrument_name: 'BTC-25DEC26-70000-C',
                    open_interest: 100,
                    mark_iv: 400,
                    volume: 4,
                },
                {
                    instrument_name: 'BTC-25DEC25-70000-C',
                    open_interest: 100,
                    mark_iv: 50,
                    volume: 4,
                },
                {
                    instrument_name: 'BTC-25DEC26-65000-P',
                    open_interest: 75,
                    mark_iv: null,
                    volume: 1,
                },
            ],
        });
        const options = normalizeDeribitOptions(bookItems, now);

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

        expectTypeOf(options[0]).toMatchTypeOf<NormalizedDeribitOption>();
        expectTypeOf(options[0].instrument).toMatchTypeOf<DeribitInstrumentName>();
        expectTypeOf(options[0].expiryStr).toMatchTypeOf<ExpiryCode>();
        expectTypeOf(options[0].strike).toMatchTypeOf<Usd>();
        expectTypeOf(options[0].dte).toMatchTypeOf<Days>();
        expectTypeOf(options[0].tte).toMatchTypeOf<YearFraction>();
        expectTypeOf(options[0].openInterest).toMatchTypeOf<BtcOpenInterest>();
        expectTypeOf(options[0].ivPercent).toMatchTypeOf<VolatilityPercent>();
        expectTypeOf(options[0].ivDecimal).toMatchTypeOf<VolatilityDecimal>();
    });

    it('uses fallback spot when the index result price is invalid', () => {
        expect(normalizeIndexPricePayload({ result: { index_price: 68000 } }, 69000)).toBe(68000);
        expect(normalizeIndexPricePayload({ result: { index_price: -1 } }, 69000)).toBe(69000);
        expect(normalizeIndexPricePayload({ result: { index_price: '68000' } }, 69000)).toBe(69000);
        expect(normalizeIndexPricePayload({ result: { index_price: 10_000_001 } }, 69000)).toBe(69000);
    });

    it('rejects impossible strikes and invalid normalization timestamps', () => {
        expect(parseDeribitInstrument('BTC-25DEC26-10000001-C')).toBeNull();
        expect(() => normalizeDeribitOptions([], new Date(Number.NaN))).toThrow(DeribitValidationError);
    });

    it('rejects malformed Deribit response envelopes', () => {
        expect(() => normalizeIndexPricePayload({}, 69000)).toThrow(DeribitValidationError);
        expect(() => normalizeIndexPricePayload({ error: { code: 10000 } }, 69000)).toThrow(
            DeribitValidationError
        );
        expect(() => normalizeBookSummaryPayload({ result: {} })).toThrow(DeribitValidationError);
        expect(() => normalizeBookSummaryPayload(null)).toThrow(DeribitValidationError);
    });
});
