import type { UTCTimestamp } from 'lightweight-charts';

export type VolumeProfileProvenance = 'CAPTURED_EXACT' | 'BAR_APPROXIMATED';

export interface VolumeProfileBarInput {
    time: UTCTimestamp | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    takerBuyVolume?: number;
    delta?: number;
}

export interface VolumeProfileTradeTickInput {
    price: number;
    size: number;
    side: 'buy' | 'sell';
}

export interface VolumeProfileRow {
    price: number;
    low: number;
    high: number;
    volume: number;
    upVolume: number;
    downVolume: number;
    delta: number;
    upShare: number;
    provenance?: VolumeProfileProvenance;
}

export interface VolumeProfileLevels {
    poc: number;
    vah: number;
    val: number;
    provenance?: VolumeProfileProvenance;
}

/**
 * Production Bar-Approximated Volume Profile (UX20.3-MATH-02).
 * Explicitly tags rows with provenance = 'BAR_APPROXIMATED'.
 */
export function calculateBarApproximatedVolumeProfile(
    bars: readonly VolumeProfileBarInput[],
    startIndex: number,
    endIndex: number,
    rowCount = 18,
): VolumeProfileRow[] {
    const selected = bars.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
    if (!selected.length) return [];

    const low = Math.min(...selected.map((bar) => bar.low));
    const high = Math.max(...selected.map((bar) => bar.high));
    const safeRowCount = Math.max(1, Math.round(rowCount));
    const step = Math.max((high - low) / safeRowCount, Number.EPSILON);
    const rows = Array.from({ length: safeRowCount }, (_, index) => ({
        low: low + step * index,
        high: index === safeRowCount - 1 ? high : low + step * (index + 1),
        price: low + step * (index + 0.5),
        volume: 0,
        upVolume: 0,
        downVolume: 0,
    }));

    selected.forEach((bar) => {
        if (!Number.isFinite(bar.volume) || bar.volume <= 0) return;
        const barLow = Math.max(low, Math.min(bar.low, bar.high));
        const barHigh = Math.min(high, Math.max(bar.low, bar.high));
        const firstRow = Math.min(safeRowCount - 1, Math.max(0, Math.floor((barLow - low) / step)));
        const lastRow = Math.min(safeRowCount - 1, Math.max(firstRow, Math.floor((barHigh - low) / step)));
        const allocations: Array<{ index: number; weight: number }> = [];

        for (let index = firstRow; index <= lastRow; index += 1) {
            const overlap = Math.max(0, Math.min(barHigh, rows[index].high) - Math.max(barLow, rows[index].low));
            allocations.push({ index, weight: overlap });
        }

        const totalWeight = allocations.reduce((sum, allocation) => sum + allocation.weight, 0);
        if (totalWeight <= Number.EPSILON) {
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            const index = Math.min(safeRowCount - 1, Math.max(0, Math.floor((typicalPrice - low) / step)));
            allocations.splice(0, allocations.length, { index, weight: 1 });
        }
        const normalizer = allocations.reduce((sum, allocation) => sum + allocation.weight, 0);
        const hasExactTaker =
            typeof bar.takerBuyVolume === 'number' &&
            Number.isFinite(bar.takerBuyVolume) &&
            bar.takerBuyVolume >= 0 &&
            bar.takerBuyVolume <= bar.volume;
        const upRatio = hasExactTaker ? bar.takerBuyVolume! / bar.volume : bar.close >= bar.open ? 1 : 0;

        allocations.forEach(({ index, weight }) => {
            const allocatedVolume = bar.volume * (weight / normalizer);
            const allocatedUp = allocatedVolume * upRatio;
            const allocatedDown = allocatedVolume - allocatedUp;
            rows[index].volume += allocatedVolume;
            rows[index].upVolume += allocatedUp;
            rows[index].downVolume += allocatedDown;
        });
    });

    return rows.map((row) => ({
        low: row.low,
        high: row.high,
        price: row.price,
        volume: row.volume,
        upVolume: row.upVolume,
        downVolume: row.downVolume,
        delta: row.upVolume - row.downVolume,
        upShare: row.volume ? row.upVolume / row.volume : 0.5,
        provenance: 'BAR_APPROXIMATED',
    }));
}

/**
 * Production Trade-Exact Volume Profile (UX20.3-MATH-02).
 * Bins captured trade ticks directly into price rows with provenance = 'CAPTURED_EXACT'.
 */
