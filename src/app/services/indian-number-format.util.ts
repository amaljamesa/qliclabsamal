// Formats a number using Indian digit grouping (lakh/crore), e.g. 279350.16 -> "2,79,350.16".
// Tolerant of already-formatted or suffixed input (e.g. "2,195.00 Cr") since callers may pass
// a value that already carries a Dr/Cr label - the numeric part is re-parsed (commas stripped)
// and the trailing label is preserved as-is.
export function indianFormat(value: string | number | undefined | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return formatNumber(value);
  }

  const match = value.trim().match(/^(-?[\d,]*\.?\d+)(.*)$/);
  if (!match) {
    return '';
  }

  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) {
    return '';
  }

  return `${formatNumber(num)}${match[2]}`;
}

function formatNumber(num: number): string {
  const [integerPart, decimalPart] = Math.abs(num).toFixed(2).split('.');
  const lastThree = integerPart.slice(-3);
  const otherDigits = integerPart.slice(0, -3);
  const groupedOther = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = groupedOther ? `${groupedOther},${lastThree}` : lastThree;
  const sign = num < 0 ? '-' : '';

  return `${sign}${grouped}.${decimalPart}`;
}
