import type { CandlestickData, LineData, UTCTimestamp } from 'lightweight-charts';

export interface DemoMarketBar extends CandlestickData<UTCTimestamp> {
    volume: number;
    takerBuyVolume?: number;
    delta?: number;
}

export interface VolumeProfileRow {
    price: number;
    volume: number;
    buyShare: number;
}

export interface VolumeProfileLevels {
    poc: number;
    vah: number;
    val: number;
}

export interface DemoAvwapBands {
    center: LineData<UTCTimestamp>[];
    upper: LineData<UTCTimestamp>[];
    lower: LineData<UTCTimestamp>[];
}

const BAR_SECONDS = 15 * 60;

export function createDemoMarketBars(spot: number, count = 192, barSeconds = BAR_SECONDS): DemoMarketBar[] {
    const end = Math.floor(Date.now() / barSeconds / 1000) * barSeconds;
    let previous = spot * 0.972;

    return Array.from({ length: count }, (_, index) => {
        const phase = index / Math.max(count - 1, 1);
        const regimeDrift = phase < 0.33 ? spot * 0.00038 : phase < 0.68 ? -spot * 0.00012 : spot * 0.00031;
        const wave = Math.sin(index / 7) * spot * 0.0031;
        const pulse = Math.cos(index / 3.1) * spot * 0.0012;
        const eventShock = index === Math.round(count * 0.61) ? -spot * 0.014 : 0;
        const open = previous;
        const close = open + regimeDrift + wave * 0.17 + pulse * 0.3 + eventShock;
        const spread = spot * (0.0018 + Math.abs(Math.sin(index / 5)) * 0.0012);
        const high = Math.max(open, close) + spread;
        const low = Math.min(open, close) - spread * 0.88;
        const volume = 180 + Math.abs(Math.sin(index / 8)) * 520 + (index % 17 === 0 ? 460 : 0);
        previous = close;

        return {
            time: (end - (count - index) * barSeconds) as UTCTimestamp,
            open,
            high,
            low,
            close,
            volume,
        };
    });
}

export function createDemoAvwapBands(bars: DemoMarketBar[], anchorIndex: number): DemoAvwapBands {
    let cumulativePriceVolume = 0;
    let cumulativeSquaredPriceVolume = 0;
    let cumulativeVolume = 0;

    const center: LineData<UTCTimestamp>[] = [];
    const upper: LineData<UTCTimestamp>[] = [];
    const lower: LineData<UTCTimestamp>[] = [];

    bars.slice(anchorIndex).forEach((bar) => {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        cumulativePriceVolume += typicalPrice * bar.volume;
        cumulativeSquaredPriceVolume += typicalPrice * typicalPrice * bar.volume;
        cumulativeVolume += bar.volume;
        const mean = cumulativePriceVolume / cumulativeVolume;
        const variance = Math.max(0, cumulativeSquaredPriceVolume / cumulativeVolume - mean * mean);
        const deviation = Math.sqrt(variance);
        center.push({ time: bar.time, value: mean });
        upper.push({ time: bar.time, value: mean + deviation });
        lower.push({ time: bar.time, value: mean - deviation });
    });

    return { center, upper, lower };
}

export function createDemoAvwap(bars: DemoMarketBar[], anchorIndex: number): LineData<UTCTimestamp>[] {
    let cumulativePriceVolume = 0;
    let cumulativeVolume = 0;

    return bars.slice(anchorIndex).map((bar) => {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        cumulativePriceVolume += typicalPrice * bar.volume;
        cumulativeVolume += bar.volume;
        return {
            time: bar.time,
            value: cumulativePriceVolume / cumulativeVolume,
        };
    });
}

export function createDemoCvd(bars: DemoMarketBar[]): DemoMarketBar[] {
    let cumulative = 0;

    return bars.map((bar, index) => {
        const direction = bar.close >= bar.open ? 1 : -1;
        const delta = direction * bar.volume * (0.38 + Math.abs(bar.close - bar.open) / Math.max(bar.high - bar.low, 1));
        const open = cumulative;
        const close = cumulative + delta;
        const wick = bar.volume * (0.08 + Math.abs(Math.sin(index / 6)) * 0.09);
        cumulative = close;
        return {
            time: bar.time,
            open,
            high: Math.max(open, close) + wick,
            low: Math.min(open, close) - wick,
            close,
            volume: bar.volume,
        };
    });
}

export function createDemoVolumeProfile(
    bars: DemoMarketBar[],
    startIndex: number,
    endIndex: number,
    rowCount = 18,
): VolumeProfileRow[] {
    const selected = bars.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
    if (!selected.length) return [];

    const low = Math.min(...selected.map((bar) => bar.low));
    const high = Math.max(...selected.map((bar) => bar.high));
    const step = Math.max((high - low) / rowCount, 1);
    const rows = Array.from({ length: rowCount }, (_, index) => ({
        price: low + step * (index + 0.5),
        volume: 0,
        buyVolume: 0,
    }));

    selected.forEach((bar) => {
        const price = (bar.high + bar.low + bar.close) / 3;
        const rowIndex = Math.min(rowCount - 1, Math.max(0, Math.floor((price - low) / step)));
        rows[rowIndex].volume += bar.volume;
        rows[rowIndex].buyVolume += bar.takerBuyVolume ?? (bar.close >= bar.open ? bar.volume : 0);
    });

    return rows.map((row) => ({
        price: row.price,
        volume: row.volume,
        buyShare: row.volume ? row.buyVolume / row.volume : 0.5,
    }));
}

export function calculateVolumeProfileLevels(rows: VolumeProfileRow[], valueAreaFraction = 0.7): VolumeProfileLevels | null {
    if (!rows.length) return null;
    const pocIndex = rows.reduce((best, row, index) => row.volume > rows[best].volume ? index : best, 0);
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    const target = totalVolume * valueAreaFraction;
    let included = rows[pocIndex].volume;
    let lowIndex = pocIndex;
    let highIndex = pocIndex;

    while (included < target && (lowIndex > 0 || highIndex < rows.length - 1)) {
        const below = lowIndex > 0 ? rows[lowIndex - 1].volume : -1;
        const above = highIndex < rows.length - 1 ? rows[highIndex + 1].volume : -1;
        if (above >= below && highIndex < rows.length - 1) {
            highIndex += 1;
            included += rows[highIndex].volume;
        } else if (lowIndex > 0) {
            lowIndex -= 1;
            included += rows[lowIndex].volume;
        } else {
            break;
        }
    }

    return {
        poc: rows[pocIndex].price,
        vah: rows[highIndex].price,
        val: rows[lowIndex].price,
    };
}
