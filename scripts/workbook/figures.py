"""The data and figure sheets of the template: 1_Data, 4_By_month, 5_By_gear, 6_By_species and 7_Report."""
from openpyxl.chart import Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.workbook.defined_name import DefinedName

from common import (ALL, BOLD, COL, COLUMNS, COUNT, DATA, DATE, EFFORT_KG, GEARS, GREY, HEAD, HELPERS, KG, LAST,
                    MONEY, MONTHS, NOTE, RATE, SAMPLE, SECTION, SHARE, SPECIES, TITLE, TRIP_KG, banner, chart,
                    header_row, listed_twice, lock, protect, rng, text)


def data(ws, wb):
    ws.freeze_panes = "A2"
    for name, letter in COL.items():
        ws.column_dimensions[letter].width = max(10, min(len(name) + 3, 26))
        cell = ws[f"{letter}1"]
        cell.value, cell.font = name, BOLD
        cell.fill = HEAD if name in DATA else PatternFill("solid", fgColor="E7E6E6")
    fmt = {"date_inc": DATE, "cpue_trip": RATE, "price_kg_trip": "#,##0.00"}
    fmt.update({c["name"]: DATE for c in COLUMNS if c["type"] == "date"})
    for name, formula, _ in HELPERS:
        if formula:
            for other in ALL:
                formula = formula.replace("{prev:" + other + "}", f"${COL[other]}1").replace(
                    "{" + other + "}", f"${COL[other]}2")
            assert "{" not in formula, (name, formula)
            ws[f"{COL[name]}2"] = "=" + formula
    for name, nf in fmt.items():
        ws[f"{COL[name]}2"].number_format = nf
    ws.auto_filter.ref = f"A1:{COL[DATA[-1]]}{LAST}"
    for name in ALL:
        wb.defined_names[rng(name)] = DefinedName(rng(name), attr_text=f"'1_Data'!${COL[name]}$2:${COL[name]}${LAST}")
    protect(ws, autoFilter=False, formatColumns=False, formatRows=False)


def by_month(ws):
    for col, width in zip("ABCDEFGH", (2, 12, 18, 18, 18, 18, 18, 9)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "By month", TITLE)
    text(ws, "B3", "Up to 24 months of what is included. First month shown:")
    d = rng("date_inc")
    ws["F3"] = (f'=IF(COUNT({d})=0,"",IF(N(Start!$C$23)>=36526,DATE(YEAR(Start!$C$23),MONTH(Start!$C$23),1),'
                f'MAX(DATE(YEAR(MIN({d})),MONTH(MIN({d})),1),EDATE(DATE(YEAR(MAX({d})),MONTH(MAX({d})),1),'
                f'-{MONTHS - 1}))))')
    ws["F3"].number_format = "yyyy-mm"
    ws["F3"].alignment = Alignment(horizontal="left")
    banner(ws)
    header_row(ws, 5, ["Month", "Catch (kg)", "Trips", "Fishing time (hours)",
                       "Catch rate, average of trips (kg per fisher per hour)", "=\"Value (\"&Start!$C$11&\")\"",
                       "key"], wrap=True)
    ws.row_dimensions[5].height = 45
    first, last = 6, 6 + MONTHS - 1
    mk, tf = rng("month_key"), rng("trip_first")
    for r in range(first, last + 1):
        k = r - first
        ws[f"H{r}"] = (f'=IF($F$3="","",IF(EDATE($F$3,{k})>MAX({d}),"",'
                       f'YEAR(EDATE($F$3,{k}))*100+MONTH(EDATE($F$3,{k}))))')
        ws[f"H{r}"].font = GREY
        ws[f"B{r}"] = f'=IF($H{r}="","",INT($H{r}/100)&"-"&IF(MOD($H{r},100)<10,"0","")&MOD($H{r},100))'
        ws[f"C{r}"] = f'=IF($H{r}="","",SUMIFS({rng("tot_catch_kg")},{tf},1,{mk},$H{r}))'
        ws[f"D{r}"] = f'=IF($H{r}="","",SUMIFS({tf},{mk},$H{r}))'
        ws[f"E{r}"] = f'=IF($H{r}="","",SUMIFS({rng("fisher_hours")},{mk},$H{r}))'
        ws[f"F{r}"] = (f'=IF($H{r}="","",IFERROR(AVERAGEIFS({rng("cpue_trip")},{mk},$H{r},'
                       f'{rng("cpue_trip")},">0"),""))')
        ws[f"G{r}"] = f'=IF($H{r}="","",SUMIFS({rng("tot_catch_price")},{tf},1,{mk},$H{r}))'
        for c, nf in zip("CDEFG", (KG, COUNT, "#,##0", RATE, MONEY)):
            ws[f"{c}{r}"].number_format = nf
    ws[f"B{last + 2}"] = (f'=IF($F$3="","",IF(MIN({d})<$F$3,"Earlier months are not shown. To see them, type a date '
                          f'in First month in the month list on Start.","")&IF(MAX({d})>=EDATE($F$3,{MONTHS}),'
                          f'" Later months are not shown: clear or change that date.",""))')
    ws[f"B{last + 2}"].font = NOTE
    cats = Reference(ws, min_col=2, min_row=first, max_row=last)
    ws.add_chart(chart("col", "Catch by month (kg)", Reference(ws, min_col=3, min_row=5, max_row=last), cats,
                       7.5, 18), "J5")
    ws.add_chart(chart("line", "Trips by month", Reference(ws, min_col=4, min_row=5, max_row=last), cats, 7.5, 18),
                 "J21")
    protect(ws)


