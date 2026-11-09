import { z } from 'zod';

export const INSTRUMENT_REGISTRY_VERSION = 'instrument-registry-v1' as const;

export const QuoteCurrencySchema = z.enum(['USDT', 'USD', 'BTC']);
export type QuoteCurrency = z.infer<typeof QuoteCurrencySchema>;

export const BaseCurrencySchema = z.enum(['BTC']);
export type BaseCurrency = z.infer<typeof BaseCurrencySchema>;

export const SourceModeSchema = z.enum(['LIVE', 'REPLAY', 'HISTORICAL_PREVIEW', 'DEMO', 'UNAVAILABLE']);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const VenueIdSchema = z.enum(['BINANCE_SPOT', 'DERIBIT', 'COINBASE_SPOT', 'KRAKEN_SPOT', 'CME_MANUAL']);
export type VenueId = z.infer<typeof VenueIdSchema>;

export interface InstrumentSpecification {
    readonly instrumentId: string;
    readonly venue: VenueId;
    readonly symbol: string;
    readonly baseCurrency: BaseCurrency;
    readonly quoteCurrency: QuoteCurrency;
    readonly settlementCurrency: QuoteCurrency;
    readonly contractMultiplierBtc: number;
    readonly priceTick: number;
    readonly quantityStepBtc: number;
    readonly minQuantityBtc: number;
    readonly minNotionalQuote: number;
    readonly maxQuantityBtc: number;
    readonly expirySettlementUtcHour: number | null;
    readonly registryVersion: typeof INSTRUMENT_REGISTRY_VERSION;
}

export const INSTRUMENT_REGISTRY: Readonly<Record<string, InstrumentSpecification>> = {
    'BINANCE_SPOT:BTCUSDT': {
        instrumentId: 'BINANCE_SPOT:BTCUSDT',
        venue: 'BINANCE_SPOT',
        symbol: 'BTCUSDT',
        baseCurrency: 'BTC',
        quoteCurrency: 'USDT',
        settlementCurrency: 'USDT',
        contractMultiplierBtc: 1,
        priceTick: 0.01,
        quantityStepBtc: 0.00001,
        minQuantityBtc: 0.00001,
        minNotionalQuote: 5,
        maxQuantityBtc: 1000,
        expirySettlementUtcHour: null,
        registryVersion: INSTRUMENT_REGISTRY_VERSION,
    },
    'COINBASE_SPOT:BTC-USD': {
        instrumentId: 'COINBASE_SPOT:BTC-USD',
        venue: 'COINBASE_SPOT',
        symbol: 'BTC-USD',
        baseCurrency: 'BTC',
        quoteCurrency: 'USD',
        settlementCurrency: 'USD',
        contractMultiplierBtc: 1,
        priceTick: 0.01,
        quantityStepBtc: 0.00000001,
        minQuantityBtc: 0.0001,
        minNotionalQuote: 1,
        maxQuantityBtc: 1000,
        expirySettlementUtcHour: null,
        registryVersion: INSTRUMENT_REGISTRY_VERSION,
    },
    'KRAKEN_SPOT:XBTUSD': {
        instrumentId: 'KRAKEN_SPOT:XBTUSD',
        venue: 'KRAKEN_SPOT',
        symbol: 'XBTUSD',
        baseCurrency: 'BTC',
        quoteCurrency: 'USD',
        settlementCurrency: 'USD',
        contractMultiplierBtc: 1,
        priceTick: 0.1,
        quantityStepBtc: 0.00001,
        minQuantityBtc: 0.0001,
        minNotionalQuote: 1,
        maxQuantityBtc: 1000,
        expirySettlementUtcHour: null,
        registryVersion: INSTRUMENT_REGISTRY_VERSION,
    },
    'DERIBIT:BTC-OPT': {
        instrumentId: 'DERIBIT:BTC-OPT',
        venue: 'DERIBIT',
        symbol: 'BTC-OPT',
        baseCurrency: 'BTC',
        quoteCurrency: 'USD',
        settlementCurrency: 'BTC',
        contractMultiplierBtc: 1,
        priceTick: 0.5,
        quantityStepBtc: 0.1,
        minQuantityBtc: 0.1,
        minNotionalQuote: 10,
        maxQuantityBtc: 5000,
        expirySettlementUtcHour: 8,
        registryVersion: INSTRUMENT_REGISTRY_VERSION,
    },
};

