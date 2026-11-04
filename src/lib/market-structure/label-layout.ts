import type { OverlayDensityMode, VisualPriorityTier } from '../ui/design-tokens';

export interface RightEdgeLevelInput {
    id: string;
    tag: string;
    price: number;
    y: number;
    tier: VisualPriorityTier;
    priority: number;
    color: string;
}

export interface ResolvedRightEdgeLabel {
    id: string;
    combinedTag: string;
    mergedIds: string[];
    price: number;
    formattedPrice: string;
    anchorY: number;
    displayY: number;
    isOffset: boolean;
    tier: VisualPriorityTier;
    priority: number;
    color: string;
}

export interface ResolveLabelsOptions {
    plotHeight: number;
    minGapPx?: number;
    mergeDistancePx?: number;
    mergeThresholdBps?: number;
    densityMode?: OverlayDensityMode;
    maxLabels?: number;
}

export function formatCompactAxisPrice(price: number): string {
    if (!Number.isFinite(price)) return '—';
    if (Math.abs(price) >= 1000) {
        return price.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    }
    return price.toFixed(2);
}

/**
 * Resolves right-edge price-scale labels with:
 * 1. Density mode filtering (MINIMAL / STANDARD / DETAILED)
 * 2. Confluence merging for levels within `mergeDistancePx` or `mergeThresholdBps`
 * 3. Deterministic vertical collision resolution enforcing `minGapPx` separation
 */
export function resolveRightEdgeLabels(
    inputs: readonly RightEdgeLevelInput[],
    options: ResolveLabelsOptions,
): ResolvedRightEdgeLabel[] {
    const plotHeight = Math.max(60, options.plotHeight);
    const minGapPx = options.minGapPx ?? 16;
    const mergeDistancePx = options.mergeDistancePx ?? 9;
    const mergeThresholdBps = options.mergeThresholdBps ?? 10;
    const densityMode = options.densityMode ?? 'STANDARD';
    const maxLabels = options.maxLabels ?? (densityMode === 'MINIMAL' ? 5 : densityMode === 'STANDARD' ? 10 : 16);

    // 1. Filter valid in-viewport inputs & apply density filter
    const filtered = inputs.filter((item) => {
        if (!Number.isFinite(item.price) || !Number.isFinite(item.y)) return false;
        if (item.y < -8 || item.y > plotHeight + 8) return false;
        if (densityMode === 'MINIMAL') {
            return item.tier === 'PRIMARY' || item.priority >= 85;
        }
        if (densityMode === 'STANDARD') {
            return item.tier !== 'TERTIARY';
        }
        return true;
    });

    if (filtered.length === 0) return [];

    // 2. Sort by Y coordinate ascending to group nearby confluence levels
    const sortedByY = [...filtered].sort((a, b) => a.y - b.y || b.priority - a.priority);

    const mergedGroups: RightEdgeLevelInput[][] = [];
    for (const item of sortedByY) {
        const lastGroup = mergedGroups[mergedGroups.length - 1];
        if (!lastGroup) {
            mergedGroups.push([item]);
            continue;
        }
        const anchor = lastGroup[0];
        const pxDist = Math.abs(item.y - anchor.y);
        const bpsDist = anchor.price > 0 ? (Math.abs(item.price - anchor.price) / anchor.price) * 10_000 : Infinity;

        if (pxDist <= mergeDistancePx || bpsDist <= mergeThresholdBps) {
            lastGroup.push(item);
        } else {
            mergedGroups.push([item]);
        }
    }

    // 3. Build canonical merged label objects
    let candidates: ResolvedRightEdgeLabel[] = mergedGroups.map((group) => {
        const byPriority = [...group].sort((a, b) => b.priority - a.priority);
        const dominant = byPriority[0];
        const uniqueTags = Array.from(new Set(byPriority.map((g) => g.tag)));
        const combinedTag =
            uniqueTags.length <= 2
                ? uniqueTags.join(' · ')
                : `${uniqueTags[0]} · ${uniqueTags[1]} +${uniqueTags.length - 2}`;

        const clampedAnchorY = Math.max(10, Math.min(plotHeight - 10, dominant.y));
        return {
            id: dominant.id,
            combinedTag,
            mergedIds: byPriority.map((g) => g.id),
            price: dominant.price,
            formattedPrice: formatCompactAxisPrice(dominant.price),
            anchorY: clampedAnchorY,
            displayY: clampedAnchorY,
            isOffset: false,
            tier: dominant.tier,
            priority: dominant.priority,
            color: dominant.color,
        };
    });

    // 4. Cap to maxLabels by priority before solving positions
    if (candidates.length > maxLabels) {
        candidates = [...candidates]
            .sort((a, b) => b.priority - a.priority)
            .slice(0, maxLabels);
    }

    // Sort top-to-bottom by anchorY
    candidates.sort((a, b) => a.anchorY - b.anchorY);

    // 5. Forward pass: push overlapping labels downward
    for (let i = 1; i < candidates.length; i += 1) {
        const prev = candidates[i - 1];
        const curr = candidates[i];
        if (curr.displayY - prev.displayY < minGapPx) {
            curr.displayY = prev.displayY + minGapPx;
        }
    }

    // 6. Backward pass: clamp to bottom boundary and push upward if needed
    const bottomLimit = plotHeight - 10;
    if (candidates.length > 0 && candidates[candidates.length - 1].displayY > bottomLimit) {
        candidates[candidates.length - 1].displayY = bottomLimit;
        for (let i = candidates.length - 2; i >= 0; i -= 1) {
            const next = candidates[i + 1];
            const curr = candidates[i];
            if (next.displayY - curr.displayY < minGapPx) {
                curr.displayY = Math.max(10, next.displayY - minGapPx);
            }
        }
    }

    for (const item of candidates) {
        item.displayY = Math.round(item.displayY * 10) / 10;
        item.isOffset = Math.abs(item.displayY - item.anchorY) >= 2.5;
    }

    return candidates;
}

/**
 * Computes clean, human-readable axis ticks (e.g. $50, $100, $200, $500) so Footprint and custom axes
 * never stack 100+ illegible labels on top of each other.
 */
export function computeNicePriceTicks(
    minPrice: number,
    maxPrice: number,
    maxTicks = 12,
): number[] {
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
        return [];
    }
    const span = maxPrice - minPrice;
    const rawStep = span / Math.max(2, maxTicks);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;

    let niceMultiplier = 1;
    if (residual > 5) niceMultiplier = 10;
    else if (residual > 2.5) niceMultiplier = 5;
    else if (residual > 2) niceMultiplier = 2.5;
    else if (residual > 1) niceMultiplier = 2;

    const step = Math.max(1, niceMultiplier * magnitude);
    const firstTick = Math.ceil(minPrice / step) * step;
    const ticks: number[] = [];

    for (let p = firstTick; p <= maxPrice + step * 0.001; p += step) {
        ticks.push(Number(p.toFixed(2)));
        if (ticks.length > maxTicks + 4) break;
    }
    return ticks;
}
