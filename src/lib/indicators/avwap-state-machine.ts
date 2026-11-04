/**
 * AVWAP Interaction State Machine & Persistent Timestamp Anchoring
 *
 * Implements an institutional-grade drawing state machine that strictly pins
 * Anchored VWAP to an immutable UTC candle timestamp rather than a fragile array index.
 * Survives real-time market updates, bars array prepends/appends, timeframe changes,
 * and browser reloads.
 */

export type AvwapInteractionState =
    | 'IDLE'
    | 'SELECTED'
    | 'DRAGGING'
    | 'COMMITTING'
    | 'COMMITTED'
    | 'CANCELLED';

export interface AvwapAnchorConfig {
    anchorTime: number; // UTC timestamp in seconds
    isManual: boolean;  // whether explicitly positioned by the trader
    interactionState: AvwapInteractionState;
    provisionalTime: number | null; // active drag preview timestamp
}

export const AVWAP_STORAGE_KEY = 'btc-terminal-avwap-anchor-v1';

let memoryStorage: Record<string, string> = {};

export function clearMemoryStorageForTesting(): void {
    memoryStorage = {};
}

/**
 * Loads the persisted AVWAP anchor from localStorage (with in-memory fallback).
 */
export function loadPersistedAvwapAnchor(): { anchorTime: number; isManual: boolean } | null {
    try {
        const raw = typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem(AVWAP_STORAGE_KEY)
            : memoryStorage[AVWAP_STORAGE_KEY];
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.anchorTime === 'number' && Number.isFinite(parsed.anchorTime)) {
            return {
                anchorTime: parsed.anchorTime,
                isManual: Boolean(parsed.isManual),
            };
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

/**
 * Persists the committed AVWAP anchor timestamp.
 */
export function savePersistedAvwapAnchor(anchorTime: number): void {
    const payload = JSON.stringify({ anchorTime, isManual: true, updatedAt: Date.now() });
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(AVWAP_STORAGE_KEY, payload);
        } else {
            memoryStorage[AVWAP_STORAGE_KEY] = payload;
        }
    } catch {
        memoryStorage[AVWAP_STORAGE_KEY] = payload;
    }
}

/**
 * Binary search to locate the bar index corresponding to a timestamp in O(log N).
 * If exact match is not found, returns the nearest index.
 */
export function findNearestBarIndexByTime(
    bars: readonly { time: number | string }[],
    targetTime: number
): number {
    const len = bars.length;
    if (len === 0) return 0;
    if (len === 1) return 0;

    let low = 0;
    let high = len - 1;

    const firstTime = Number(bars[0].time);
    const lastTime = Number(bars[high].time);

    if (targetTime <= firstTime) return 0;
    if (targetTime >= lastTime) return high;

    while (low <= high) {
        const mid = (low + high) >> 1;
        const midTime = Number(bars[mid].time);

        if (midTime === targetTime) {
            return mid;
        }
        if (midTime < targetTime) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // low is now insertion point. Compare distance to low and low - 1
    const idx1 = Math.max(0, Math.min(len - 1, low));
    const idx0 = Math.max(0, idx1 - 1);
    const dist0 = Math.abs(Number(bars[idx0].time) - targetTime);
    const dist1 = Math.abs(Number(bars[idx1].time) - targetTime);

    return dist0 <= dist1 ? idx0 : idx1;
}

/**
 * State machine transition handler for AVWAP anchor dragging.
 */
export type AvwapAction =
    | { type: 'SELECT' }
    | { type: 'START_DRAG' }
    | { type: 'DRAG_MOVE'; timestamp: number }
    | { type: 'COMMIT_DRAG'; timestamp?: number }
    | { type: 'CANCEL_DRAG' }
    | { type: 'DESELECT' };

export function avwapReducer(
    state: AvwapAnchorConfig,
    action: AvwapAction
): AvwapAnchorConfig {
    switch (action.type) {
        case 'SELECT':
            return {
                ...state,
                interactionState: state.interactionState === 'DRAGGING' ? 'DRAGGING' : 'SELECTED',
            };
        case 'START_DRAG':
            return {
                ...state,
                interactionState: 'DRAGGING',
                provisionalTime: state.anchorTime,
            };
        case 'DRAG_MOVE':
            if (state.interactionState !== 'DRAGGING') return state;
            return {
                ...state,
                provisionalTime: action.timestamp,
            };
        case 'COMMIT_DRAG': {
            const finalTime = action.timestamp ?? state.provisionalTime ?? state.anchorTime;
            savePersistedAvwapAnchor(finalTime);
            return {
                ...state,
                anchorTime: finalTime,
                isManual: true,
                interactionState: 'COMMITTED',
                provisionalTime: null,
            };
        }
        case 'CANCEL_DRAG':
            return {
                ...state,
                interactionState: 'CANCELLED',
                provisionalTime: null,
            };
        case 'DESELECT':
            return {
                ...state,
                interactionState: 'IDLE',
                provisionalTime: null,
            };
        default:
            return state;
    }
}