export type ExceptionReasonCode =
    | 'UNKNOWN_INSTRUMENT'
    | 'CURRENCY_MISMATCH'
    | 'INVALID_TIMESTAMP'
    | 'TIMESTAMP_DRIFT_CONVERTED'
    | 'NONFINITE_PRICE_OR_QTY'
    | 'CROSSED_BOOK'
    | 'STALE_SNAPSHOT'
    | 'DUPLICATE_SEQUENCE'
    | 'SEQUENCE_GAP'
    | 'MISSING_IV';

export interface MarketDataExceptionEntry {
    readonly index: number;
    readonly instrumentId: string;
    readonly code: ExceptionReasonCode;
    readonly detail: string;
    readonly eventTimeMs: number | null;
}

export interface CanonicalTradeEvent {
    readonly instrumentId: string;
    readonly venue: VenueId;
    readonly symbol: string;
    readonly quoteCurrency: QuoteCurrency;
    readonly tradeId: number;
    readonly priceQuote: number;
    readonly quantityBtc: number;
    readonly notionalQuote: number;
    readonly aggressorSide: 'BUY' | 'SELL';
    readonly eventTimeMs: number;
    readonly receiveTimeMs: number;
    readonly sourceMode: SourceMode;
}

export interface CanonicalBookTopEvent {
    readonly instrumentId: string;
    readonly venue: VenueId;
    readonly quoteCurrency: QuoteCurrency;
    readonly sequenceId: number;
    readonly bidPrice: number;
    readonly bidQtyBtc: number;
    readonly askPrice: number;
    readonly askQtyBtc: number;
    readonly spreadBps: number;
    readonly eventTimeMs: number;
    readonly receiveTimeMs: number;
    readonly isStale: boolean;
}

export interface CanonicalOptionContractSnapshot {
    readonly instrumentId: string;
    readonly deribitSymbol: string;
    readonly strikeUsd: number;
    readonly expiryIsoUtc: string;
    readonly optionType: 'call' | 'put';
    readonly openInterestContracts: number;
    readonly openInterestBtc: number;
    readonly openInterestUsdNotional: number;
    readonly markIvPercent: number | null;
    readonly spotIndexUsd: number;
    readonly eventTimeMs: number;
    readonly receiveTimeMs: number;
}

export function getInstrumentSpec(instrumentId: string): InstrumentSpecification | null {
    return INSTRUMENT_REGISTRY[instrumentId] ?? null;
}

/**
 * Normalizes epoch timestamps that may arrive in seconds, milliseconds, or microseconds.
 * Returns normalized milliseconds and whether a unit conversion was applied.
 */
export function normalizeEpochTimestampMs(rawTimestamp: unknown): {
    timestampMs: number | null;
    convertedFrom: 'SECONDS' | 'MILLISECONDS' | 'MICROSECONDS' | null;
} {
    if (typeof rawTimestamp !== 'number' || !Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
        return { timestampMs: null, convertedFrom: null };
    }
    // Microseconds: > 1e14 (e.g., 1_760_000_000_000_000)
    if (rawTimestamp >= 1e14) {
        return { timestampMs: Math.round(rawTimestamp / 1000), convertedFrom: 'MICROSECONDS' };
    }
    // Milliseconds: >= 1e11 (e.g., 1_760_000_000_000)
    if (rawTimestamp >= 1e11) {
        return { timestampMs: Math.round(rawTimestamp), convertedFrom: 'MILLISECONDS' };
    }
    // Seconds: >= 1e9 (e.g., 1_760_000_000)
    if (rawTimestamp >= 1e9) {
        return { timestampMs: Math.round(rawTimestamp * 1000), convertedFrom: 'SECONDS' };
    }
    return { timestampMs: null, convertedFrom: null };
}

/**
 * Converts Deribit option contract Open Interest to BTC and USD notional once,
 * preventing double multiplication by contract multiplier or spot price.
 */
export function normalizeDeribitOpenInterest(input: {
    openInterestContracts: number;
    spotIndexUsd: number;
    contractMultiplierBtc?: number;
}): {
    openInterestBtc: number;
    openInterestUsdNotional: number;
} {
    const multiplier = input.contractMultiplierBtc ?? 1;
    if (
        !Number.isFinite(input.openInterestContracts) ||
        input.openInterestContracts < 0 ||
        !Number.isFinite(input.spotIndexUsd) ||
        input.spotIndexUsd <= 0 ||
        !Number.isFinite(multiplier) ||
        multiplier <= 0
    ) {
        throw new Error('Invalid Deribit Open Interest or spot index inputs');
    }
    const openInterestBtc = input.openInterestContracts * multiplier;
    const openInterestUsdNotional = openInterestBtc * input.spotIndexUsd;
    return {
        openInterestBtc,
        openInterestUsdNotional,
    };
}

