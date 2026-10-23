import { beforeEach, describe, expect, it } from 'vitest';
import { formatCompactUsd } from './LiquidityPanel';
import { formatStudyTabLabel, ORDER_FLOW_STUDIES, resolveStudyTabClick } from './LowerStudyDock';
import {
    clampStudyPaneHeight,
    readPersistedStudyPaneHeight,
    STUDY_PANE_DEFAULT_HEIGHT,
    STUDY_PANE_MAX_HEIGHT,
    STUDY_PANE_MIN_HEIGHT,
    STUDY_PANE_STORAGE_KEY,
    writePersistedStudyPaneHeight,
} from './LowerStudyPane';
import { constrainToolbarPosition } from './MarketStructureChart';
import { DRAWING_TOOLS } from './MarketTerminal';

describe('UX15.0 lower study dock and pane helpers', () => {
    beforeEach(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear();
        }
    });

    it('reopens the lower study pane when any tab is selected while collapsed', () => {
        for (const study of ORDER_FLOW_STUDIES) {
            expect(resolveStudyTabClick(study, 'CVD', false)).toEqual({
                nextStudy: study,
                nextOpen: true,
            });
        }
    });

    it('switches to a different tab without collapsing when expanded', () => {
        expect(resolveStudyTabClick('DELTA', 'CVD', true)).toEqual({
            nextStudy: 'DELTA',
            nextOpen: true,
        });
        expect(resolveStudyTabClick('BOOK', 'DELTA', true)).toEqual({
            nextStudy: 'BOOK',
            nextOpen: true,
        });
        expect(resolveStudyTabClick('LIQUIDITY', 'BOOK', true)).toEqual({
            nextStudy: 'LIQUIDITY',
            nextOpen: true,
        });
    });

    it('collapses the content pane when re-clicking the active tab while expanded', () => {
        expect(resolveStudyTabClick('CVD', 'CVD', true)).toEqual({
            nextStudy: 'CVD',
            nextOpen: false,
        });
        expect(resolveStudyTabClick('LIQUIDITY', 'LIQUIDITY', true)).toEqual({
            nextStudy: 'LIQUIDITY',
            nextOpen: false,
        });
    });

    it('formats tab labels consistently', () => {
        expect(formatStudyTabLabel('CVD')).toBe('CVD');
        expect(formatStudyTabLabel('DELTA')).toBe('Delta');
        expect(formatStudyTabLabel('BOOK')).toBe('Book');
        expect(formatStudyTabLabel('LIQUIDITY')).toBe('Liquidity');
    });

    it('enforces minimum and maximum height bounds so neither pane crushes the other', () => {
        expect(clampStudyPaneHeight(40)).toBe(STUDY_PANE_MIN_HEIGHT);
        expect(clampStudyPaneHeight(999)).toBe(STUDY_PANE_MAX_HEIGHT);
        expect(clampStudyPaneHeight(Number.NaN)).toBe(STUDY_PANE_DEFAULT_HEIGHT);
        // When workspace height is 520px, max height is capped to preserve >= 280px for the price chart
        expect(clampStudyPaneHeight(360, 520)).toBe(240);
    });

    it('persists and restores valid study pane height via storage helpers', () => {
        const storage = new Map<string, string>();
        const mockWindow = {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
            },
        };
        const originalWindow = globalThis.window;
        Object.defineProperty(globalThis, 'window', {
            value: mockWindow,
            configurable: true,
            writable: true,
        });

        try {
            expect(readPersistedStudyPaneHeight()).toBe(STUDY_PANE_DEFAULT_HEIGHT);
            writePersistedStudyPaneHeight(248);
            expect(storage.has(STUDY_PANE_STORAGE_KEY)).toBe(true);
            expect(readPersistedStudyPaneHeight()).toBe(248);

            // Clamps out-of-range persisted heights on write and read
            writePersistedStudyPaneHeight(48);
            expect(readPersistedStudyPaneHeight()).toBe(STUDY_PANE_MIN_HEIGHT);
        } finally {
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                configurable: true,
                writable: true,
            });
        }
    });
});

describe('UX15.0 liquidity formatting and drawing toolbar constraints', () => {
    it('formats compact USD notional values cleanly without clipping artifacts', () => {
        expect(formatCompactUsd(1_450_000)).toBe('1.45M');
        expect(formatCompactUsd(84_200)).toBe('84.2K');
        expect(formatCompactUsd(512)).toBe('512');
        expect(formatCompactUsd(-25_000)).toBe('−25.0K');
        expect(formatCompactUsd(Number.NaN)).toBe('—');
    });

    it('constrains the contextual drawing toolbar inside chart bounds', () => {
        const bounds = { width: 900, height: 500 };
        expect(constrainToolbarPosition({ x: 10, y: 8 }, bounds)).toEqual({
            left: 96,
            top: 44,
        });
        expect(constrainToolbarPosition({ x: 895, y: 498 }, bounds)).toEqual({
            left: 804,
            top: 456,
        });
        expect(constrainToolbarPosition({ x: 420, y: 240 }, bounds)).toEqual({
            left: 420,
            top: 200,
        });
    });

    it('includes cursor, line, rectangle, long/short position, and text tools in the single left rail definition', () => {
        const ids = DRAWING_TOOLS.map((tool) => tool.id);
        expect(ids).toEqual([
            'cursor',
            'trendline',
            'horizontal',
            'vertical',
            'rectangle',
            'long-position',
            'short-position',
            'text',
        ]);
        for (const tool of DRAWING_TOOLS) {
            expect(tool.label.length).toBeGreaterThan(2);
        }
    });
});