def by_gear(ws):
    for col, width in zip("ABCDEFG", (2, 26, 18, 18, 18, 18, 18)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "By fishing gear", TITLE)
    text(ws, "B3", "The most common gears in your download, then all the others together. Type over a gear name "
                   "to report on another one.")
    banner(ws)
    header_row(ws, 5, ["Fishing gear", "Catch (kg)", "Trips", "Fishing time (hours)",
                       "Catch rate (kg per fisher per hour)", "Share of catch weight",
                       "Catch of trips with effort (kg)"], wrap=True)
    ws.row_dimensions[5].height = 30
    g, tf = rng("gear"), rng("trip_first")
    first, last = 6, 6 + GEARS - 1
    other, total = last + 1, last + 3
    for r in range(first, last + 1):
        lock(ws, f"B{r}")
        twice, skip = listed_twice(first, last, r)
        ws[f"C{r}"] = (f'=IF($B{r}="","",IF({twice},"listed twice",'
                       f'SUMIFS({rng("tot_catch_kg")},{tf},1,{g},$B{r})))')
        ws[f"D{r}"] = f'=IF({skip},"",SUMIFS({tf},{g},$B{r}))'
        ws[f"E{r}"] = f'=IF({skip},"",SUMIFS({rng("fisher_hours")},{g},$B{r}))'
        ws[f"H{r}"] = f'=IF({skip},"",SUMIFS({rng("tot_catch_kg")},{rng("fisher_hours")},">0",{g},$B{r}))'
        ws[f"F{r}"] = f'=IF({skip},"",IF($D{r}<20,"too few trips",IFERROR($H{r}/$E{r},"")))'
        ws[f"G{r}"] = f'=IF({skip},"",IFERROR($C{r}/$C${total},""))'
    ws[f"B{other}"] = "All other gear"
    for c in "CDEH":
        ws[f"{c}{other}"] = f"=IFERROR({c}{total}-SUM({c}{first}:{c}{last}),\"\")"
    ws[f"F{other}"] = f'=IF($D{other}<20,"too few trips",IFERROR($H{other}/$E{other},""))'
    ws[f"G{other}"] = f'=IFERROR($C{other}/$C${total},"")'
    text(ws, f"B{total}", "All gear", BOLD)
    ws[f"C{total}"] = f"={TRIP_KG}"
    ws[f"D{total}"] = f"=SUM({tf})"
    ws[f"E{total}"] = f"=SUM({rng('fisher_hours')})"
    ws[f"H{total}"] = f"={EFFORT_KG}"
    ws[f"F{total}"] = f"=IFERROR($H{total}/$E{total},\"\")"
    ws[f"G{total}"] = f"=IFERROR($C{total}/$C${total},\"\")"
    for r in list(range(first, other + 1)) + [total]:
        for c, nf in zip("CDEFGH", (KG, COUNT, "#,##0", RATE, SHARE, KG)):
            ws[f"{c}{r}"].number_format = nf
        ws[f"H{r}"].font = GREY
    text(ws, f"B{total + 2}", "Gear names are as they appear in the download. A gear with fewer than 20 trips shows "
                              "\"too few trips\" instead of a catch rate. The catch rate uses the trips with a crew "
                              "count and duration.", NOTE)
    ws.add_chart(chart("bar", "Catch by gear (kg)", Reference(ws, min_col=3, min_row=5, max_row=other),
                       Reference(ws, min_col=2, min_row=first, max_row=other), 8, 16), "J5")
    protect(ws)
    return [f"B{r}" for r in range(first, last + 1)]


