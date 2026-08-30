/**
 * Volume header extraction utility for series and chapters.
 */

/**
 * Extracts a normalized "Volume N" label from a chapter or tag title.
 * Handles bracketed formats [Vol. 1], leading Vol. 1, and embedded Volume 2.
 */
export function extractVolumeHeader(title: string): string | undefined {
  if (!title) return undefined;

  // 1. Bracketed: [Vol. 1], (Volume 2), 【Vol. 3】
  const bracketed = title.match(/[\[\(【]\s*(?:vol(?:ume)?\.?|v)\s*(\d+)\s*[\]\)】]/i);
  if (bracketed) return `Volume ${parseInt(bracketed[1], 10)}`;

  // 2. Leading: Vol. 1, Volume 2, v01
  const leading = title.match(/^(?:vol(?:ume)?\.?|v)\s*(\d+)\b/i);
  if (leading) return `Volume ${parseInt(leading[1], 10)}`;

  // 3. Middle / trailing: ... Volume 1, ... Vol. 2
  const middle = title.match(/\b(?:vol(?:ume)?\.?|v)\s*(\d+)\b/i);
  if (middle) return `Volume ${parseInt(middle[1], 10)}`;

  return undefined;
}

/**
 * Checks whether a tagging header string from metadata is a genuine volume or story section header
 * (e.g. "Volume 1", "Vol. 2", "Book 1", "Side Story", "Specials", "Pre-serialisation")
 * rather than a scanlator group name (e.g. "Sappho Scans", "/u/ Scanlations") or version edition.
 */
export function isVolumeOrSectionHeader(header: string): boolean {
  if (!header) return false;
  const h = header.trim();
  // 1. Volume / Vol / Book / Part / Season / Act / Arc
  if (/^(?:volume|vol\.?|book|part|season|act|arc)\b/i.test(h)) return true;
  // 2. Story sections: Side Story, Specials, Extra, Oneshots, Pre-serialisation, April Fools', Blu-ray Booklet
  if (/^(?:side\s*story|specials?|extras?|oneshots?|pre-?serialis?ation|april\s*fools?|blu-?ray|prologue|epilogue)\b/i.test(h)) return true;
  return false;
}
