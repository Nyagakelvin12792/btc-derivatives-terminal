import type {
    BtcOpenInterest,
    BtcVolume,
    Days,
    DeribitBookSummaryItem,
    DeribitInstrumentName,
    ExpiryCode,
    NormalizedDeribitOption,
    OptionType,
    ParsedDeribitInstrument,
    Usd,
    VolatilityDecimal,
    VolatilityPercent,
    YearFraction,
} from './types';

const MONTH_MAP: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
};

const INSTRUMENT_RE = /^BTC-(\d{1,2}[A-Z]{3}\d{2})-(\d+(?:\.\d+)?)-(C|P)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function asDeribitInstrumentName(value: string): DeribitInstrumentName {
    return value as DeribitInstrumentName;
}

function asExpiryCode(value: string): ExpiryCode {
    return value as ExpiryCode;
}

function asUsd(value: number): Usd {
    return value as Usd;
}

function asDays(value: number): Days {
    return value as Days;
}

function asYearFraction(value: number): YearFraction {
    return value as YearFraction;
}

function asVolatilityPercent(value: number): VolatilityPercent {
    return value as VolatilityPercent;
}

function asVolatilityDecimal(value: number): VolatilityDecimal {
    return value as VolatilityDecimal;
}

function asBtcOpenInterest(value: number): BtcOpenInterest {
    return value as BtcOpenInterest;
}

function asBtcVolume(value: number): BtcVolume {
    return value as BtcVolume;
}

export class DeribitValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeribitValidationError';
    }
}

function assertDeribitEnvelope(payload: unknown, expectedResult: 'object' | 'array'): Record<string, unknown> {
    if (!isRecord(payload)) {
        throw new DeribitValidationError('Deribit payload must be a JSON object');
    }

    if ('error' in payload) {
        throw new DeribitValidationError('Deribit payload contains an error response');
    }

    const { result } = payload;
    if (expectedResult === 'array') {
        if (!Array.isArray(result)) {
            throw new DeribitValidationError('Deribit result must be an array');
        }
    } else if (!isRecord(result)) {
        throw new DeribitValidationError('Deribit result must be an object');
    }

    return payload;
}

export function parseDeribitExpiry(expiryStr: string): Date | null {
    const match = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(expiryStr);
    if (!match) return null;

    const day = Number.parseInt(match[1], 10);
    const month = MONTH_MAP[match[2]];
    const year = 2000 + Number.parseInt(match[3], 10);
    if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) return null;

    const expiryDate = new Date(Date.UTC(year, month, day, 8, 0, 0));
    if (
        expiryDate.getUTCFullYear() !== year ||
        expiryDate.getUTCMonth() !== month ||
        expiryDate.getUTCDate() !== day
    ) {
        return null;
    }

    return expiryDate;
}

export function parseDeribitInstrument(instrumentName: unknown): ParsedDeribitInstrument | null {
    if (typeof instrumentName !== 'string') return null;

    const match = INSTRUMENT_RE.exec(instrumentName);
    if (!match) return null;

    const expiryStr = match[1];
    const expiryDate = parseDeribitExpiry(expiryStr);
    const strike = Number.parseFloat(match[2]);
    const type: OptionType = match[3] === 'C' ? 'call' : 'put';

    if (!expiryDate || !Number.isFinite(strike) || strike <= 0) return null;

    return {
        instrument: asDeribitInstrumentName(instrumentName),
        currency: 'BTC',
        expiryStr: asExpiryCode(expiryStr),
        expiryDate,
        strike: asUsd(strike),
        type,
    };
}

export function normalizeIndexPricePayload(payload: unknown, fallbackSpotPrice: number): Usd {
    const envelope = assertDeribitEnvelope(payload, 'object');
    const result = envelope.result as Record<string, unknown>;

    const indexPrice = finiteNumber(result.index_price);
    return indexPrice !== null && indexPrice > 0 ? asUsd(indexPrice) : asUsd(fallbackSpotPrice);
}

export function normalizeBookSummaryPayload(payload: unknown): DeribitBookSummaryItem[] {
    const envelope = assertDeribitEnvelope(payload, 'array');
    const result = envelope.result as unknown[];

    const normalized: DeribitBookSummaryItem[] = [];
    for (const item of result) {
        if (!isRecord(item)) continue;

        const parsed = parseDeribitInstrument(item.instrument_name);
        if (!parsed) continue;

        const openInterest = finiteNumber(item.open_interest);
        if (openInterest === null || openInterest < 0) continue;

        const markIv = finiteNumber(item.mark_iv);
        const volume = finiteNumber(item.volume);

        normalized.push({
            instrumentName: parsed.instrument,
            openInterest: asBtcOpenInterest(openInterest),
            markIv: markIv !== null && markIv > 0 ? asVolatilityPercent(markIv) : null,
            volume: asBtcVolume(volume !== null && volume > 0 ? volume : 0),
        });
    }

    return normalized;
}

export function normalizeDeribitOptions(
    bookItems: readonly DeribitBookSummaryItem[],
    now: Date
): NormalizedDeribitOption[] {
    const options: NormalizedDeribitOption[] = [];

    for (const item of bookItems) {
        const parsed = parseDeribitInstrument(item.instrumentName);
        if (!parsed) continue;

        const msDiff = parsed.expiryDate.getTime() - now.getTime();
        if (msDiff <= 0) continue;

        const dte = Math.max(0.1, msDiff / (1000 * 60 * 60 * 24));
        const ivPercent = item.markIv === null ? 50 : clamp(item.markIv, 5, 300);
        const ivDecimal = ivPercent / 100;

        options.push({
            ...parsed,
            dte: asDays(dte),
            tte: asYearFraction(dte / 365),
            openInterest: item.openInterest,
            ivDecimal: asVolatilityDecimal(ivDecimal),
            ivPercent: asVolatilityPercent(ivPercent),
            volume: item.volume,
        });
    }

    return options;
}
