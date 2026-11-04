import { describe, expect, it } from 'vitest';
import {
    SimulatedOrderFillEngine,
    type PriceTick,
} from './order-fill-engine';

describe('SimulatedOrderFillEngine (UX19.4)', () => {
    it('executes a market buy order immediately at current price', () => {
        const engine = new SimulatedOrderFillEngine('BTCUSDT');
        const order = engine.submitOrder({
            side: 'BUY',
            type: 'MARKET',
            quantity: 1.5,
            currentPrice: 78500,
        });

        expect(order.status).toBe('FILLED');
        expect(order.filledQuantity).toBe(1.5);
        expect(order.avgFillPrice).toBe(78500);
        expect(order.feePaid).toBe(78500 * 1.5 * 0.0005); // taker fee

        const pos = engine.getPosition();
        expect(pos.side).toBe('LONG');
        expect(pos.quantity).toBe(1.5);
        expect(pos.avgEntryPrice).toBe(78500);
    });

    it('holds limit orders as open until price reaches limit level', () => {
        const engine = new SimulatedOrderFillEngine('BTCUSDT');
        const limitOrder = engine.submitOrder({
            side: 'BUY',
            type: 'LIMIT',
            quantity: 1.0,
            limitPrice: 78000,
        });

        expect(limitOrder.status).toBe('OPEN');
        expect(limitOrder.filledQuantity).toBe(0);

        // Tick does not touch limit price (low 78200)
        const tick1: PriceTick = {
            time: 1700000001,
            bid: 78250,
            ask: 78260,
            last: 78255,
            high: 78400,
            low: 78200,
            volume: 10,
        };
        engine.processTick(tick1);
        expect(engine.getOrder(limitOrder.id)?.status).toBe('OPEN');

        // Tick touches limit price (low 77950)
        const tick2: PriceTick = {
            time: 1700000002,
            bid: 77990,
            ask: 78000,
            last: 77995,
            high: 78100,
            low: 77950,
            volume: 15,
        };
        engine.processTick(tick2);
        const filled = engine.getOrder(limitOrder.id);
        expect(filled?.status).toBe('FILLED');
        expect(filled?.filledQuantity).toBe(1.0);
        expect(filled?.avgFillPrice).toBe(78000);
        expect(filled?.feePaid).toBe(78000 * 1.0 * 0.0002); // maker fee
    });

    it('cancels open orders without affecting flat position', () => {
        const engine = new SimulatedOrderFillEngine('BTCUSDT');
        const order = engine.submitOrder({
            side: 'SELL',
            type: 'LIMIT',
            quantity: 0.5,
            limitPrice: 80000,
        });

        expect(order.status).toBe('OPEN');
        const cancelled = engine.cancelOrder(order.id);
        expect(cancelled).toBe(true);
        expect(engine.getOrder(order.id)?.status).toBe('CANCELLED');
        expect(engine.getPosition().side).toBe('FLAT');
    });

    it('triggers stop loss and records realized loss with R-multiple', () => {
        const engine = new SimulatedOrderFillEngine('BTCUSDT');
        // Buy 1 BTC at 78,000 with SL at 77,000 (risk = $1,000)
        engine.submitOrder({
            side: 'BUY',
            type: 'MARKET',
            quantity: 1.0,
            currentPrice: 78000,
            stopLossPrice: 77000,
        });

        const tickDrop: PriceTick = {
            time: 1700000010,
            bid: 76900,
            ask: 76910,
            last: 76900,
            high: 77500,
            low: 76800,
            volume: 45,
        };
        engine.processTick(tickDrop);

        const pos = engine.getPosition();
        expect(pos.side).toBe('FLAT');
        expect(pos.quantity).toBe(0);
        expect(pos.realizedPnl).toBeLessThan(-900); // approx -$1,000 or worse with slippage
        expect(pos.rMultiple).toBeLessThan(0);
    });

    it('executes partial take profits and updates remaining quantity', () => {
        const engine = new SimulatedOrderFillEngine('BTCUSDT');
        // Buy 2.0 BTC at 78,000 with TP1 at 79,000 (50%) and SL at 77,000
        engine.submitOrder({
            side: 'BUY',
            type: 'MARKET',
            quantity: 2.0,
            currentPrice: 78000,
            stopLossPrice: 77000,
            takeProfits: [
                { price: 79000, allocationPercent: 50 },
                { price: 80000, allocationPercent: 50 },
            ],
        });

        expect(engine.getPosition().quantity).toBe(2.0);

        // Price reaches 79,200 (hits TP1)
        const tickUp: PriceTick = {
            time: 1700000020,
            bid: 79190,
            ask: 79200,
            last: 79200,
            high: 79250,
            low: 78500,
            volume: 80,
        };
        engine.processTick(tickUp);

        const pos = engine.getPosition();
        expect(pos.quantity).toBe(1.0); // 50% closed
        expect(pos.realizedPnl).toBe(1000); // ($79,000 - $78,000) * 1.0 = $1,000
        expect(pos.takeProfits[0].hit).toBe(true);
        expect(pos.takeProfits[1].hit).toBe(false);
    });
});
