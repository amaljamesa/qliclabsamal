// Formats a number using Indian digit grouping (lakh/crore), e.g. 279350.16 -> "2,79,350.16".
export function indianFormat(value: string | number | undefined | null): string {
  const num = typeof value === 'number' ? value : parseFloat(value ?? '');
  if (isNaN(num)) {
    return '';
  }

  const [integerPart, decimalPart] = Math.abs(num).toFixed(2).split('.');
  const lastThree = integerPart.slice(-3);
  const otherDigits = integerPart.slice(0, -3);
  const groupedOther = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = groupedOther ? `${groupedOther},${lastThree}` : lastThree;
  const sign = num < 0 ? '-' : '';

  return `${sign}${grouped}.${decimalPart}`;
}
