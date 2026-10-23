'use client';

import React, { useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/ui/cn';

export type OrderFlowStudy = 'CVD' | 'DELTA' | 'BOOK' | 'LIQUIDITY';

export const ORDER_FLOW_STUDIES: readonly OrderFlowStudy[] = ['CVD', 'DELTA', 'BOOK', 'LIQUIDITY'] as const;

export interface StudyTabTransition {
    nextStudy: OrderFlowStudy;
    nextOpen: boolean;
}

export function resolveStudyTabClick(
    clickedStudy: OrderFlowStudy,
    activeStudy: OrderFlowStudy,
    isOpen: boolean,
): StudyTabTransition {
    if (!isOpen) {
        return { nextStudy: clickedStudy, nextOpen: true };
    }
    if (clickedStudy === activeStudy) {
        return { nextStudy: clickedStudy, nextOpen: false };
    }
    return { nextStudy: clickedStudy, nextOpen: true };
}

export function formatStudyTabLabel(study: OrderFlowStudy): string {
    return study === 'CVD' ? 'CVD' : study.charAt(0) + study.slice(1).toLowerCase();
}

export interface LowerStudyDockProps {
    activeStudy: OrderFlowStudy;
    studyPaneOpen: boolean;
    dataMode: 'LIVE' | 'DEMO' | 'DEGRADED';
    historyBarCount: number;
    historyLoading: boolean;
    onSelectStudy: (study: OrderFlowStudy) => void;
    onToggleOpen: (open: boolean) => void;
}

export default function LowerStudyDock({
    activeStudy,
    studyPaneOpen,
    dataMode,
    historyBarCount,
    historyLoading,
    onSelectStudy,
    onToggleOpen,
}: LowerStudyDockProps) {
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    function handleTabClick(study: OrderFlowStudy) {
        const transition = resolveStudyTabClick(study, activeStudy, studyPaneOpen);
        onSelectStudy(transition.nextStudy);
        onToggleOpen(transition.nextOpen);
    }

    function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
        let targetIndex: number | null = null;
        if (event.key === 'ArrowRight') {
            targetIndex = (index + 1) % ORDER_FLOW_STUDIES.length;
        } else if (event.key === 'ArrowLeft') {
            targetIndex = (index - 1 + ORDER_FLOW_STUDIES.length) % ORDER_FLOW_STUDIES.length;
        } else if (event.key === 'Home') {
            targetIndex = 0;
        } else if (event.key === 'End') {
            targetIndex = ORDER_FLOW_STUDIES.length - 1;
        }
        if (targetIndex === null) return;
        event.preventDefault();
        const targetStudy = ORDER_FLOW_STUDIES[targetIndex];
        tabRefs.current[targetIndex]?.focus();
        onSelectStudy(targetStudy);
        onToggleOpen(true);
    }

    return (
        <div
            className="flex h-9 shrink-0 items-stretch justify-between border-t border-[#263346] bg-[#080d14] px-1 pb-[env(safe-area-inset-bottom)]"
            data-testid="order-flow-dock"
            data-pane-state={studyPaneOpen ? 'expanded' : 'collapsed'}
        >
            <div
                className="flex min-w-0 items-stretch overflow-x-auto"
                role="tablist"
                aria-label="Order-flow studies"
                data-position="workspace-bottom"
                data-testid="order-flow-tabs"
            >
                {ORDER_FLOW_STUDIES.map((study, index) => {
                    const isSelected = studyPaneOpen && activeStudy === study;
                    const isLastActiveWhenCollapsed = !studyPaneOpen && activeStudy === study;
                    return (
                        <button
                            key={study}
                            ref={(element) => {
                                tabRefs.current[index] = element;
                            }}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            aria-controls="order-flow-study-pane"
                            onClick={() => handleTabClick(study)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                            className={cn(
                                'min-w-[68px] shrink-0 border-t-2 border-transparent px-2.5 text-[10px] font-semibold transition-colors hover:text-zinc-200 sm:min-w-20 sm:px-3',
                                isSelected && 'border-sky-400 bg-sky-400/[0.06] text-sky-200',
                                isLastActiveWhenCollapsed && 'border-[#334860] text-zinc-300',
                                !isSelected && !isLastActiveWhenCollapsed && 'text-zinc-500',
                            )}
                        >
                            {formatStudyTabLabel(study)}
                        </button>
                    );
                })}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2 pr-1">
                <span className="hidden font-mono text-[9px] tabular-nums text-zinc-500 sm:inline">
                    {dataMode === 'LIVE'
                        ? `${historyBarCount.toLocaleString()} bars${historyLoading ? ' · loading history' : ''}`
                        : 'demo series'}
                </span>
                <button
                    type="button"
                    aria-label={studyPaneOpen ? 'Collapse lower study pane' : 'Expand lower study pane'}
                    aria-expanded={studyPaneOpen}
                    aria-controls="order-flow-study-pane"
                    data-testid="study-pane-collapse-button"
                    onClick={() => onToggleOpen(!studyPaneOpen)}
                    className={cn(
                        'flex h-6 items-center gap-1 rounded border px-2 text-[9px] font-semibold transition-colors',
                        studyPaneOpen
                            ? 'border-[#2b3b50] bg-[#0c141f] text-zinc-300 hover:border-cyan-400/40 hover:text-zinc-100'
                            : 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15',
                    )}
                >
                    {studyPaneOpen ? (
                        <>
                            <ChevronDown className="size-3" />
                            <span>Collapse</span>
                        </>
                    ) : (
                        <>
                            <ChevronUp className="size-3" />
                            <span>Expand</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
