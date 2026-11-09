import { NextRequest, NextResponse } from 'next/server';
import {
    JevShadowRequestV1Schema,
} from '../../../../lib/orderflow/jev-contracts';
import {
    createAbstainResponse,
    evaluateJevShadow,
} from '../../../../lib/orderflow/jev-adapter';

const NO_STORE = 'no-store';
const MAX_JEV_PAYLOAD_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
    let rawText: string;
    try {
        rawText = await req.text();
    } catch {
        return NextResponse.json(
            createAbstainResponse('jev-invalid-body', 'Unable to read request body'),
            { status: 400, headers: { 'Cache-Control': NO_STORE } }
        );
    }

    if (rawText.length > MAX_JEV_PAYLOAD_BYTES) {
        return NextResponse.json(
            createAbstainResponse('jev-oversized-payload', 'Request payload exceeds 64 KB limit'),
            { status: 413, headers: { 'Cache-Control': NO_STORE } }
        );
    }

    let rawBody: unknown;
    try {
        rawBody = JSON.parse(rawText);
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
                'Schema validation failed'
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
    } catch {
        return NextResponse.json(
            createAbstainResponse(parseResult.data.featurePacketHash, 'Jev local evaluation failed closed'),
            { status: 200, headers: { 'Cache-Control': NO_STORE } }
        );
    }
}
