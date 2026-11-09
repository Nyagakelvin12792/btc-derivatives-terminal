/**
 * Simulated Order-Fill Engine (UX19.4)
 *
 * Implements high-fidelity paper trading execution matching real institutional BTC derivatives mechanics:
 * - Order Types: MARKET, LIMIT, STOP_MARKET, STOP_LIMIT
 * - Sides: BUY (Long), SELL (Short)
 * - Order Status: PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED, REJECTED
 * - Execution logic:
 *   - Market orders fill immediately against current ask/bid with realistic taker fee and slippage.
 *   - Limit buy fills when bar.low <= limitPrice; Limit sell fills when bar.high >= limitPrice.
 *   - Stop-market buy triggers when bar.high >= stopPrice; Stop-market sell triggers when bar.low <= stopPrice.
 *   - Stop-limit activates on stop trigger, then fills as a limit order.
 *   - Multi-tier partial take-profits (TP1, TP2, TP3) with percentage-based size de-risking.
 *   - Dynamic slippage and maker (0.02%) vs taker (0.05%) fee calculation.
 *   - Real-time position tracking: size, avgEntryPrice, unrealizedPnl, realizedPnl, R-multiple.
 */

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus =
    | 'PENDING'
    | 'OPEN'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'REJECTED';

export interface TakeProfitTarget {
    id: string;
    price: number;
    allocationPercent: number; // e.g. 50 for 50%
    hit: boolean;
    hitTimestamp?: number;
    realizedPnl?: number;
}

export interface SimulatedOrder {
    id: string;
    clientOrderId?: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number; // BTC
    limitPrice?: number;
    stopPrice?: number;
    status: OrderStatus;
    filledQuantity: number;
    avgFillPrice: number;
    feePaid: number;
    stopLossPrice?: number;
    takeProfits: TakeProfitTarget[];
    createdAt: number;
    updatedAt: number;
    notes?: string;
    setupGrade?: 'A' | 'AA' | 'AAA' | 'UNCATEGORIZED';
}

export interface PositionState {
    symbol: string;
    side: 'LONG' | 'SHORT' | 'FLAT';
    quantity: number; // BTC
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    realizedPnl: number;
    totalFees: number;
    initialRiskDollar: number;
    stopLossPrice?: number;
    takeProfits: TakeProfitTarget[];
    rMultiple: number;
    entryTimestamp: number;
    lastUpdated: number;
}

export interface PriceTick {
    time: number;
    bid: number;
    ask: number;
    last: number;
    high: number;
    low: number;
    volume: number;
}

export interface OrderFillEvent {
    orderId: string;
    timestamp: number;
    side: OrderSide;
    type: OrderType;
    fillPrice: number;
    fillQuantity: number;
    fee: number;
    isMaker: boolean;
    reason: 'MARKET_EXECUTION' | 'LIMIT_TOUCH' | 'STOP_TRIGGER' | 'TAKE_PROFIT' | 'STOP_LOSS';
}

export interface FeeStructure {
    makerFeeRate: number; // e.g. 0.0002 (0.02%)
    takerFeeRate: number; // e.g. 0.0005 (0.05%)
    baseSlippagePercent: number; // e.g. 0.0001 (0.01%)
}

export const DEFAULT_FEES: FeeStructure = {
    makerFeeRate: 0.0002, // 2 bps maker
    takerFeeRate: 0.0005, // 5 bps taker
    baseSlippagePercent: 0.0001, // 1 bp base slippage
};

export class SimulatedOrderFillEngine {
    private orders: Map<string, SimulatedOrder> = new Map();
    private position: PositionState;
    private events: OrderFillEvent[] = [];
    private fees: FeeStructure;

    constructor(symbol = 'BTCUSDT', fees = DEFAULT_FEES) {
        this.fees = fees;
        this.position = {
            symbol,
            side: 'FLAT',
            quantity: 0,
            avgEntryPrice: 0,
            currentPrice: 0,
            unrealizedPnl: 0,
            realizedPnl: 0,
            totalFees: 0,
            initialRiskDollar: 0,
            takeProfits: [],
            rMultiple: 0,
            entryTimestamp: 0,
            lastUpdated: 0,
        };
    }