export interface RawTradeAdapterInput {
    readonly instrumentId: string;
    readonly declaredQuoteCurrency?: QuoteCurrency;
    readonly tradeId: number;
    readonly price: number;
    readonly quantity: number;
    readonly isBuyerMaker: boolean;
    readonly eventTime: number;
    readonly receiveTime: number;
    readonly sourceMode?: SourceMode;
}

export interface TradeReconciliationResult {
    readonly accepted: CanonicalTradeEvent[];
    readonly exceptions: MarketDataExceptionEntry[];
    readonly totalInputCount: number;
    readonly acceptedCount: number;
    readonly totalVolumeBtc: number;
    readonly totalNotionalQuote: number;
}

export function reconcileAdapterTradeEvents(
    inputs: readonly RawTradeAdapterInput[],
): TradeReconciliationResult {
    const accepted: CanonicalTradeEvent[] = [];
    const exceptions: MarketDataExceptionEntry[] = [];
    let lastTradeIdByInstrument = new Map<string, number>();
    let totalVolumeBtc = 0;
    let totalNotionalQuote = 0;

    inputs.forEach((raw, index) => {
        const spec = getInstrumentSpec(raw.instrumentId);
        if (!spec) {
            exceptions.push({
                index,
                instrumentId: raw.instrumentId,
                code: 'UNKNOWN_INSTRUMENT',
                detail: `Unregistered instrument ${raw.instrumentId}`,
                eventTimeMs: null,
            });
            return;
        }

        if (raw.declaredQuoteCurrency && raw.declaredQuoteCurrency !== spec.quoteCurrency) {
            exceptions.push({
                index,
                instrumentId: raw.instrumentId,
                code: 'CURRENCY_MISMATCH',
                detail: `Declared quote currency ${raw.declaredQuoteCurrency} does not match ${spec.quoteCurrency}; currency relabeling forbidden`,
                eventTimeMs: null,
            });
            return;
        }

        const normEvent = normalizeEpochTimestampMs(raw.eventTime);
        const normReceive = normalizeEpochTimestampMs(raw.receiveTime);
        if (normEvent.timestampMs === null || normReceive.timestampMs === null) {
            exceptions.push({
                index,
                instrumentId: raw.instrumentId,
                code: 'INVALID_TIMESTAMP',
                detail: 'Invalid eventTime or receiveTime',
                eventTimeMs: null,
            });
            return;
        }

        if (normEvent.convertedFrom === 'MICROSECONDS' || normEvent.convertedFrom === 'SECONDS') {
            exceptions.push({
                index,
                instrumentId: raw.instrumentId,
                code: 'TIMESTAMP_DRIFT_CONVERTED',
                detail: `Converted eventTime from ${normEvent.convertedFrom} to MILLISECONDS`,
                eventTimeMs: normEvent.timestampMs,
            });
        }

        if (
            !Number.isFinite(raw.price) ||
            raw.price <= 0 ||
            !Number.isFinite(raw.quantity) ||
            raw.quantity <= 0 ||
            !Number.isInteger(raw.tradeId) ||
            raw.tradeId <= 0
        ) {
            exceptions.push({
                index,
                instrumentId: raw.instrumentId,
                code: 'NONFINITE_PRICE_OR_QTY',
                detail: 'Non-finite or non-positive price, quantity, or tradeId',
                eventTimeMs: normEvent.timestampMs,
            });
            return;
        }

        const prevId = lastTradeIdByInstrument.get(raw.instrumentId);
        if (prevId !== undefined) {
            if (raw.tradeId <= prevId) {
                exceptions.push({
                    index,
                    instrumentId: raw.instrumentId,
                    code: 'DUPLICATE_SEQUENCE',
                    detail: `Trade ID ${raw.tradeId} <= previous ${prevId}`,
                    eventTimeMs: normEvent.timestampMs,
                });
                return;
            }
            if (raw.tradeId > prevId + 1) {
                exceptions.push({
                    index,
                    instrumentId: raw.instrumentId,
                    code: 'SEQUENCE_GAP',
                    detail: `Gap detected from ${prevId} to ${raw.tradeId}`,
                    eventTimeMs: normEvent.timestampMs,
                });
            }
        }
        lastTradeIdByInstrument.set(raw.instrumentId, raw.tradeId);

        const quantityBtc = raw.quantity * spec.contractMultiplierBtc;
        const notionalQuote = raw.price * quantityBtc;
        totalVolumeBtc += quantityBtc;
        totalNotionalQuote += notionalQuote;

        accepted.push({
            instrumentId: spec.instrumentId,
            venue: spec.venue,
            symbol: spec.symbol,
            quoteCurrency: spec.quoteCurrency,
            tradeId: raw.tradeId,
            priceQuote: raw.price,
            quantityBtc,
            notionalQuote,
            aggressorSide: raw.isBuyerMaker ? 'SELL' : 'BUY',
            eventTimeMs: normEvent.timestampMs,
            receiveTimeMs: normReceive.timestampMs,
            sourceMode: raw.sourceMode ?? 'LIVE',
        });
    });

    return {
        accepted,
        exceptions,
        totalInputCount: inputs.length,
        acceptedCount: accepted.length,
        totalVolumeBtc,
        totalNotionalQuote,
    };
}

