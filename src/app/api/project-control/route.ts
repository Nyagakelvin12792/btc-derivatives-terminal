import { buildProjectControlResponseV1 } from '../../../lib/project-control/snapshot';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
    return Response.json(buildProjectControlResponseV1(), {
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
