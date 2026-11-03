import { buildProjectControlResponseV1 } from '../../../lib/project-control/snapshot';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
    try {
        const payload = buildProjectControlResponseV1();
        return Response.json(payload, {
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[API /api/project-control] Failed to generate snapshot:', error);
        return Response.json(
            {
                error: 'Failed to generate project-control snapshot',
                details: error instanceof Error ? error.message : String(error),
            },
            {
                status: 500,
                headers: {
                    'Cache-Control': 'no-store',
                },
            },
        );
    }
}
