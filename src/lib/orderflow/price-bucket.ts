function decimalParts(value: number): { coefficient: bigint; scale: number } {
    const [mantissa, exponent = '0'] = value.toString().split('e');
    const [whole, fractional = ''] = mantissa.split('.');
    return {
        coefficient: BigInt(whole + fractional),
        scale: fractional.length - Number(exponent),
    };
}

/** Floor into half-open price bins without rounding a trade through a decimal boundary. */
export function footprintPriceBucketIndex(price: number, step: number): number {
    const ratio = price / step;
    const rounded = Math.round(ratio);
    if (Math.abs(ratio - rounded) > Number.EPSILON * Math.max(1, ratio) * 2) {
        return Math.floor(ratio);
    }
    // Binary float rounding is ambiguous here. Compare the original decimal numbers.
    const numerator = decimalParts(price);
    const denominator = decimalParts(step);
    const scale = Math.max(numerator.scale, denominator.scale);
    const priceUnits = numerator.coefficient * BigInt(10) ** BigInt(scale - numerator.scale);
    const stepUnits = denominator.coefficient * BigInt(10) ** BigInt(scale - denominator.scale);
    return Number(priceUnits / stepUnits);
}
