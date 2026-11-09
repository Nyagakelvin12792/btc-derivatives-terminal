export type UsSessionPhase =
    | 'ASIA'
    | 'LONDON'
    | 'NY_PRE_MARKET'
    | 'NY_OPEN_DISCOVERY'
    | 'NY_DECISION_WINDOW'
    | 'NY_AFTERNOON'
    | 'OFF_HOURS';

export interface MacroReleaseWindowV1 {
    id: string;
    name: 'CPI' | 'FOMC' | 'NFP' | 'PPI' | 'PCE' | 'CUSTOM';
    timestampMs: number;
    suppressMinutesBefore: number;
    suppressMinutesAfter: number;
}

export interface ManualCmeContextV1 {
    fridayClosePrice: number | null;
    sundayOpenPrice: number | null;
    gapLow: number | null;
    gapHigh: number | null;
    gapFilled: boolean;
    etfNetFlowUsdMillions: number | null;
    notes: string;
}

export interface UsMarketContextSnapshotV1 {
    timestampMs: number;
    nyIsoDate: string;
    nyHour: number;
    nyMinute: number;
    nyTotalMinutesFromMidnight: number;
    isDstActive: boolean;
    sessionPhase: UsSessionPhase;
    inNyOpeningRangeWindow: boolean; // 09:30 - 10:00 ET
    inNyDecisionWindow: boolean; // 10:00 - 11:30 ET
    activeMacroBlock: {
        blocked: boolean;
        eventName: string | null;
        minutesToRelease: number | null;
    };
    cmeContext: ManualCmeContextV1;
}

/**
 * Extracts exact America/New_York wall-clock components with automatic DST handling (UX20.6-US-01).
 */
export function getNewYorkWallClock(timestampMs: number): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    nyIsoDate: string;
    isDstActive: boolean;
} {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(new Date(timestampMs));
    const getNum = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const year = getNum('year');
    const month = getNum('month');
    const day = getNum('day');
    let hour = getNum('hour');
    if (hour === 24) hour = 0;
    const minute = getNum('minute');
    const second = getNum('second');
    const tzOffset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
    const isDstActive = tzOffset.includes('-4') || tzOffset.includes('EDT');
    const nyIsoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        nyIsoDate,
        isDstActive,
    };
}

/**
 * Evaluates whether a timestamp falls within a high-impact US macro release blackout window
 * (±30 minutes around CPI/FOMC/NFP by default, per Master Plan §6.2 Gate 1).
 */
export function evaluateMacroReleaseBlock(
    timestampMs: number,
    releases: readonly MacroReleaseWindowV1[] = [],
): { blocked: boolean; eventName: string | null; minutesToRelease: number | null } {
    for (const rel of releases) {
        const diffMinutes = (timestampMs - rel.timestampMs) / 60_000;
        const before = rel.suppressMinutesBefore ?? 30;
        const after = rel.suppressMinutesAfter ?? 30;
        if (diffMinutes >= -before && diffMinutes <= after) {
            return {
                blocked: true,
                eventName: rel.name,
                minutesToRelease: Number((-diffMinutes).toFixed(1)),
            };
        }
    }
    return { blocked: false, eventName: null, minutesToRelease: null };
}

/**
 * Builds the complete US Market & Macro Context Snapshot for any UTC timestamp (UX20.6-US-01).
 */
export function evaluateUsMarketContext(
    timestampMs: number,
    releases: readonly MacroReleaseWindowV1[] = [],
    cmeOverride?: Partial<ManualCmeContextV1>,
): UsMarketContextSnapshotV1 {
    const ny = getNewYorkWallClock(timestampMs);
    const totalMinutes = ny.hour * 60 + ny.minute;

    // 09:30 ET = 570 mins; 10:00 ET = 600 mins; 11:30 ET = 690 mins; 16:00 ET = 960 mins
    const inNyOpeningRangeWindow = totalMinutes >= 570 && totalMinutes < 600;
    const inNyDecisionWindow = totalMinutes >= 600 && totalMinutes <= 690;

    let sessionPhase: UsSessionPhase = 'OFF_HOURS';
    if (totalMinutes >= 570 && totalMinutes < 600) {
        sessionPhase = 'NY_OPEN_DISCOVERY';
    } else if (totalMinutes >= 600 && totalMinutes <= 690) {
        sessionPhase = 'NY_DECISION_WINDOW';
    } else if (totalMinutes > 690 && totalMinutes < 960) {
        sessionPhase = 'NY_AFTERNOON';
    } else if (totalMinutes >= 480 && totalMinutes < 570) {
        sessionPhase = 'NY_PRE_MARKET';
    } else if (totalMinutes >= 180 && totalMinutes < 480) {
        sessionPhase = 'LONDON';
    } else {
        sessionPhase = 'ASIA';
    }

    const activeMacroBlock = evaluateMacroReleaseBlock(timestampMs, releases);

    const fridayClose = cmeOverride?.fridayClosePrice ?? null;
    const sundayOpen = cmeOverride?.sundayOpenPrice ?? null;
    const gapLow =
        fridayClose !== null && sundayOpen !== null ? Math.min(fridayClose, sundayOpen) : null;
    const gapHigh =
        fridayClose !== null && sundayOpen !== null ? Math.max(fridayClose, sundayOpen) : null;

    return {
        timestampMs,
        nyIsoDate: ny.nyIsoDate,
        nyHour: ny.hour,
        nyMinute: ny.minute,
        nyTotalMinutesFromMidnight: totalMinutes,
        isDstActive: ny.isDstActive,
        sessionPhase,
        inNyOpeningRangeWindow,
        inNyDecisionWindow,
        activeMacroBlock,
        cmeContext: {
            fridayClosePrice: fridayClose,
            sundayOpenPrice: sundayOpen,
            gapLow,
            gapHigh,
            gapFilled: cmeOverride?.gapFilled ?? false,
            etfNetFlowUsdMillions: cmeOverride?.etfNetFlowUsdMillions ?? null,
            notes: cmeOverride?.notes ?? '',
        },
    };
}
