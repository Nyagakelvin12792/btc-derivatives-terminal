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
