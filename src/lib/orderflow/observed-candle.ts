import type { ClassifiedTradeV1 } from './contracts';

export interface ObservedCandle {
    open: number;
    high: number;
    low: number;
    close: number;
    firstTime: number;
    lastTime: number;
    executionCount: number | null;
    firstAggregateTradeId: number;
    lastAggregateTradeId: number;
}

/** Call in ascending aggregate ID order. A timestamp tie keeps source order. */
export function addObservedTrade(candle: ObservedCandle | undefined, trade: ClassifiedTradeV1): ObservedCandle {
    const price = trade.price;
    const isSingleExecution = trade.firstTradeId === trade.lastTradeId;
    if (!candle) {
        return {
            open: price, high: price, low: price, close: price,
            firstTime: trade.tradeTime, lastTime: trade.tradeTime,
            executionCount: isSingleExecution ? 1 : null,
            firstAggregateTradeId: trade.aggregateTradeId,
            lastAggregateTradeId: trade.aggregateTradeId,
        };
    }

    if (trade.tradeTime < candle.firstTime) {
        candle.firstTime = trade.tradeTime;
        candle.open = price;
    }
    if (trade.tradeTime >= candle.lastTime) {
        candle.lastTime = trade.tradeTime;
        candle.close = price;
    }
    candle.lastAggregateTradeId = trade.aggregateTradeId;
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    // The feed gives endpoints for multi-execution messages, without an explicit execution count.
    candle.executionCount = candle.executionCount !== null && isSingleExecution
        ? candle.executionCount + 1
        : null;
    return candle;
}

export function candleObservation(candle: ObservedCandle) {
    const { open, high, low, close, executionCount, firstAggregateTradeId, lastAggregateTradeId } = candle;
    return { observedOhlc: { open, high, low, close }, executionCount, firstAggregateTradeId, lastAggregateTradeId };
}
