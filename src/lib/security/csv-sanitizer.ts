/**
 * Safe Spreadsheet / CSV Cell Sanitizer (UX20.2-SEC-02)
 *
 * Prevents CSV / Spreadsheet Formula Injection (OWASP CSV Injection)
 * by neutralizing leading formula or control characters (=, +, -, @, \t, \r, \n)
 * on text fields and escaping double quotes per RFC 4180.
 */

const FORMULA_TRIGGER_RE = /^[\s]*[=+\-@\t\r\n]/;

/**
 * Sanitizes an arbitrary string or value for safe inclusion in a CSV cell.
 * Numeric values (finite numbers or pure numeric strings like "-12.50") are preserved
 * without quoting unless forceTextQuote is true. Any non-numeric text starting with
 * =, +, -, @, tab, CR, or LF is prefixed with a single quote (') inside double quotes.
 */
export function sanitizeCsvCell(value: unknown, options?: { forceQuote?: boolean }): string {
    if (value === null || value === undefined) {
        return options?.forceQuote ? '""' : '';
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return options?.forceQuote ? '""' : '';
        return String(value);
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    const raw = String(value);
    const isPureSignedNumber = /^-?\d+(?:\.\d+)?%?R?$/.test(raw);

    let safeText = raw.replace(/\r?\n/g, ' ');
    if (/^[\t\r\n]/.test(raw) || !isPureSignedNumber && FORMULA_TRIGGER_RE.test(safeText)) {
        safeText = `'${safeText}`;
    }

    const escaped = safeText.replace(/"/g, '""');
    if (
        options?.forceQuote ||
        !isPureSignedNumber ||
        escaped.includes(',') ||
        escaped.includes('"') ||
        escaped.includes(' ')
    ) {
        return `"${escaped}"`;
    }

    return escaped;
}