def by_species(ws):
    for col, width in zip("ABCDEFG", (2, 30, 16, 16, 16, 16, 16)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "By species", TITLE)
    text(ws, "B3", "The species with the most weight in your download's weighed sample. Type over a scientific name "
                   "to report on another one. The weights are from the weighed sample, not the whole catch: report "
                   "the shares, not the kilograms.", wrap=True)
    ws.merge_cells("B3:G3")
    ws.row_dimensions[3].height = 30
    banner(ws)
    header_row(ws, 5, ["Scientific name", "FAO code (3 letters)", "Weight in the sample (kg)", "Catches",
                       "Share of the weighed sample", "Average length (cm)"], wrap=True)
    ws.row_dimensions[5].height = 30
    s, inc = rng("scientific_name"), rng("include")
    first, last = 6, 6 + SPECIES - 1
    other, total = last + 1, last + 3
    for r in range(first, last + 1):
        lock(ws, f"B{r}")
        twice, skip = listed_twice(first, last, r)
        ws[f"C{r}"] = (f'=IF($B{r}="","",IF({twice},"listed twice",'
                       f'IFERROR(INDEX({rng("catch_taxon")},MATCH($B{r},{s},0)),"not found")))')
        ws[f"D{r}"] = f'=IF({skip},"",SUMIFS({rng("catch_kg")},{inc},1,{s},$B{r}))'
        ws[f"E{r}"] = f'=IF({skip},"",SUMIFS({rng("new_catch")},{inc},1,{s},$B{r}))'
        ws[f"F{r}"] = f'=IF({skip},"",IFERROR($D{r}/$D${total},""))'
        ws[f"G{r}"] = (f'=IF({skip},"",IFERROR(SUMIFS({rng("length_x_fish")},{s},$B{r})/'
                       f'SUMIFS({rng("fish_measured")},{s},$B{r}),""))')
    ws[f"B{other}"] = "All other species"
    for c in "DE":
        ws[f"{c}{other}"] = f"=IFERROR({c}{total}-SUM({c}{first}:{c}{last}),\"\")"
    ws[f"F{other}"] = f'=IFERROR($D{other}/$D${total},"")'
    text(ws, f"B{total}", "All species", BOLD)
    ws[f"D{total}"] = f"={SAMPLE}"
    ws[f"E{total}"] = f"=SUMIFS({rng('new_catch')},{inc},1,{s},\"<>\")"
    ws[f"F{total}"] = f"=IFERROR($D{total}/$D${total},\"\")"
    for r in list(range(first, other + 1)) + [total]:
        for c, nf in zip("DEFG", (KG, COUNT, SHARE, "0.0")):
            ws[f"{c}{r}"].number_format = nf
    text(ws, f"B{total + 2}", "\"not found\" means the name is spelled differently in your data: check it against "
                              "the scientific_name column on 1_Data. The average length counts each measured fish "
                              "once (n_fish), and is empty where the form records no length.", NOTE)
    ws.add_chart(chart("bar", "Share of the weighed sample", Reference(ws, min_col=6, min_row=5, max_row=other),
                       Reference(ws, min_col=2, min_row=first, max_row=other), 9, 16), "I5")
    protect(ws)
    return [f"B{r}" for r in range(first, last + 1)]