export function validateBookTopSnapshot(input: {
    instrumentId: string;
    sequenceId: number;
    bidPrice: number;
    bidQtyBtc: number;
    askPrice: number;
    askQtyBtc: number;
    eventTimeMs: number;
    receiveTimeMs: number;
    maxAgeMs?: number;
}): {
    event: CanonicalBookTopEvent | null;
    exception: MarketDataExceptionEntry | null;
} {
    const spec = getInstrumentSpec(input.instrumentId);
    if (!spec) {
        return {
            event: null,
            exception: {
                index: 0,
                instrumentId: input.instrumentId,
                code: 'UNKNOWN_INSTRUMENT',
                detail: `Unknown instrument ${input.instrumentId}`,
                eventTimeMs: null,
            },
        };
    }

    if (
        !Number.isFinite(input.bidPrice) ||
        !Number.isFinite(input.askPrice) ||
        input.bidPrice <= 0 ||
        input.askPrice <= 0 ||
        !Number.isFinite(input.bidQtyBtc) ||
        !Number.isFinite(input.askQtyBtc) ||
        input.bidQtyBtc <= 0 ||
        input.askQtyBtc <= 0
    ) {
        return {
            event: null,
            exception: {
                index: 0,
                instrumentId: input.instrumentId,
                code: 'NONFINITE_PRICE_OR_QTY',
                detail: 'Invalid bid/ask price or quantity',
                eventTimeMs: input.eventTimeMs,
            },
        };
    }

    if (input.bidPrice >= input.askPrice) {
        return {
            event: null,
            exception: {
                index: 0,
                instrumentId: input.instrumentId,
                code: 'CROSSED_BOOK',
                detail: `Crossed or locked book: bid ${input.bidPrice} >= ask ${input.askPrice}`,
                eventTimeMs: input.eventTimeMs,
            },
        };
    }

    const maxAgeMs = input.maxAgeMs ?? 2000;
    const ageMs = Math.max(0, input.receiveTimeMs - input.eventTimeMs);
    const isStale = ageMs > maxAgeMs;
    const mid = (input.bidPrice + input.askPrice) / 2;
    const spreadBps = ((input.askPrice - input.bidPrice) / mid) * 10_000;

    return {
        event: {
            instrumentId: spec.instrumentId,
            venue: spec.venue,
            quoteCurrency: spec.quoteCurrency,
            sequenceId: input.sequenceId,
            bidPrice: input.bidPrice,
            bidQtyBtc: input.bidQtyBtc,
            askPrice: input.askPrice,
            askQtyBtc: input.askQtyBtc,
            spreadBps,
            eventTimeMs: input.eventTimeMs,
            receiveTimeMs: input.receiveTimeMs,
            isStale,
        },
        exception: isStale
            ? {
                  index: 0,
                  instrumentId: input.instrumentId,
                  code: 'STALE_SNAPSHOT',
                  detail: `Quote age ${ageMs}ms exceeds ${maxAgeMs}ms threshold`,
                  eventTimeMs: input.eventTimeMs,
              }
            : null,
    };
}
