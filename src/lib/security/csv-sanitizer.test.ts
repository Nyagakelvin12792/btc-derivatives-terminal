import { describe, expect, it } from 'vitest';
import { sanitizeCsvCell } from './csv-sanitizer';

describe('UX20.2-SEC-02 CSV Spreadsheet Formula Sanitizer', () => {
    it('neutralizes leading =, +, -, @, tab, and CR formula prefixes', () => {
        expect(sanitizeCsvCell('=cmd|\'/C calc\'!A0')).toBe('"\'=cmd|\'/C calc\'!A0"');
        expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe('"\'+SUM(A1:A10)"');
        expect(sanitizeCsvCell('-2+3+cmd|\'/C calc\'!A0')).toBe('"\'-2+3+cmd|\'/C calc\'!A0"');
        expect(sanitizeCsvCell('@SUM(1+1)')).toBe('"\'@SUM(1+1)"');
        expect(sanitizeCsvCell('\t=1+1')).toBe('"\'\t=1+1"');
        expect(sanitizeCsvCell('   =HYPERLINK("http://evil.example")')).toBe(
            '"\'   =HYPERLINK(""http://evil.example"")"',
        );
    });

    it('escapes embedded double quotes and newlines safely', () => {
        expect(sanitizeCsvCell('Retest of "VAH" level\nConfirmed')).toBe(
            '"Retest of ""VAH"" level Confirmed"',
        );
    });

    it('preserves legitimate negative numbers and R-multiples without corrupting numeric cells', () => {
        expect(sanitizeCsvCell(-145.25)).toBe('-145.25');
        expect(sanitizeCsvCell('-1.50R')).toBe('-1.50R');
        expect(sanitizeCsvCell('-2.35%')).toBe('-2.35%');
    });
});
