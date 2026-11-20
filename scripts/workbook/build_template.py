# /// script
# requires-python = ">=3.10"
# dependencies = ["openpyxl==3.1.5"]
# ///
"""Build the Excel report template that lib/workbook.js fills with a download.

Writes lib/workbook/template.xlsx and lib/workbook/template.json (where the filler writes). The columns,
their types and meanings come from peskas-api's public metadata, so a new column needs only a rebuild.
Formulas use functions that exist in Excel 2010, LibreOffice and Google Sheets: no dynamic arrays, no
XLOOKUP, no TEXT() format codes (Excel localises them), no macros.

    uv run scripts/workbook/build_template.py
"""
import json
import zipfile
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment
from openpyxl.workbook.properties import CalcProperties

from common import COL, COLUMNS, DATA, HELPERS, LAST
from figures import by_gear, by_month, by_species, data, report
from sheets import check, columns, indicators, start

OUT = Path(__file__).resolve().parents[2] / "lib" / "workbook"
SHEETS = ["Start", "1_Data", "2_Check", "3_Indicators", "4_By_month", "5_By_gear", "6_By_species", "7_Report",
          "8_Columns"]


def main():
    wb = Workbook()
    wb.active.title = SHEETS[0]
    for name in SHEETS[1:]:
        wb.create_sheet(name)
    slots = {k: ("Start", ref) for k, ref in start(wb["Start"]).items()}
    data(wb["1_Data"], wb)
    slots.update({k: ("2_Check", ref) for k, ref in check(wb["2_Check"]).items()})
    indicators(wb["3_Indicators"])
    by_month(wb["4_By_month"])
    gear_cells = by_gear(wb["5_By_gear"])
    species_cells = by_species(wb["6_By_species"])
    report(wb["7_Report"], wb["4_By_month"], wb["5_By_gear"])
    columns(wb["8_Columns"])
    for name in ("3_Indicators", "4_By_month", "5_By_gear", "6_By_species", "8_Columns"):
        setup = wb[name].page_setup
        setup.orientation, setup.fitToWidth, setup.fitToHeight = "landscape", 1, 0
        wb[name].sheet_properties.pageSetUpPr.fitToPage = True
    for name, ref in slots.values():
        cell = wb[name][ref]
        if not cell.has_style:  # openpyxl skips a cell with no value and no style; the filler needs it there
            cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    wb.calculation = CalcProperties(fullCalcOnLoad=True)
    OUT.mkdir(parents=True, exist_ok=True)
    wb.save(OUT / "template.xlsx")
    add_shared_strings(OUT / "template.xlsx")
    sheet = {n: f"xl/worksheets/sheet{i}.xml" for i, n in enumerate(SHEETS, start=1)}
    manifest = {
        "lastRow": LAST,
        "dataSheet": sheet["1_Data"],
        "columns": [{"name": c["name"], "type": c["type"], "col": COL[c["name"]]} for c in COLUMNS],
        "helpers": [{"name": n, "col": COL[n]} for n, _, _ in HELPERS],
        "slots": {k: {"sheet": sheet[s], "ref": ref} for k, (s, ref) in slots.items()},
        "gears": {"sheet": sheet["5_By_gear"], "refs": gear_cells},
        "species": {"sheet": sheet["6_By_species"], "refs": species_cells},
    }
    (OUT / "template.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT / 'template.xlsx'} and template.json: {len(DATA)} columns, {len(HELPERS)} worked out")


def add_shared_strings(path):
    """An empty shared-strings part, which the filler fills: openpyxl writes text inline and leaves none."""
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
    main_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    files["xl/sharedStrings.xml"] = f'<sst xmlns="{main_ns}" count="0" uniqueCount="0"></sst>'.encode()
    rel = ('<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
           'Target="sharedStrings.xml" Id="rIdStrings" />')
    files["xl/_rels/workbook.xml.rels"] = files["xl/_rels/workbook.xml.rels"].replace(
        b"</Relationships>", rel.encode() + b"</Relationships>")
    override = ('<Override PartName="/xl/sharedStrings.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" />')
    files["[Content_Types].xml"] = files["[Content_Types].xml"].replace(b"</Types>", override.encode() + b"</Types>")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in files.items():
            z.writestr(n, b)


if __name__ == "__main__":
    main()
