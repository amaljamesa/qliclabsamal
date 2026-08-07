// A minimal .xlsx (SpreadsheetML) writer - enough to turn a grid of cells into a real
// Excel workbook, and no more.
//
// Written by hand rather than pulled in as a dependency: the only thing an .xlsx actually is
// is a ZIP of a handful of small XML parts, and the two usual libraries are both a poor fit
// here - SheetJS is no longer published to the public npm registry (the `xlsx` package still
// there is a stale fork), and ExcelJS pulls a large Node-oriented dependency tree into a
// browser bundle for what amounts to writing four static XML files. This is ~200 lines with
// no install, and matches how the rest of this app already hand-rolls small primitives
// (base64, amount-in-words, the print layouts themselves).
//
// Deliberately NOT a general spreadsheet library: no formulas, no shared strings (cells carry
// their text inline), no images, and a fixed set of named styles rather than arbitrary
// formatting. Everything the invoice export needs, nothing it doesn't.

export type CellStyle =
  | 'title'          // invoice heading
  | 'subtitle'       // muted line under a title
  | 'label'          // bold field name in a label/value pair
  | 'value'          // the value beside it
  | 'sectionHeader'  // shaded band naming a block (Items, Tax Summary, ...)
  | 'columnHeader'   // header row of a bordered table
  | 'text'           // bordered table cell holding text
  | 'number'         // bordered table cell, 2 decimals, right aligned
  | 'qty'            // bordered table cell, counts/percentages, right aligned
  | 'totalLabel'     // bold shaded cell on a totals row
  | 'totalNumber'    // bold shaded money total on a totals row
  | 'totalQty'       // bold shaded count total, formatted like the 'qty' cells above it
  | 'wrap';          // free text that should wrap rather than run off the sheet

// Style names map to fixed indices into the cellXfs list in STYLES_XML below - the two must
// stay in step.
const STYLE_INDEX: Record<CellStyle, number> = {
  title: 1,
  subtitle: 2,
  label: 3,
  value: 4,
  sectionHeader: 5,
  columnHeader: 6,
  text: 7,
  number: 8,
  qty: 9,
  totalLabel: 10,
  totalNumber: 11,
  wrap: 12,
  totalQty: 13
};

export interface SheetCell {
  value: string | number | null;
  style?: CellStyle;
}

// A bare string/number is shorthand for an unstyled cell; null leaves the cell empty.
export type SheetRow = (SheetCell | string | number | null)[];

