import Link from 'next/link';
import ProjectControlDashboard from '../../../components/dashboard/ProjectControlDashboard';

export default function Ux21ProjectControlPage() {
    return (
        <div className="min-h-screen bg-[#070A0F] text-[#D8DEE8]">
            <header className="border-b border-[#18212C] bg-[#0C1118] px-4 py-3">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                    <h1 className="font-mono text-xs font-black tracking-wider">
                        UX21 · INDEPENDENT FOOTPRINT WORKSPACE
                    </h1>
                    <nav aria-label="Project Control" className="flex gap-4 font-mono text-xs text-[#69BDF7]">
                        <Link href="/">Terminal</Link>
                        <Link href="/project-control">All initiatives</Link>
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-7xl space-y-3 p-4 sm:p-6">
                <p className="text-sm text-[#B0BAC9]">
                    Implementation, testing, and independent acceptance are tracked separately.
                </p>
                <ProjectControlDashboard initiative="UX21" />
            </main>
        </div>
    );
}
