import base64
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}


def col_letters(cell_ref: str) -> str:
    match = re.match(r'([A-Z]+)', cell_ref or '')
    return match.group(1) if match else ''


def col_index(letters: str) -> int:
    value = 0
    for char in letters:
        value = value * 26 + (ord(char) - 64)
    return value - 1


payload = json.load(sys.stdin)
raw = base64.b64decode(payload['contents_base64'])
zf = zipfile.ZipFile(io.BytesIO(raw))

shared_strings = []
if 'xl/sharedStrings.xml' in zf.namelist():
    root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    for si in root.findall('main:si', NS):
        text = ''.join(node.text or '' for node in si.iterfind('.//main:t', NS))
        shared_strings.append(text)

workbook = ET.fromstring(zf.read('xl/workbook.xml'))
rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
rel_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in rels.findall('rel:Relationship', NS)}
sheets = workbook.findall('main:sheets/main:sheet', NS)
if not sheets:
    raise SystemExit('No worksheet found in workbook')

parsed_sheets = []

for sheet_index, sheet in enumerate(sheets):
    sheet_name = sheet.attrib.get('name', f'Sheet {sheet_index + 1}')
    rel_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    if not rel_id or rel_id not in rel_map:
        continue

    sheet_target = rel_map[rel_id]
    if not sheet_target.startswith('worksheets/'):
        sheet_target = f'worksheets/{sheet_target.split("worksheets/")[-1]}'

    sheet_xml = ET.fromstring(zf.read(f'xl/{sheet_target}'))

    rows = []
    max_index = -1
    for row in sheet_xml.findall('main:sheetData/main:row', NS):
        values = {}
        for cell in row.findall('main:c', NS):
            ref = cell.attrib.get('r', '')
            idx = col_index(col_letters(ref))
            max_index = max(max_index, idx)
            cell_type = cell.attrib.get('t')
            value_node = cell.find('main:v', NS)
            inline_node = cell.find('main:is/main:t', NS)
            value = ''
            if cell_type == 's' and value_node is not None:
                value = shared_strings[int(value_node.text or '0')] if shared_strings else ''
            elif inline_node is not None:
                value = inline_node.text or ''
            elif value_node is not None:
                value = value_node.text or ''
            values[idx] = str(value).strip()
        rows.append(values)

    raw_rows = []
    if rows:
        width = max_index + 1
        for row in rows:
            raw_rows.append([str(row.get(index, '')).strip() for index in range(width)])

    parsed_sheets.append({
        'sheet_name': sheet_name,
        'sheet_index': sheet_index,
        'raw_rows': raw_rows,
    })

print(json.dumps({
    'raw_rows': parsed_sheets[0]['raw_rows'] if parsed_sheets else [],
    'sheets': parsed_sheets,
}))