export interface WorkbookSheet {
  name: string;
  rows: SheetRow[];
  /** Column widths in Excel's character units, left to right. */
  columnWidths?: number[];
  /** Merged ranges in A1 notation, e.g. 'A1:F1'. */
  merges?: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A1-style column name: 0 -> A, 25 -> Z, 26 -> AA.
export function columnLetter(index: number): string {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function normalizeCell(cell: SheetCell | string | number | null): SheetCell {
  if (cell === null || typeof cell === 'string' || typeof cell === 'number') {
    return { value: cell };
  }
  return cell;
}

// Excel rejects a workbook whose sheet names are empty, over 31 characters, contain any of
// []:*?/\ , or repeat - all three are reachable from real invoice numbers, so they're fixed
// here rather than left to the caller.
function sanitizeSheetNames(sheets: WorkbookSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    let name = (sheet.name || '').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
    if (!name) {
      name = `Sheet${index + 1}`;
    }
    if (used.has(name.toLowerCase())) {
      const suffix = ` (${index + 1})`;
      name = name.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(sheet: WorkbookSheet): string {
  const cols = (sheet.columnWidths ?? [])
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((raw, colIndex) => {
          const cell = normalizeCell(raw);
          const ref = `${columnLetter(colIndex)}${rowIndex + 1}`;
          const styleAttr = cell.style ? ` s="${STYLE_INDEX[cell.style]}"` : '';
          if (cell.value === null || cell.value === '') {
            // Still emitted (rather than skipped) so the cell keeps its borders/shading -
            // an empty cell in a bordered table would otherwise show up as a gap in the grid.
            return styleAttr ? `<c r="${ref}"${styleAttr}/>` : '';
          }
          if (typeof cell.value === 'number') {
            return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
          }
          // Inline strings rather than a shared-string table: one less part to keep
          // consistent, at the cost of some repetition in a file nobody reads by hand.
          // xml:space="preserve" keeps leading/trailing spaces Excel would otherwise trim.
          return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';

  // Element order is fixed by the schema: cols, then sheetData, then mergeCells.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${merges}</worksheet>`;
}

// numFmt 164 is custom (anything below 164 is reserved for Excel's built-ins); the 'qty'
// style deliberately stays on the built-in General (numFmtId 0) instead of a "#,##0.###"
// of its own, because Excel renders the literal decimal point in that pattern even when no
// decimals follow - a quantity of 1 came out as "1.". General drops it, while still showing
// a fractional quantity in full. The cellXfs order here is what STYLE_INDEX above indexes into.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F4"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFB6C2D1"/></left><right style="thin"><color rgb="FFB6C2D1"/></right><top style="thin"><color rgb="FFB6C2D1"/></top><bottom style="thin"><color rgb="FFB6C2D1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
</styleSheet>`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  // Pinned to ArrayBuffer (rather than the default ArrayBufferLike) because Blob only
  // accepts views over a plain, non-shared buffer.
  data: Uint8Array<ArrayBuffer>;
}

// Stored (uncompressed) ZIP entries - method 0. Deflate would need a compressor; these parts
// are a few KB of XML, and Excel reads a stored archive exactly the same way.
// Timestamps are pinned to 1980-01-01 so the same data always produces byte-identical output.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function zip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header signature
    localView.setUint16(4, 20, true);         // version needed to extract (2.0)
    localView.setUint16(6, 0, true);          // general purpose flags
    localView.setUint16(8, 0, true);          // compression method: stored
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true); // compressed size
    localView.setUint32(22, entry.data.length, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);         // extra field length
    local.set(nameBytes, 30);

    const header = new Uint8Array(46 + nameBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true); // central directory header signature
    headerView.setUint16(4, 20, true);         // version made by
    headerView.setUint16(6, 20, true);         // version needed to extract
    headerView.setUint16(8, 0, true);
    headerView.setUint16(10, 0, true);
    headerView.setUint16(12, DOS_TIME, true);
    headerView.setUint16(14, DOS_DATE, true);
    headerView.setUint32(16, crc, true);
    headerView.setUint32(20, entry.data.length, true);
    headerView.setUint32(24, entry.data.length, true);
    headerView.setUint16(28, nameBytes.length, true);
    headerView.setUint16(30, 0, true);         // extra field length
    headerView.setUint16(32, 0, true);         // file comment length
    headerView.setUint16(34, 0, true);         // disk number start
    headerView.setUint16(36, 0, true);         // internal attributes
    headerView.setUint32(38, 0, true);         // external attributes
    headerView.setUint32(42, offset, true);    // offset of local header
    header.set(nameBytes, 46);

    parts.push(local, entry.data);
    central.push(header);
    offset += local.length + entry.data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory signature
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);           // comment length

  return new Blob([...parts, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/** Packs the given sheets into a downloadable .xlsx blob. */
export function buildXlsxBlob(sheets: WorkbookSheet[]): Blob {
  if (sheets.length === 0) {
    throw new Error('A workbook needs at least one sheet.');
  }
  const encoder = new TextEncoder();
  const names = sanitizeSheetNames(sheets);
  const stylesRelId = sheets.length + 1;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(sheet))
    }))
  ];

  return zip(entries);
}

/** Saves a blob under the given filename via a temporary object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick rather than immediately - Safari cancels an in-flight download
  // if the URL disappears in the same task that started it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
