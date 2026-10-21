import type { CandlestickData, LineData, UTCTimestamp } from 'lightweight-charts';

export interface DemoMarketBar extends CandlestickData<UTCTimestamp> {
    volume: number;
}

export interface VolumeProfileRow {
    price: number;
    volume: number;
    buyShare: number;
}

const BAR_SECONDS = 15 * 60;

export function createDemoMarketBars(spot: number, count = 192): DemoMarketBar[] {
    const end = Math.floor(Date.now() / BAR_SECONDS / 1000) * BAR_SECONDS;
    let previous = spot * 0.956;

    return Array.from({ length: count }, (_, index) => {
        const wave = Math.sin(index / 7) * spot * 0.0028;
        const drift = spot * 0.00042;
        const pulse = Math.cos(index / 3.1) * spot * 0.0011;
        const open = previous;
        const close = open + drift + wave * 0.16 + pulse * 0.28;
        const spread = spot * (0.0018 + Math.abs(Math.sin(index / 5)) * 0.0012);
        const high = Math.max(open, close) + spread;
        const low = Math.min(open, close) - spread * 0.88;
        const volume = 180 + Math.abs(Math.sin(index / 8)) * 520 + (index % 17 === 0 ? 460 : 0);
        previous = close;

        return {
            time: (end - (count - index) * BAR_SECONDS) as UTCTimestamp,
            open,
            high,
            low,
            close,
            volume,
        };
    });
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
        if (bar.close >= bar.open) rows[rowIndex].buyVolume += bar.volume;
    });

    return rows.map((row) => ({
        price: row.price,
        volume: row.volume,
        buyShare: row.volume ? row.buyVolume / row.volume : 0.5,
    }));
}
