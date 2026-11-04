import type { DemoMarketBar } from '../ui/market-fixtures';

export type SessionType = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';

export interface TradingSessionBox {
    id: string;
    session: SessionType;
    label: string;
    startTime: number;
    endTime: number;
    high: number;
    low: number;
    open: number;
    close: number;
    volume: number;
    range: number;
    isCurrent: boolean;
    fillColor: string;
    borderColor: string;
    tagColor: string;
}

export interface SessionSchedule {
    session: SessionType;
    label: string;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    fillColor: string;
    borderColor: string;
    tagColor: string;
}

export const SESSION_SCHEDULES: SessionSchedule[] = [
    {
        session: 'ASIA',
        label: 'AS',
        startHour: 0,
        startMinute: 0,
        endHour: 9,
        endMinute: 0,
        fillColor: 'rgba(168, 85, 247, 0.05)',
        borderColor: 'rgba(168, 85, 247, 0.35)',
        tagColor: '#C084FC',
    },
    {
        session: 'LONDON',
        label: 'LON',
        startHour: 7,
        startMinute: 0,
        endHour: 16,
        endMinute: 30,
        fillColor: 'rgba(14, 165, 233, 0.05)',
        borderColor: 'rgba(14, 165, 233, 0.35)',
        tagColor: '#38BDF8',
    },
    {
        session: 'NEW_YORK',
        label: 'NY',
        startHour: 13,
        startMinute: 0,
        endHour: 21,
        endMinute: 0,
        fillColor: 'rgba(245, 158, 11, 0.05)',
        borderColor: 'rgba(245, 158, 11, 0.35)',
        tagColor: '#FBBF24',
    },
];

export function calculateTradingSessions(
    bars: DemoMarketBar[],
    options?: {
        includeOverlap?: boolean;
        maxDays?: number;
    },
): TradingSessionBox[] {
    if (!bars.length) return [];

    const includeOverlap = options?.includeOverlap ?? false;
    const maxDays = options?.maxDays ?? 3;

    // Find min and max timestamps
    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];
    const minTimeSec = Number(firstBar.time);
    const maxTimeSec = Number(lastBar.time);

    // Group bars by calendar day (UTC)
    const dayStartSec = Math.floor(minTimeSec / 86400) * 86400;
    const dayEndSec = Math.floor(maxTimeSec / 86400) * 86400;

    const schedules = includeOverlap
        ? SESSION_SCHEDULES
        : SESSION_SCHEDULES.filter((s) => s.session !== 'OVERLAP');

    const result: TradingSessionBox[] = [];

    // Iterate through days up to maxDays from newest to oldest
    const totalDays = Math.floor((dayEndSec - dayStartSec) / 86400) + 1;
    const startDayOffset = Math.max(0, totalDays - maxDays);

    for (let dayIdx = startDayOffset; dayIdx < totalDays; dayIdx++) {
        const currentDayMidnightSec = dayStartSec + dayIdx * 86400;

        for (const schedule of schedules) {
            const sessionStartSec = currentDayMidnightSec + schedule.startHour * 3600 + schedule.startMinute * 60;
            const sessionEndSec = currentDayMidnightSec + schedule.endHour * 3600 + schedule.endMinute * 60;

            // Only consider sessions that overlap with our bar time window
            if (sessionEndSec < minTimeSec || sessionStartSec > maxTimeSec) {
                continue;
            }

            // Filter bars that fall into this session
            const sessionBars = bars.filter((b) => {
                const t = Number(b.time);
                return t >= sessionStartSec && t <= sessionEndSec;
            });

            if (!sessionBars.length) continue;

            let high = -Infinity;
            let low = Infinity;
            let volume = 0;

            for (const b of sessionBars) {
                if (b.high > high) high = b.high;
                if (b.low < low) low = b.low;
                volume += b.volume;
            }

            const open = sessionBars[0].open;
            const close = sessionBars[sessionBars.length - 1].close;
            const isCurrent = maxTimeSec >= sessionStartSec && maxTimeSec <= sessionEndSec;

            result.push({
                id: `${schedule.session}-${currentDayMidnightSec}`,
                session: schedule.session,
                label: schedule.label,
                startTime: sessionStartSec,
                endTime: sessionEndSec,
                high,
                low,
                open,
                close,
                volume,
                range: high - low,
                isCurrent,
                fillColor: schedule.fillColor,
                borderColor: schedule.borderColor,
                tagColor: schedule.tagColor,
            });
        }
    }

    return result;
}
