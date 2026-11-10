'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, CircleHelp, X } from 'lucide-react';

const tips = [
    { id: 'options', title: 'Strike × Expiry Matrix', path: 'Context → Decision', description: 'Compare GEX, open interest, and implied volatility. Use the expiry menu in the header to narrow the chain. Live cells require fresh Deribit data.' },
    { id: 'us', title: 'US Market Context', path: 'Context → Decision', description: 'Check the New York session clock. Expand the panel for manual CME and ETF context.' },
    { id: 'flow', title: 'Footprint & Order Flow', path: 'Flow → Decision', description: 'Use the left chart to choose a timeframe and zoom. Click a candle for the inspector or open Settings for statistics and captured CVD. Blank rows mean trade coverage is unavailable.' },
    { id: 'strategy', title: 'Strategy Lab', path: 'Setup → Decision', description: 'Inspect a local point-in-time dataset or run the synthetic OHLC diagnostic. Jev auto-paper is disabled.' },
    { id: 'paper', title: 'Manual Paper Desk', path: 'Decision Dock → Risk', description: 'Draw a Long Position, then use Simulate Trade when verified quotes are available. Partial fills and remaining protective exits are recorded in the paper journal.' },
    { id: 'portfolio', title: 'Portfolio Analytics', path: 'Risk → Analytics', description: 'Review simulated account equity, drawdown, and trade attribution from the reconciled paper journal.' },
    { id: 'tools', title: 'Tools & Presets', path: 'Chart toolbar', description: 'Find volume profile, anchored VWAP, sessions, drawings, and layout presets in one drawer.' },
    { id: 'preview', title: 'Historical Preview', path: 'Chart toolbar', description: 'Inspect historical candles or load a saved BTCUSDT Spot tape to step through recorded executions.' },
    { id: 'data', title: 'Data & Provenance', path: 'Decision Dock → Data', description: 'Check feed mode and availability when an options or order-flow view is empty.' },
] as const;

export type TerminalTip = (typeof tips)[number]['id'];

export default function TerminalTips({ open, onOpenChange, onNavigate }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (tip: TerminalTip) => void;
}) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Trigger asChild>
                <button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-[#39A9F5]/40 bg-[#39A9F5]/10 px-2.5 text-xs font-semibold text-[#D8DEE8] hover:bg-[#39A9F5]/20 focus-visible:outline focus-visible:outline-[#39A9F5]">
                    <CircleHelp aria-hidden className="size-4 text-[#39A9F5]" /> Tips
                </button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/65" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex max-h-[88dvh] w-[min(94vw,650px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-[#263747] bg-[#0C1118] text-[#D8DEE8] shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b border-[#18212C] p-4">
                        <div>
                            <Dialog.Title className="text-base font-bold">Terminal Tips</Dialog.Title>
                            <Dialog.Description className="mt-1 text-xs text-[#9BA9BA]">Find a feature and jump to its workspace.</Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button type="button" aria-label="Close Tips" className="rounded p-1.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-[#39A9F5]"><X className="size-4" /></button>
                        </Dialog.Close>
                    </div>
                    <div className="grid min-h-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
                        {tips.map((tip) => (
                            <button type="button" key={tip.id} onClick={() => onNavigate(tip.id)}
                                className="group rounded-md border border-[#23303E] bg-[#070A0F] p-3 text-left hover:border-[#39A9F5]/60 focus-visible:outline focus-visible:outline-[#39A9F5]">
                                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                                    {tip.title}<ArrowRight aria-hidden className="size-3.5 shrink-0 text-[#39A9F5]" />
                                </span>
                                <span className="mt-0.5 block text-[10px] font-semibold text-[#69BDF2]">{tip.path}</span>
                                <span className="mt-1 block text-xs leading-relaxed text-[#9BA9BA]">{tip.description}</span>
                            </button>
                        ))}
                    </div>
                    <a href="/project-control/ux20" className="border-t border-[#18212C] p-3 text-xs font-semibold text-[#69BDF2] hover:underline">
                        View UX20 progress and open items
                    </a>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
