import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.join(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_CLIENT_IMPORTS = [
    '@/lib/deribit/client',
    '@/lib/deribit/client.server',
    '@/lib/quant/engine',
];

function sourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
            files.push(...sourceFiles(fullPath));
            continue;
        }

        if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
            files.push(fullPath);
        }
    }

    return files;
}

function isClientModule(source: string): boolean {
    const firstStatement = source.trimStart().split(/\r?\n/, 1)[0]?.trim();
    return firstStatement === "'use client';" || firstStatement === '"use client";';
}

function importsModule(source: string, moduleName: string): boolean {
    return (
        source.includes(`from '${moduleName}'`) ||
        source.includes(`from "${moduleName}"`) ||
        source.includes(`import '${moduleName}'`) ||
        source.includes(`import "${moduleName}"`)
    );
}

describe('server/client module boundaries', () => {
    it('keeps Deribit upstream and quant engine modules out of client components', () => {
        const violations = sourceFiles(SRC_DIR).flatMap((file) => {
            const source = readFileSync(file, 'utf8');
            if (!isClientModule(source)) return [];

            return FORBIDDEN_CLIENT_IMPORTS.filter((moduleName) => importsModule(source, moduleName)).map(
                (moduleName) => `${path.relative(process.cwd(), file)} imports ${moduleName}`
            );
        });

        expect(violations).toEqual([]);
    });
});
