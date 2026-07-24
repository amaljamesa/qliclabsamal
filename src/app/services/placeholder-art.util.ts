// Deterministic inline SVG "creative" generator so demo ad banners / promo art
// render without any network dependency (no external image host required).
export function placeholderArtDataUri(
  title: string,
  subtitle: string,
  colors: [string, string],
  textColor = '#ffffff'
): string {
  const subtitleColor = textColor === '#ffffff' ? 'rgba(255,255,255,0.88)' : 'rgba(17,24,39,0.75)';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors[0]}"/>
        <stop offset="1" stop-color="${colors[1]}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="420" fill="url(#g)"/>
    <text x="50%" y="47%" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="800" fill="${textColor}">${title}</text>
    <text x="50%" y="61%" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" fill="${subtitleColor}">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