def report(ws, month_ws, gear_ws):
    ws.column_dimensions["A"].width = 2
    for c in "BCDEFGHI":
        ws.column_dimensions[c].width = 14
    text(ws, "B2", "Catch summary", TITLE)
    text(ws, "B3", "Everything on this page comes from your data. To put it in a report: File > Print > Save as "
                   "PDF. It fits on one page.", wrap=True)
    ws.merge_cells("B3:I3")
    banner(ws)
    ws.merge_cells("B4:I4")
    info = [("Area", "=Start!$C$8", None, None),
            ("Period", "=2_Check!$C$12", "to", "=2_Check!$C$13"),
            ("Data status", "=Start!$C$9", "Downloaded", "=Start!$C$10"),
            ("Prepared by", '=IF(Start!$C$12="","(not filled in)",Start!$C$12)', None, None)]
    for i, (a, b, c, d) in enumerate(info, start=6):
        text(ws, f"B{i}", a, BOLD)
        ws[f"B{i}"].alignment = Alignment(vertical="top")
        ws[f"C{i}"] = b
        ws[f"C{i}"].alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        if c:
            text(ws, f"E{i}", c, BOLD)
            ws[f"F{i}"] = d
            ws[f"F{i}"].alignment = Alignment(horizontal="left")
    ws.merge_cells("C6:I6")
    ws.row_dimensions[6].height = 30
    for ref in ("C7", "F7", "F8"):
        ws[ref].number_format = DATE
    tiles = [("B", "Total catch", "=3_Indicators!$C$6", KG, "kg, surveyed trips only"),
             ("D", "Trips", "=3_Indicators!$C$7", COUNT, "trips surveyed"),
             ("F", "Catch rate", "=3_Indicators!$C$18", RATE, "kg per fisher per hour (mean)"),
             ("H", "Price", "=3_Indicators!$C$20", "#,##0.00", '=Start!$C$11&" per kg (median)"')]
    for c, label, f, nf, unit in tiles:
        text(ws, f"{c}11", label, BOLD)
        ws[f"{c}12"] = f
        ws[f"{c}12"].number_format = nf
        ws[f"{c}12"].font = Font(bold=True, size=16)
        text(ws, f"{c}13", unit, NOTE)
    for src, kind, title, last, anchor in ((month_ws, "col", "Catch by month (kg)", 5 + MONTHS, "B15"),
                                           (gear_ws, "bar", "Catch by gear (kg)", 6 + GEARS, "F15")):
        ws.add_chart(chart(kind, title, Reference(src, min_col=3, min_row=5, max_row=last),
                           Reference(src, min_col=2, min_row=6, max_row=last), 7.5, 11), anchor)
    text(ws, "B32", "Five lines", SECTION)
    text(ws, "B33", "A short structure that works for any report: one number, one comparison, what could be wrong "
                    "with it, one ask.")
    lines = [("1  What is the question?", "In the words of the person who will read this"),
             ("2  The number", "One number, with its unit and the months it covers"),
             ("3  Compare it with something", "Last year, a neighbouring district, or a target"),
             ("4  What could be wrong with it", "Few trips; months with very few trips; problems listed on 2_Check"),
             ("5  What you want to happen next", "A decision, an action, or a resource")]
    for i, (a, b) in enumerate(lines, start=34):
        text(ws, f"B{i}", a, BOLD)
        text(ws, f"E{i}", b, NOTE)
    text(ws, "B40", "Do not claim a reason your data cannot support. A drop in one place, with a nearby place "
                    "unchanged, is a reason to go and look: it does not tell you why. These figures cover the trips "
                    "that were surveyed, not everything that was landed.", wrap=True)
    ws.merge_cells("B40:I40")
    ws.row_dimensions[40].height = 45
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = "A1:I41"
    protect(ws)
