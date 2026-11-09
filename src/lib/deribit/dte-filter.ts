import type { NormalizedDeribitOption } from './types';

export const DERIBIT_DTE_FILTERS = ['0-2D', '7D', '14D', '30D', 'ALL'] as const;
export type DeribitDteFilter = (typeof DERIBIT_DTE_FILTERS)[number];

const MAX_DTE_BY_FILTER: Record<Exclude<DeribitDteFilter, 'ALL'>, number> = {
    '0-2D': 2,
    '7D': 7,
    '14D': 14,
    '30D': 30,
};

export function isDeribitDteFilter(value: string | null): value is DeribitDteFilter {
    return value !== null && DERIBIT_DTE_FILTERS.includes(value as DeribitDteFilter);
}

export function filterDeribitOptionsByDte(
    options: readonly NormalizedDeribitOption[],
    filter: DeribitDteFilter,
): readonly NormalizedDeribitOption[] {
    if (filter === 'ALL') return options;
    const maxDte = MAX_DTE_BY_FILTER[filter];
    return options.filter((option) => option.dte <= maxDte);
}

/**
 * Filters Deribit options by an exact expiry identifier (either Deribit expiry code like '25DEC26'
 * or ISO UTC timestamp string like '2026-12-25T08:00:00.000Z').
 */
export function filterDeribitOptionsByExactExpiry(
    options: readonly NormalizedDeribitOption[],
    exactExpiry: string | null | undefined,
): readonly NormalizedDeribitOption[] {
    const trimmed = exactExpiry?.trim();
    if (!trimmed || trimmed === 'ALL' || isDeribitDteFilter(trimmed)) {
        return options;
    }
    const upper = trimmed.toUpperCase();
    return options.filter((opt) => {
        if (String(opt.expiryStr).toUpperCase() === upper) return true;
        if (opt.expiryDate instanceof Date && opt.expiryDate.toISOString() === trimmed) return true;
        return false;
    });
}

export function filterDeribitOptionsByDteOrExpiry(
    options: readonly NormalizedDeribitOption[],
    dteFilter: DeribitDteFilter,
    exactExpiry?: string | null,
): readonly NormalizedDeribitOption[] {
    if (exactExpiry && exactExpiry.trim().length > 0 && exactExpiry !== 'ALL' && !isDeribitDteFilter(exactExpiry)) {
        return filterDeribitOptionsByExactExpiry(options, exactExpiry);
    }
    return filterDeribitOptionsByDte(options, dteFilter);
}