    public getOrders(): SimulatedOrder[] {
        return Array.from(this.orders.values());
    }

    public getOrder(id: string): SimulatedOrder | undefined {
        return this.orders.get(id);
    }

    public getPosition(): Readonly<PositionState> {
        return this.position;
    }

    public getEvents(): ReadonlyArray<OrderFillEvent> {
        return this.events;
    }

    /**
     * Submit a new simulated order into the engine.
     * Market orders execute immediately if current price exists.
     */
    public submitOrder(params: {
        symbol?: string;
        side: OrderSide;
        type: OrderType;
        quantity: number;
        limitPrice?: number;
        stopPrice?: number;
        stopLossPrice?: number;
        takeProfits?: Array<{ price: number; allocationPercent: number }>;
        currentPrice?: number;
        notes?: string;
        setupGrade?: 'A' | 'AA' | 'AAA' | 'UNCATEGORIZED';
    }): SimulatedOrder {
        if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
            throw new Error(`Order quantity must be a finite positive number, got ${params.quantity}`);
        }
        if (params.limitPrice !== undefined && (!Number.isFinite(params.limitPrice) || params.limitPrice <= 0)) {
            throw new Error(`Order limitPrice must be a finite positive number, got ${params.limitPrice}`);
        }
        if (params.stopPrice !== undefined && (!Number.isFinite(params.stopPrice) || params.stopPrice <= 0)) {
            throw new Error(`Order stopPrice must be a finite positive number, got ${params.stopPrice}`);
        }
        if (params.stopLossPrice !== undefined && (!Number.isFinite(params.stopLossPrice) || params.stopLossPrice <= 0)) {
            throw new Error(`Order stopLossPrice must be a finite positive number, got ${params.stopLossPrice}`);
        }
        if (params.currentPrice !== undefined && (!Number.isFinite(params.currentPrice) || params.currentPrice <= 0)) {
            throw new Error(`Order currentPrice must be a finite positive number, got ${params.currentPrice}`);
        }

        if (params.takeProfits?.some((tp) => !Number.isFinite(tp.price) || tp.price <= 0
            || !Number.isFinite(tp.allocationPercent) || tp.allocationPercent <= 0 || tp.allocationPercent > 100)) {
            throw new Error('Invalid take profit price or allocation.');
        }

        const id = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const now = Date.now();

        const takeProfits: TakeProfitTarget[] = (params.takeProfits || []).map((tp, index) => ({
            id: `tp-${index + 1}-${Date.now()}`,
            price: tp.price,
            allocationPercent: tp.allocationPercent,
            hit: false,
        }));

        const order: SimulatedOrder = {
            id,
            symbol: params.symbol || this.position.symbol,
            side: params.side,
            type: params.type,
            quantity: params.quantity,
            limitPrice: params.limitPrice,
            stopPrice: params.stopPrice,
            status: 'OPEN',
            filledQuantity: 0,
            avgFillPrice: 0,
            feePaid: 0,
            stopLossPrice: params.stopLossPrice,
            takeProfits,
            createdAt: now,
            updatedAt: now,
            notes: params.notes,
            setupGrade: params.setupGrade ?? 'UNCATEGORIZED',
        };

        this.orders.set(id, order);

        // Immediate fill check for MARKET orders
        if (order.type === 'MARKET' && params.currentPrice && params.currentPrice > 0) {
            this.executeFill(order, params.currentPrice, order.quantity, false, 'MARKET_EXECUTION', now);
        }

