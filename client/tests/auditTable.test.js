import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVAILABLE_COLUMNS, COLUMNS, columnsFor, defaultVisibleFor, displayValue, exportFileName, exportTable, humanise } from '../src/lib/auditTable.js'
import { csvTimestamp, excelSerial, toCsv, toSheetXml, toXlsx } from '../src/lib/exportTable.js'

const row = {
  id: 'e1',
  occurredAt: '2026-09-19T12:30:45.000Z',
  source: 'compliance',
  category: 'consent_signed',
  summary: 'Client consent signed',
  result: 'signed',
  actorName: 'Verified Adviser',
  actorType: 'staff',
  clientName: 'Thandi Mokoena',
  providerName: null,
  taskReference: null,
}

test('every default and selectable column for a role actually exists', () => {
  for (const role of ['admin', 'advisor', 'provider']) {
    for (const key of AVAILABLE_COLUMNS[role]) {
      assert.ok(COLUMNS.some(column => column.key === key), `${role} may select unknown column ${key}`)
    }
    for (const key of defaultVisibleFor(role)) {
      assert.ok(AVAILABLE_COLUMNS[role].includes(key), `${role} defaults to unselectable column ${key}`)
    }
  }
})

test('a provider is never offered a column that only holds other people\'s data', () => {
  for (const key of ['clientName', 'providerName']) {
    assert.ok(!AVAILABLE_COLUMNS.provider.includes(key), `providers must not be able to show ${key}`)
  }
  // Asking for one anyway still does not render it.
  assert.deepEqual(columnsFor('provider', ['occurredAt', 'clientName']).map(column => column.key), ['occurredAt'])
})

test('columnsFor keeps the declared column order, not the order they were switched on', () => {
  const keys = columnsFor('admin', ['summary', 'occurredAt', 'source']).map(column => column.key)
  assert.deepEqual(keys, ['occurredAt', 'source', 'summary'])
})

test('empty cells read as a dash on screen but stay empty in a download', () => {
  const reference = COLUMNS.find(column => column.key === 'taskReference')
  assert.equal(displayValue(reference, row), '—')
  const [cell] = exportTable([reference], [row]).rows[0]
  assert.equal(cell.value, null)
})

test('humanise turns database values into readable labels', () => {
  assert.equal(humanise('consent_signed'), 'Consent signed')
  assert.equal(humanise(null), '')
})

test('a download keeps dates typed as dates rather than text', () => {
  const when = COLUMNS.find(column => column.key === 'occurredAt')
  const [cell] = exportTable([when], [row]).rows[0]
  assert.equal(cell.type, 'datetime')
  assert.ok(cell.value instanceof Date)
})

test('csv quotes every field, escapes quotes and ends lines with CRLF', () => {
  const table = { columns: [{ label: 'Detail' }], rows: [[{ type: 'text', value: 'He said "no", loudly' }]] }
  const csv = toCsv(table)
  assert.ok(csv.startsWith('﻿'), 'Excel needs the byte order mark to read UTF-8')
  assert.ok(csv.includes('"He said ""no"", loudly"'))
  assert.ok(csv.endsWith('\r\n'))
})

test('csv neutralises spreadsheet formulas hidden in free text', () => {
  // Audit rows carry notes typed by clients, so a leading = must not become a formula.
  for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)']) {
    const csv = toCsv({ columns: [{ label: 'Detail' }], rows: [[{ type: 'text', value: dangerous }]] })
    assert.ok(csv.includes(`"'${dangerous}"`), `${dangerous} was not neutralised`)
  }
})

test('csv timestamps are local wall-clock, matching what was on screen', () => {
  const date = new Date(2026, 8, 19, 14, 5, 9)
  assert.equal(csvTimestamp(date), '2026-09-19 14:05:09')
})

test('the excel serial for a known date is right', () => {
  // Anchored on 2024-01-01 = 45292, a serial Excel itself reports.
  assert.equal(Math.round(excelSerial(new Date(2024, 0, 1))), 45292)
  assert.equal(Math.round(excelSerial(new Date(2026, 8, 19))), 46284)
  // Midday must land half a day past midnight, so the time survives the round trip.
  assert.equal(excelSerial(new Date(2026, 8, 19, 12, 0, 0)) - excelSerial(new Date(2026, 8, 19)), 0.5)
})

test('the workbook is a valid zip holding the parts Excel requires', () => {
  const bytes = toXlsx(exportTable(columnsFor('admin', defaultVisibleFor('admin')), [row]))
  assert.ok(bytes instanceof Uint8Array)
  // Local file header, then an end-of-central-directory record at the tail.
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  const tail = new DataView(bytes.buffer, bytes.byteLength - 22)
  assert.equal(tail.getUint32(0, true), 0x06054b50)
  assert.equal(tail.getUint16(10, true), 6, 'six parts make a minimal workbook')

  const text = new TextDecoder().decode(bytes)
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
    assert.ok(text.includes(part), `missing ${part}`)
  }
  // The timestamp must be a numeric cell on the date style, not an inline string.
  assert.ok(/<c r="A2" s="2"><v>[\d.]+<\/v><\/c>/.test(text))
  assert.ok(text.includes('autoFilter'))
})

test('xml special characters in a note cannot break the sheet', () => {
  const columns = [COLUMNS.find(column => column.key === 'summary')]
  const nasty = { ...row, summary: 'Rate < 5% & "urgent" \u0007' }
  // Read the sheet part directly: the surrounding zip carries binary CRC bytes that
  // would make a search over the whole archive meaningless.
  const sheet = toSheetXml(exportTable(columns, [nasty]))
  assert.ok(sheet.includes('Rate &lt; 5% &amp; &quot;urgent&quot;'))
  assert.ok(!sheet.includes('\u0007'), 'control characters are not legal in XML')
})

test('the download file name sorts chronologically', () => {
  assert.equal(exportFileName('csv', new Date(2026, 8, 19, 14, 30, 5)), 'audit-log-2026-09-19-143005.csv')
})
