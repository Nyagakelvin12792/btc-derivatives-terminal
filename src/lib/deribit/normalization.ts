import type {
    DeribitBookSummaryItem,
    NormalizedDeribitOption,
    OptionType,
    ParsedDeribitInstrument,
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
        instrument: instrumentName,
        currency: 'BTC',
        expiryStr,
        expiryDate,
        strike,
        type,
    };
}

export function normalizeIndexPricePayload(payload: unknown, fallbackSpotPrice: number): number {
    if (!isRecord(payload) || !isRecord(payload.result)) return fallbackSpotPrice;

    const indexPrice = finiteNumber(payload.result.index_price);
    return indexPrice !== null && indexPrice > 0 ? indexPrice : fallbackSpotPrice;
}

export function normalizeBookSummaryPayload(payload: unknown): DeribitBookSummaryItem[] {
    if (!isRecord(payload) || !Array.isArray(payload.result)) return [];

    const normalized: DeribitBookSummaryItem[] = [];
    for (const item of payload.result) {
        if (!isRecord(item)) continue;

        const parsed = parseDeribitInstrument(item.instrument_name);
        if (!parsed) continue;

        const openInterest = finiteNumber(item.open_interest);
        if (openInterest === null || openInterest < 0) continue;

        const markIv = finiteNumber(item.mark_iv);
        const volume = finiteNumber(item.volume);

        normalized.push({
            instrumentName: parsed.instrument,
            openInterest,
            markIv: markIv !== null && markIv > 0 ? markIv : null,
            volume: volume !== null && volume > 0 ? volume : 0,
        });
    }

    return normalized;
}

export function normalizeDeribitOptions(
    bookItems: DeribitBookSummaryItem[],
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
            dte,
            tte: dte / 365,
            openInterest: item.openInterest,
            ivDecimal,
            ivPercent,
            volume: item.volume,
        });
    }

    return options;
}
