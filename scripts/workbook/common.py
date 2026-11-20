"""What the template's sheets share: the columns, the worked-out columns, the totals, the styles."""
import json
import urllib.request

from openpyxl.chart import BarChart, LineChart
from openpyxl.styles import Alignment, Font, PatternFill, Protection
from openpyxl.utils import get_column_letter

METADATA = "https://api.peskas.org/api/v1/metadata/landings"
VERSION = "2.0, November 2026"
LAST = 1048576  # last row of every data range; the filler replaces it with the download's last row
GEARS, SPECIES, MONTHS = 10, 12, 24
TYPES = {"string": "string", "date": "date", "integer": "number", "float": "number"}

BOLD = Font(bold=True)
TITLE = Font(bold=True, size=16)
SECTION = Font(bold=True, size=12, color="1F4E79")
GREY = Font(color="808080")
NOTE = Font(italic=True, color="595959")
HEAD = PatternFill("solid", fgColor="DDEBF7")
INPUT = PatternFill("solid", fgColor="FFF2CC")
BANNER = PatternFill("solid", fgColor="FCE4D6")
WRAP = Alignment(wrap_text=True, vertical="top")
KG, MONEY, RATE, SHARE, COUNT, DATE = "#,##0.0", "#,##0", "0.000", "0.0%", "#,##0", "yyyy-mm-dd"


def fields():
    with urllib.request.urlopen(METADATA, timeout=30) as r:
        meta = json.load(r)["fields"]
    return [{"name": n, "type": TYPES[f["data_type"]], "unit": f.get("unit") or "", "meaning": f["description"]}
            for n, f in meta.items()]


COLUMNS = fields()
DATA = [c["name"] for c in COLUMNS]
# Worked out on every row: (name, formula with {col} for a column's cell in this row and {prev:col} for the row above).
HELPERS = [
    ("row", None, "Order of the row in the download. If 1_Data was sorted, sort it back by this column."),
    ("include", "IF(SUBTOTAL(103,{trip_id})=0,0,IF(AND(OR(N(Start!$C$20)<36526,{landing_date}>=N(Start!$C$20)),"
                "OR(N(Start!$C$21)<36526,{landing_date}<=N(Start!$C$21))),1,0))",
     "1 when the row counts: a filter shows it and its landing date is inside the dates on Start."),
    ("new_trip", "IF({trip_id}<>{prev:trip_id},1,0)", "1 on the first row of each trip."),
    ("seen", "IF({new_trip}=1,{include},MAX({prev:seen},{include}))", "1 once a row of this trip has counted."),
    ("trip_first", "IF({include}=1,IF({new_trip}=1,1,1-{prev:seen}),0)",
     "1 on the first row of a trip that counts: every trip figure is taken from this row only."),
    ("new_catch", "IF(OR({new_trip}=1,{n_catch}<>{prev:n_catch}),1,0)", "1 on the first row of each catch."),
    ("month_key", "IF(ISNUMBER({landing_date}),YEAR({landing_date})*100+MONTH({landing_date}),\"\")",
     "Year and month as a number, e.g. 202603."),
    ("fisher_hours", "IF({trip_first}=1,IF(AND(ISNUMBER({n_fishers}),ISNUMBER({trip_duration_hrs})),"
                     "{n_fishers}*{trip_duration_hrs},0),0)", "Fishers times hours, once per trip."),
    ("cpue_trip", "IF(AND({fisher_hours}>0,ISNUMBER({tot_catch_kg}),{tot_catch_kg}>0),"
                  "{tot_catch_kg}/{fisher_hours},\"\")",
     "The trip's kg per fisher per hour. Empty for a trip with no catch, as on the platform."),
    ("price_kg_trip", "IF(AND({trip_first}=1,ISNUMBER({tot_catch_kg}),ISNUMBER({tot_catch_price}),{tot_catch_kg}>0,"
                      "{tot_catch_price}>0),{tot_catch_price}/{tot_catch_kg},\"\")", "The trip's price per kg."),
    ("length_x_fish", "IF(AND({include}=1,ISNUMBER({length_cm})),{length_cm}*IF(ISNUMBER({n_fish}),{n_fish},1),0)",
     "Length times the fish it stands for."),
    ("fish_measured", "IF(AND({include}=1,ISNUMBER({length_cm})),IF(ISNUMBER({n_fish}),{n_fish},1),0)",
     "Fish the row's length stands for."),
    ("date_inc", "IF(AND({include}=1,ISNUMBER({landing_date})),{landing_date},\"\")",
     "Landing date of a row that counts."),
]
ALL = DATA + [h[0] for h in HELPERS]
COL = {name: get_column_letter(i + 1) for i, name in enumerate(ALL)}


def rng(name):
    return f"d_{name}"


TRIP_KG = f"SUMIFS({rng('tot_catch_kg')},{rng('trip_first')},1)"
TRIP_PRICE = f"SUMIFS({rng('tot_catch_price')},{rng('trip_first')},1)"
EFFORT_KG = f"SUMIFS({rng('tot_catch_kg')},{rng('fisher_hours')},\">0\")"
SAMPLE = f"SUMIFS({rng('catch_kg')},{rng('include')},1)"


def lock(ws, ref):
    ws[ref].protection = Protection(locked=False)
    ws[ref].fill = INPUT


def text(ws, ref, value, font=None, wrap=False):
    ws[ref] = value
    if font:
        ws[ref].font = font
    if wrap:
        ws[ref].alignment = WRAP


def header_row(ws, row, heads, wrap=False):
    for i, h in enumerate(heads):
        cell = ws[f"{get_column_letter(2 + i)}{row}"]
        cell.value, cell.font, cell.fill = h, BOLD, HEAD
        if wrap:
            cell.alignment = WRAP


def banner(ws, ref="B4"):
    ws[ref] = "=2_Check!$B$4"
    ws[ref].font = BOLD
    ws[ref].fill = BANNER


def chart(kind, title, data, categories, height, width):
    """A chart with one series, no legend and both axes shown: kind is 'col', 'bar' or 'line'."""
    ch = LineChart() if kind == "line" else BarChart()
    if kind != "line":
        ch.type = kind
    ch.title = title
    ch.add_data(data, titles_from_data=True)
    ch.set_categories(categories)
    ch.legend = None
    ch.height, ch.width = height, width
    ch.x_axis.delete = ch.y_axis.delete = False
    return ch


def listed_twice(first, last, r):
    """For a typed list of names in B: whether row r's name is typed twice, and whether to leave the row empty.

    A name typed twice would count twice in the rows and against the "all other" row.
    """
    twice = f"COUNTIF($B${first}:$B${last},$B{r})>1"
    return twice, f'OR($B{r}="",{twice})'


def protect(ws, **allow):
    ws.protection.sheet = True
    for k, v in allow.items():
        setattr(ws.protection, k, v)