export function calculateCapturedTradeVolumeProfile(
    trades: readonly VolumeProfileTradeTickInput[],
    rowCount = 18,
): VolumeProfileRow[] {
    const valid = trades.filter((t) => Number.isFinite(t.price) && Number.isFinite(t.size) && t.size > 0);
    if (!valid.length) return [];

    const low = Math.min(...valid.map((t) => t.price));
    const high = Math.max(...valid.map((t) => t.price));
    const safeRowCount = Math.max(1, Math.round(rowCount));
    const step = Math.max((high - low) / safeRowCount, Number.EPSILON);
    const rows = Array.from({ length: safeRowCount }, (_, index) => ({
        low: low + step * index,
        high: index === safeRowCount - 1 ? high : low + step * (index + 1),
        price: low + step * (index + 0.5),
        volume: 0,
        upVolume: 0,
        downVolume: 0,
    }));

    for (const trade of valid) {
        const idx = Math.min(safeRowCount - 1, Math.max(0, Math.floor((trade.price - low) / step)));
        rows[idx].volume += trade.size;
        if (trade.side === 'buy') {
            rows[idx].upVolume += trade.size;
        } else {
            rows[idx].downVolume += trade.size;
        }
    }

    return rows.map((row) => ({
        low: row.low,
        high: row.high,
        price: row.price,
        volume: row.volume,
        upVolume: row.upVolume,
        downVolume: row.downVolume,
        delta: row.upVolume - row.downVolume,
        upShare: row.volume ? row.upVolume / row.volume : 0.5,
        provenance: 'CAPTURED_EXACT',
    }));
}

/**
 * Computes POC, VAH, and VAL using deterministic lower-price tie-breaking (UX20.3-MATH-02 / §6.2):
 * - POC: row with strictly highest volume (`row.volume > rows[best].volume`), so ties resolve to the lower-price row.
 * - Value Area (70%): expands outward from POC; when aboveVolume === belowVolume, prefers the lower-price side (`belowIndex`)
 *   when distances to POC are equal, or the side closer to POC first.
 */
export function calculateVolumeProfileLevels(
    rows: readonly VolumeProfileRow[],
    valueAreaFraction = 0.7,
): VolumeProfileLevels | null {
    if (!rows.length) return null;
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    if (totalVolume <= 0) {
        return {
            poc: rows[0].price,
            vah: rows[rows.length - 1].price,
            val: rows[0].price,
            provenance: rows[0].provenance,
        };
    }

    // Strict `>` preserves the lower index (lower price) on exact volume ties.
    const pocIndex = rows.reduce((best, row, index) => (row.volume > rows[best].volume ? index : best), 0);
    const target = totalVolume * Math.max(0, Math.min(1, valueAreaFraction));
    let included = rows[pocIndex].volume;
    let lowIndex = pocIndex;
    let highIndex = pocIndex;

    while (included < target && (lowIndex > 0 || highIndex < rows.length - 1)) {
        const belowIndex = lowIndex > 0 ? lowIndex - 1 : null;
        const aboveIndex = highIndex < rows.length - 1 ? highIndex + 1 : null;
        const belowVolume = belowIndex === null ? -1 : rows[belowIndex].volume;
        const aboveVolume = aboveIndex === null ? -1 : rows[aboveIndex].volume;
        const belowDistance = belowIndex === null ? Number.POSITIVE_INFINITY : pocIndex - belowIndex;
        const aboveDistance = aboveIndex === null ? Number.POSITIVE_INFINITY : aboveIndex - pocIndex;

        // Lower-price tie-break: when aboveVolume === belowVolume and distances are equal, choose below (`chooseAbove = false`)
        const chooseAbove =
            aboveVolume > belowVolume ||
            (aboveVolume === belowVolume && aboveDistance < belowDistance);
        const nextIndex = chooseAbove ? aboveIndex : belowIndex;
        if (nextIndex === null) break;
        const nextVolume = rows[nextIndex].volume;
        included += nextVolume;
        if (chooseAbove) highIndex = nextIndex;
        else lowIndex = nextIndex;
    }

    return {
        poc: rows[pocIndex].price,
        vah: rows[highIndex].price,
        val: rows[lowIndex].price,
        provenance: rows[0].provenance,
    };
}
