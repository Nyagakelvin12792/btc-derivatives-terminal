import { NextResponse } from 'next/server';
import { runReplayCalibration } from '../../../../lib/orderflow/replay-calibration';
import { runPaperEvaluationBatch } from '../../../../lib/orderflow/paper-evaluation';

export const dynamic = 'force-dynamic';
const NO_STORE = 'no-store';

export async function GET() {
    try {
        const calibration = runReplayCalibration();
        const paperEvaluation = runPaperEvaluationBatch(
            calibration.results.map((r) => ({
                assessment: r.assessment,
                bars: [
                    {
                        timestamp: r.assessment.asOf + 60000,
                        open: r.assessment.zone?.high ?? 65200,
                        high: (r.assessment.zone?.high ?? 65200) + 100,
                        low: (r.assessment.zone?.low ?? 64800) - 50,
                        close: (r.assessment.zone?.high ?? 65200) + 50,
                    },
                ],
            })),
            '15m'
        );

        return NextResponse.json(
            {
                calibration,
                paperEvaluation,
            },
            {
                status: 200,
                headers: { 'Cache-Control': NO_STORE },
            }
        );
    } catch (err: unknown) {
        console.error('[API /api/orderflow/calibration] Failed to generate calibration report:', err);
        return NextResponse.json(
            {
                error: 'Failed to generate calibration report',
                details: err instanceof Error ? err.message : String(err),
            },
            {
                status: 500,
                headers: { 'Cache-Control': NO_STORE },
            }
        );
    }
}
