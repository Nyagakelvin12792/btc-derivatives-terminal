import { NextRequest, NextResponse } from 'next/server';
import {
    JevShadowRequestV1Schema,
} from '../../../../lib/orderflow/jev-contracts';
import {
    createAbstainResponse,
    evaluateJevShadow,
} from '../../../../lib/orderflow/jev-adapter';

const NO_STORE = 'no-store';

export async function POST(req: NextRequest) {
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return NextResponse.json(
            createAbstainResponse('jev-invalid-json', 'Invalid JSON body'),
            { status: 400, headers: { 'Cache-Control': NO_STORE } }
        );
    }

    const parseResult = JevShadowRequestV1Schema.safeParse(rawBody);
    if (!parseResult.success) {
        return NextResponse.json(
            createAbstainResponse(
                (rawBody as { featurePacketHash?: string })?.featurePacketHash || 'jev-invalid-schema',
                `Schema validation failed: ${parseResult.error.message}`
            ),
            { status: 400, headers: { 'Cache-Control': NO_STORE } }
        );
    }

    try {
        const response = await evaluateJevShadow({
            request: parseResult.data,
        });

        return NextResponse.json(response, {
            status: 200,
            headers: { 'Cache-Control': NO_STORE },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            createAbstainResponse(parseResult.data.featurePacketHash, `Jev evaluation failed: ${message}`),
            { status: 200, headers: { 'Cache-Control': NO_STORE } }
        );
    }
}
