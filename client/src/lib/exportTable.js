// Downloads for the audit log: a CSV that Excel opens cleanly, and a real .xlsx
// workbook. No spreadsheet library is installed, so the workbook is written by
// hand — it is a small, well-specified format and a dependency is not worth it.
//
// Both take the shape produced by lib/auditTable.js exportTable():
//   { columns: [{ label, type, width }], rows: [[{ type, value }, …]] }
// Keeping values typed (a Date stays a Date) is what lets the workbook carry real
// date cells rather than text that only looks like a date.

const CRLF = '\r\n'

// Excel reads a bare UTF-8 CSV as the system codepage and mangles accents; the
// byte order mark tells it otherwise.
const BOM = '﻿'

function pad(number, length = 2) {
  return String(number).padStart(length, '0')
}

// Local wall-clock time, so a downloaded timestamp matches what was on screen.
export function csvTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// A cell starting with = + - or @ is run as a formula by Excel and Sheets. Audit
// rows carry free text written by clients and advisers, so neutralise those before
// they reach a spreadsheet.
function neutralise(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function csvCell(cell) {
  if (cell.value === null || cell.value === undefined) return ''
  const text = cell.type === 'datetime' ? csvTimestamp(cell.value) : neutralise(String(cell.value))
  return `"${text.replaceAll('"', '""')}"`
}

export function toCsv({ columns, rows }) {
  const lines = [columns.map(column => `"${column.label.replaceAll('"', '""')}"`).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return BOM + lines.join(CRLF) + CRLF
}

// ---------------------------------------------------------------------------
// xlsx
// ---------------------------------------------------------------------------

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

// Tab, newline and carriage return are the only control characters XML 1.0 allows;
// anything else below 0x20 would make the workbook unreadable, so it is dropped.
function isLegalXmlCharacter(code) {
  return code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20
}

function xml(text) {
  let out = ''
  for (const character of String(text)) {
    if (!isLegalXmlCharacter(character.codePointAt(0))) continue
    out += XML_ESCAPES[character] ?? character
  }
  return out
}

// Excel counts days from 1899-12-30. Shifting by the timezone offset first keeps the
// serial on local wall-clock time, matching the CSV and the screen.
export function excelSerial(date) {
  return (date.getTime() - date.getTimezoneOffset() * 60000) / 86400000 + 25569
}

function columnName(index) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

// Exported so the escaping and cell typing can be tested without unzipping.
export function toSheetXml({ columns, rows }) {
  const lastColumn = columnName(columns.length - 1)
  const widths = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 18}" customWidth="1"/>`)
    .join('')

  const header = `<row r="1">${columns
    .map((column, index) => `<c r="${columnName(index)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xml(column.label)}</t></is></c>`)
    .join('')}</row>`

  const body = rows
    .map((row, rowIndex) => {
      const reference = rowIndex + 2
      const cells = row
        .map((cell, index) => {
          const at = `${columnName(index)}${reference}`
          if (cell.value === null || cell.value === undefined) return ''
          if (cell.type === 'datetime') return `<c r="${at}" s="2"><v>${excelSerial(cell.value)}</v></c>`
          return `<c r="${at}" s="0" t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`
        })
        .join('')
      return `<row r="${reference}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${lastColumn}${rows.length + 1}"/>
</worksheet>`
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy&quot;-&quot;mm&quot;-&quot;dd\\ hh:mm:ss"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Audit log" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

// ---------------------------------------------------------------------------
// A minimal ZIP container. Entries are stored uncompressed (method 0), which is a
// valid .xlsx and keeps this synchronous and dependency-free.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[i] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files) {
  const encoder = new TextEncoder()
  const entries = files.map(file => ({ name: encoder.encode(file.name), body: encoder.encode(file.body) }))

  const localSize = entries.reduce((total, entry) => total + 30 + entry.name.length + entry.body.length, 0)
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.name.length, 0)
  const buffer = new ArrayBuffer(localSize + centralSize + 22)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  let offset = 0
  const records = []
  for (const entry of entries) {
    const crc = crc32(entry.body)
    records.push({ ...entry, crc, offset })
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true) // version needed
    view.setUint16(offset + 6, 0x0800, true) // UTF-8 names
    view.setUint16(offset + 8, 0, true) // stored, not deflated
    view.setUint32(offset + 10, 0, true) // no meaningful timestamp
    view.setUint32(offset + 14, crc, true)
    view.setUint32(offset + 18, entry.body.length, true)
    view.setUint32(offset + 22, entry.body.length, true)
    view.setUint16(offset + 26, entry.name.length, true)
    view.setUint16(offset + 28, 0, true)
    bytes.set(entry.name, offset + 30)
    bytes.set(entry.body, offset + 30 + entry.name.length)
    offset += 30 + entry.name.length + entry.body.length
  }

  const centralStart = offset
  for (const record of records) {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint32(offset + 12, 0, true)
    view.setUint32(offset + 16, record.crc, true)
    view.setUint32(offset + 20, record.body.length, true)
    view.setUint32(offset + 24, record.body.length, true)
    view.setUint16(offset + 28, record.name.length, true)
    view.setUint16(offset + 30, 0, true)
    view.setUint16(offset + 32, 0, true)
    view.setUint16(offset + 34, 0, true)
    view.setUint16(offset + 36, 0, true)
    view.setUint32(offset + 38, 0, true)
    view.setUint32(offset + 42, record.offset, true)
    bytes.set(record.name, offset + 46)
    offset += 46 + record.name.length
  }

  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, records.length, true)
  view.setUint16(offset + 10, records.length, true)
  view.setUint32(offset + 12, offset - centralStart, true)
  view.setUint32(offset + 16, centralStart, true)
  view.setUint16(offset + 20, 0, true)

  return bytes
}

export function toXlsx(table) {
  return zip([
    { name: '[Content_Types].xml', body: CONTENT_TYPES },
    { name: '_rels/.rels', body: ROOT_RELS },
    { name: 'xl/workbook.xml', body: WORKBOOK_XML },
    { name: 'xl/_rels/workbook.xml.rels', body: WORKBOOK_RELS },
    { name: 'xl/styles.xml', body: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', body: toSheetXml(table) },
  ])
}

const MIME = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function downloadTable(table, format, fileName) {
  const body = format === 'xlsx' ? toXlsx(table) : toCsv(table)
  const url = URL.createObjectURL(new Blob([body], { type: MIME[format] }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
