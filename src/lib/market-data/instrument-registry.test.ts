import { describe, expect, it } from 'vitest';
import {
    getInstrumentSpec,
    normalizeDeribitOpenInterest,
    normalizeEpochTimestampMs,
    reconcileAdapterTradeEvents,
    validateBookTopSnapshot,
    type RawTradeAdapterInput,
} from './instrument-registry';

describe('UX20.1-UNITS-03 Instrument Registry & Event Reconciliation', () => {
    it('maintains strict separation between BTC/USDT and BTC/USD instruments', () => {
        const binance = getInstrumentSpec('BINANCE_SPOT:BTCUSDT');
        const coinbase = getInstrumentSpec('COINBASE_SPOT:BTC-USD');
        const deribit = getInstrumentSpec('DERIBIT:BTC-OPT');

        expect(binance?.quoteCurrency).toBe('USDT');
        expect(coinbase?.quoteCurrency).toBe('USD');
        expect(deribit?.quoteCurrency).toBe('USD');
        expect(deribit?.expirySettlementUtcHour).toBe(8);
    });

    it('reconciles >= 100 events per adapter and records anomalies in exception ledger', () => {
        const binanceEvents: RawTradeAdapterInput[] = [];
        const coinbaseEvents: RawTradeAdapterInput[] = [];
        const baseTimeMs = 1_762_000_000_000;

        for (let i = 1; i <= 110; i++) {
            binanceEvents.push({
                instrumentId: 'BINANCE_SPOT:BTCUSDT',
                declaredQuoteCurrency: 'USDT',
                tradeId: i,
                price: 68_000 + i,
                quantity: 0.25,
                isBuyerMaker: i % 2 === 0,
                eventTime: baseTimeMs + i * 100,
                receiveTime: baseTimeMs + i * 100 + 15,
            });
            coinbaseEvents.push({
                instrumentId: 'COINBASE_SPOT:BTC-USD',
                declaredQuoteCurrency: 'USD',
                tradeId: i,
                price: 67_990 + i,
                quantity: 0.15,
                isBuyerMaker: i % 3 === 0,
                eventTime: baseTimeMs + i * 100,
                receiveTime: baseTimeMs + i * 100 + 20,
            });
        }

        // Inject anomalies to verify exception ledger
        // 1. Currency mismatch (attempting to relabel USD as USDT)
        coinbaseEvents.push({
            instrumentId: 'COINBASE_SPOT:BTC-USD',
            declaredQuoteCurrency: 'USDT',
            tradeId: 111,
            price: 68_100,
            quantity: 0.1,
            isBuyerMaker: false,
            eventTime: baseTimeMs + 12_000,
            receiveTime: baseTimeMs + 12_010,
        });
        // 2. Duplicate trade ID
        binanceEvents.push({
            instrumentId: 'BINANCE_SPOT:BTCUSDT',
            declaredQuoteCurrency: 'USDT',
            tradeId: 110,
            price: 68_110,
            quantity: 0.1,
            isBuyerMaker: false,
            eventTime: baseTimeMs + 12_000,
            receiveTime: baseTimeMs + 12_010,
        });
        // 3. Microsecond timestamp drift
        binanceEvents.push({
            instrumentId: 'BINANCE_SPOT:BTCUSDT',
            declaredQuoteCurrency: 'USDT',
            tradeId: 112,
            price: 68_120,
            quantity: 0.5,
            isBuyerMaker: true,
            eventTime: (baseTimeMs + 13_000) * 1000, // microseconds
            receiveTime: baseTimeMs + 13_010,
        });

        const binanceResult = reconcileAdapterTradeEvents(binanceEvents);
        const coinbaseResult = reconcileAdapterTradeEvents(coinbaseEvents);

        expect(binanceResult.acceptedCount).toBe(111); // 110 + tradeId 112 (with gap & us drift logged)
        expect(coinbaseResult.acceptedCount).toBe(110);
        expect(coinbaseResult.exceptions.some((e) => e.code === 'CURRENCY_MISMATCH')).toBe(true);
        expect(binanceResult.exceptions.some((e) => e.code === 'DUPLICATE_SEQUENCE')).toBe(true);
        expect(binanceResult.exceptions.some((e) => e.code === 'SEQUENCE_GAP')).toBe(true);
        expect(binanceResult.exceptions.some((e) => e.code === 'TIMESTAMP_DRIFT_CONVERTED')).toBe(true);
    });

    it('normalizes microsecond and second timestamps without precision loss', () => {
        expect(normalizeEpochTimestampMs(1_762_000_000_000_000)).toEqual({
            timestampMs: 1_762_000_000_000,
            convertedFrom: 'MICROSECONDS',
        });
        expect(normalizeEpochTimestampMs(1_762_000_000)).toEqual({
            timestampMs: 1_762_000_000_000,
            convertedFrom: 'SECONDS',
        });
    });

    it('prevents double multiplication of Deribit Open Interest', () => {
        const res = normalizeDeribitOpenInterest({
            openInterestContracts: 250,
            spotIndexUsd: 70_000,
            contractMultiplierBtc: 1,
        });
        expect(res.openInterestBtc).toBe(250);
        expect(res.openInterestUsdNotional).toBe(17_500_000);
    });

    it('rejects crossed books and flags stale quotes (> 2000ms)', () => {
        const crossed = validateBookTopSnapshot({
            instrumentId: 'BINANCE_SPOT:BTCUSDT',
            sequenceId: 1,
            bidPrice: 68_010,
            bidQtyBtc: 1.2,
            askPrice: 68_005,
            askQtyBtc: 0.8,
            eventTimeMs: 1000,
            receiveTimeMs: 1050,
        });
        expect(crossed.event).toBeNull();
        expect(crossed.exception?.code).toBe('CROSSED_BOOK');

        const stale = validateBookTopSnapshot({
            instrumentId: 'BINANCE_SPOT:BTCUSDT',
            sequenceId: 2,
            bidPrice: 68_000,
            bidQtyBtc: 1.2,
            askPrice: 68_010,
            askQtyBtc: 0.8,
            eventTimeMs: 1000,
            receiveTimeMs: 3500,
            maxAgeMs: 2000,
        });
        expect(stale.event?.isStale).toBe(true);
        expect(stale.exception?.code).toBe('STALE_SNAPSHOT');
    });
});