        return order;
    }

    /**
     * Cancel an open simulated order.
     */
    public cancelOrder(id: string): boolean {
        const order = this.orders.get(id);
        if (!order) return false;
        if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
            return false;
        }

        order.status = 'CANCELLED';
        order.updatedAt = Date.now();
        return true;
    }

    /**
     * Evaluates all open orders and open position against incoming market price tick / candle.
     */
    public processTick(tick: PriceTick): void {
        if (![tick.time, tick.bid, tick.ask, tick.last, tick.high, tick.low].every((value) => Number.isFinite(value) && value > 0)
            || tick.bid > tick.ask || tick.low > tick.high || !Number.isFinite(tick.volume) || tick.volume < 0) return;
        const now = tick.time;
        let available = tick.volume;
        this.position.currentPrice = tick.last;
        this.position.lastUpdated = now;

        // 1. Process Open Orders
        for (const order of this.orders.values()) {
            if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
                continue;
            }

            const remainingQty = order.quantity - order.filledQuantity;

            switch (order.type) {
                case 'MARKET': {
                    const execPrice = order.side === 'BUY' ? tick.ask : tick.bid;
                    this.executeFill(order, execPrice, remainingQty, false, 'MARKET_EXECUTION', now);
                    break;
                }
                case 'LIMIT': {
                    if (order.side === 'BUY') {
                        // Limit Buy fills when market reaches or dips below limit price
                        if (available > 0 && tick.low < (order.limitPrice ?? 0)) {
                            const fillPrice = Math.min(order.limitPrice ?? tick.last, tick.ask);
                            const fillQty = Math.min(remainingQty, available);
                            available -= fillQty;
                            this.executeFill(order, fillPrice, fillQty, true, 'LIMIT_TOUCH', now);
                        }
                    } else {
                        // Limit Sell fills when market reaches or rises above limit price
                        if (available > 0 && tick.high > (order.limitPrice ?? 0)) {
                            const fillPrice = Math.max(order.limitPrice ?? tick.last, tick.bid);
                            const fillQty = Math.min(remainingQty, available);
                            available -= fillQty;
                            this.executeFill(order, fillPrice, fillQty, true, 'LIMIT_TOUCH', now);
                        }
                    }
                    break;
                }
                case 'STOP_MARKET': {
                    if (order.side === 'BUY') {
                        if (tick.high >= (order.stopPrice ?? Infinity)) {
                            const slippagePrice = tick.ask * (1 + this.fees.baseSlippagePercent);
                            this.executeFill(order, slippagePrice, remainingQty, false, 'STOP_TRIGGER', now);
                        }
                    } else {
                        if (tick.low <= (order.stopPrice ?? 0)) {
                            const slippagePrice = tick.bid * (1 - this.fees.baseSlippagePercent);
                            this.executeFill(order, slippagePrice, remainingQty, false, 'STOP_TRIGGER', now);
                        }
                    }
                    break;
                }
                case 'STOP_LIMIT': {
                    // When stop triggers, convert to limit order
                    if (order.side === 'BUY' && tick.high >= (order.stopPrice ?? Infinity)) {
                        order.type = 'LIMIT';
                        order.updatedAt = now;
                    } else if (order.side === 'SELL' && tick.low <= (order.stopPrice ?? 0)) {
                        order.type = 'LIMIT';
                        order.updatedAt = now;
                    }
                    break;
                }
            }
        }

        // 2. Evaluate Position Stop Loss & Take Profits
        this.evaluatePositionExitLevels(tick, now);

        // 3. Update Position Unrealized PnL and R-multiple
        this.updatePositionPnL(tick.last);
    }

    /**
     * Executes fill for an order, updates order stats and passes volume to position state.
     */
    private executeFill(
        order: SimulatedOrder,
        price: number,
        quantity: number,
        isMaker: boolean,
        reason: OrderFillEvent['reason'],
        timestamp: number
    ): void {
        const feeRate = isMaker ? this.fees.makerFeeRate : this.fees.takerFeeRate;
        const notional = price * quantity;
        const fee = notional * feeRate;

        // Update Order
        const prevQty = order.filledQuantity;
        const newQty = prevQty + quantity;
        order.avgFillPrice = (order.avgFillPrice * prevQty + price * quantity) / newQty;
        order.filledQuantity = newQty;
        order.feePaid += fee;
        order.updatedAt = timestamp;
        order.status = newQty >= order.quantity ? 'FILLED' : 'PARTIALLY_FILLED';

        // Record Event
        const fillEvent: OrderFillEvent = {
            orderId: order.id,
            timestamp,
            side: order.side,
            type: order.type,
            fillPrice: price,
            fillQuantity: quantity,
            fee,
            isMaker,
            reason,
        };
        this.events.push(fillEvent);

        // Update Position
        this.applyFillToPosition(order, price, quantity, fee, timestamp);
    }

    /**
     * Updates engine position with executed fill.
     */
    private applyFillToPosition(
        order: SimulatedOrder,
        price: number,
        quantity: number,
        fee: number,
        timestamp: number
    ): void {
        this.position.totalFees += fee;

        if (this.position.side === 'FLAT') {
            this.position.side = order.side === 'BUY' ? 'LONG' : 'SHORT';
            this.position.quantity = quantity;
            this.position.avgEntryPrice = price;
            this.position.entryTimestamp = timestamp;
            this.position.stopLossPrice = order.stopLossPrice;
            this.position.takeProfits = order.takeProfits ? [...order.takeProfits] : [];

            if (order.stopLossPrice) {
                const perUnitRisk = Math.abs(price - order.stopLossPrice);
                this.position.initialRiskDollar = perUnitRisk * quantity;
            }
            return;
        }

        // Same side: Add to position
        const isAdding =
            (this.position.side === 'LONG' && order.side === 'BUY') ||
            (this.position.side === 'SHORT' && order.side === 'SELL');

        if (isAdding) {
            const oldQty = this.position.quantity;
            const newQty = oldQty + quantity;
            this.position.avgEntryPrice =
                (this.position.avgEntryPrice * oldQty + price * quantity) / newQty;
            this.position.quantity = newQty;
            return;
        }

        // Opposite side: Reducing or closing position
        const closeQty = Math.min(this.position.quantity, quantity);
        const pnlPerUnit =
            this.position.side === 'LONG'
                ? price - this.position.avgEntryPrice
                : this.position.avgEntryPrice - price;
        const realized = pnlPerUnit * closeQty;

        this.position.realizedPnl += realized;
        this.position.quantity -= closeQty;

        const residual = quantity - closeQty;
        if (residual > 0.0000001) {
            this.position.side = order.side === 'BUY' ? 'LONG' : 'SHORT';
            this.position.entryTimestamp = timestamp;
            this.position.quantity = residual;
            this.position.avgEntryPrice = price;
            this.position.unrealizedPnl = 0;
            this.position.stopLossPrice = order.stopLossPrice;
            this.position.takeProfits = order.takeProfits.map((target) => ({ ...target }));
            this.position.initialRiskDollar = order.stopLossPrice === undefined ? 0 : Math.abs(price - order.stopLossPrice) * residual;
            return;
        }
        if (this.position.quantity <= 0.0000001) {
            this.position.quantity = 0;
            this.position.side = 'FLAT';
            this.position.avgEntryPrice = 0;
            this.position.unrealizedPnl = 0;
            this.position.stopLossPrice = undefined;
            this.position.takeProfits = [];
        }
    }

    /**
     * Evaluates open position SL and multi-tier TPs against price candle.
     */
    private evaluatePositionExitLevels(tick: PriceTick, timestamp: number): void {
        if (this.position.side === 'FLAT' || this.position.quantity <= 0) {
            return;
        }

        // 1. Check Stop Loss
        if (this.position.stopLossPrice) {
            let slHit = false;
            let slExecPrice = this.position.stopLossPrice;

            if (this.position.side === 'LONG' && tick.low <= this.position.stopLossPrice) {
                slHit = true;
                slExecPrice = Math.min(tick.low, this.position.stopLossPrice);
            } else if (this.position.side === 'SHORT' && tick.high >= this.position.stopLossPrice) {
                slHit = true;
                slExecPrice = Math.max(tick.high, this.position.stopLossPrice);
            }

            if (slHit) {
                const exitSide: OrderSide = this.position.side === 'LONG' ? 'SELL' : 'BUY';
                const closeQty = this.position.quantity;
                const fee = slExecPrice * closeQty * this.fees.takerFeeRate;
                const pnl =
                    this.position.side === 'LONG'
                        ? (slExecPrice - this.position.avgEntryPrice) * closeQty
                        : (this.position.avgEntryPrice - slExecPrice) * closeQty;

                this.position.realizedPnl += pnl;
                this.position.totalFees += fee;
                this.position.quantity = 0;
                this.position.side = 'FLAT';
                this.position.unrealizedPnl = 0;

                this.events.push({
                    orderId: `sl-exit-${timestamp}`,
                    timestamp,
                    side: exitSide,
                    type: 'STOP_MARKET',
                    fillPrice: slExecPrice,
                    fillQuantity: closeQty,
                    fee,
                    isMaker: false,
                    reason: 'STOP_LOSS',
                });
                return;
            }
        }

        // 2. Check Take Profit Targets
        for (const tp of this.position.takeProfits) {
            if (tp.hit) continue;

            let tpHit = false;
            if (this.position.side === 'LONG' && tick.high >= tp.price) {
                tpHit = true;
            } else if (this.position.side === 'SHORT' && tick.low <= tp.price) {
                tpHit = true;
            }

            if (tpHit) {
                tp.hit = true;
                tp.hitTimestamp = timestamp;

                const targetRatio = tp.allocationPercent / 100;
                const exitQty = Math.min(this.position.quantity, this.position.quantity * targetRatio);
                if (exitQty > 0) {
                    const exitSide: OrderSide = this.position.side === 'LONG' ? 'SELL' : 'BUY';
                    const fee = tp.price * exitQty * this.fees.makerFeeRate;
                    const pnl =
                        this.position.side === 'LONG'
                            ? (tp.price - this.position.avgEntryPrice) * exitQty
                            : (this.position.avgEntryPrice - tp.price) * exitQty;

                    tp.realizedPnl = pnl;
                    this.position.realizedPnl += pnl;
                    this.position.totalFees += fee;
                    this.position.quantity -= exitQty;

                    this.events.push({
                        orderId: tp.id,
                        timestamp,
                        side: exitSide,
                        type: 'LIMIT',
                        fillPrice: tp.price,
                        fillQuantity: exitQty,
                        fee,
                        isMaker: true,
                        reason: 'TAKE_PROFIT',
                    });

                    if (this.position.quantity <= 0.0000001) {
                        this.position.quantity = 0;
                        this.position.side = 'FLAT';
                        this.position.avgEntryPrice = 0;
                        break;
                    }
                }
            }
        }
    }

    /**
     * Recomputes current unrealized PnL and normalized R-multiple.
     */
    private updatePositionPnL(currentPrice: number): void {
        if (this.position.side === 'FLAT' || this.position.quantity <= 0) {
            this.position.unrealizedPnl = 0;
            if (this.position.initialRiskDollar > 0) {
                this.position.rMultiple = this.position.realizedPnl / this.position.initialRiskDollar;
            } else {
                this.position.rMultiple = 0;
            }
            return;
        }

        const priceDiff =
            this.position.side === 'LONG'
                ? currentPrice - this.position.avgEntryPrice
                : this.position.avgEntryPrice - currentPrice;

        this.position.unrealizedPnl = priceDiff * this.position.quantity;

        if (this.position.initialRiskDollar > 0) {
            this.position.rMultiple = (this.position.unrealizedPnl + this.position.realizedPnl) / this.position.initialRiskDollar;
        } else {
            this.position.rMultiple = 0;
        }
    }
}
