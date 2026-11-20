"""The text sheets of the template: Start, 2_Check, 3_Indicators and 8_Columns."""
from openpyxl.styles import Alignment, Font
from openpyxl.worksheet.datavalidation import DataValidation

from common import (BANNER, BOLD, COLUMNS, COUNT, DATA, DATE, EFFORT_KG, GREY, HELPERS, INPUT, KG, MONEY, NOTE, RATE,
                    SAMPLE, SECTION, SHARE, TITLE, TRIP_KG, TRIP_PRICE, VERSION, banner, header_row, lock, protect,
                    rng, text)


def start(ws):
    for col, width in zip("ABCD", (2, 34, 24, 16)):
        ws.column_dimensions[col].width = width
    for c in "EFGHI":
        ws.column_dimensions[c].width = 14
    text(ws, "B2", "Peskas landings: analysis workbook", TITLE)
    text(ws, "B3", "Made by the Peskas management platform from your download. Your data is already in it: "
                   "there is nothing to paste.")
    text(ws, "B4", "Figures empty or zero? Click Enable Editing in the yellow bar at the top: Excel works them out only "
                   "then.", Font(bold=True, color="C55A11"))
    text(ws, "B5", "What you downloaded", SECTION)
    for i, label in enumerate(("Country", "Survey", "Districts", "Data status", "Downloaded on"), start=6):
        text(ws, f"B{i}", label)
    ws["C10"].number_format = DATE
    ws["C10"].alignment = Alignment(horizontal="left")
    ws["C8"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("C8:I8")
    ws.row_dimensions[8].height = 30
    text(ws, "B11", "Currency")
    lock(ws, "C11")
    text(ws, "D11", "Change it if it is wrong: every money figure uses it.", NOTE)
    text(ws, "B12", "Prepared by")
    lock(ws, "C12")
    text(ws, "D12", "Your name, for the report page.", NOTE)

    text(ws, "B14", "Three steps", SECTION)
    steps = [("1.  Check", "Go to 2_Check. Read the line under its title, then the warnings."),
             ("2.  Read", "3_Indicators, 4_By_month, 5_By_gear and 6_By_species. Every figure is worked out one "
                         "fishing trip at a time, so no catch is counted twice."),
             ("3.  Report", "7_Report is the page to print or save as PDF.")]
    for i, (a, b) in enumerate(steps, start=15):
        text(ws, f"B{i}", a, BOLD)
        text(ws, f"C{i}", b)

    text(ws, "B19", "Show only part of the period", SECTION)
    text(ws, "B20", "Show data from")
    text(ws, "B21", "Show data up to")
    for ref in ("C20", "C21", "C23"):
        lock(ws, ref)
        ws[ref].number_format = DATE
    text(ws, "D20", "Leave both cells empty for all dates. Type a date to narrow the period; press Delete to clear it.",
         NOTE)
    text(ws, "B22", "Dates now being used")
    ws["C22"] = "=2_Check!$C$12"
    ws["D22"] = "=2_Check!$C$13"
    for ref in ("C22", "D22"):
        ws[ref].number_format = DATE
        ws[ref].alignment = Alignment(horizontal="left")
    text(ws, "E22", "What the sheets are actually using. Check it after you change anything.", NOTE)
    text(ws, "B23", "First month in the month list")
    text(ws, "D23", "Leave empty: 4_By_month shows the latest 24 months. Type a date to start the list there.", NOTE)
    dv = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                        error="Type a date, the way your Excel shows dates.", errorTitle="Not a date",
                        showErrorMessage=True)
    ws.add_data_validation(dv)
    dv.add("C20:C21")
    dv.add("C23")

    text(ws, "B25", "Show only some districts, gears or landing sites", SECTION)
    notes = [
        ("How", "Go to 1_Data. Every column heading has a small arrow. Click the arrow on the column you want "
                "(gaul_2_name for the district, a sub-county in Kenya; landing_site, gear, vessel_type) and tick the "
                "values to keep. It is the spreadsheet's own filter, so the list comes from your data and cannot be "
                "mistyped."),
        ("Back to everything", "On 1_Data clear the filter from every column heading, and delete the dates above."),
        ("Always check the banner", "Every results sheet has a coloured line under its title: \"Showing all 919 "
                                    "rows\" or \"FILTERED: showing 412 of 919 rows\". Read it before you write any "
                                    "figure into a report."),
        ("Careful with species", "Filter freely on the trip columns, from survey_organization to catch_outcome. "
                                 "Filtering on a species keeps only part of each trip, and the trip's whole catch and "
                                 "fishing time come with it. Use 6_By_species for species."),
        ("Do not sort 1_Data", "Sorting is switched off on 1_Data: each trip's rows must stay together. If you "
                               "unprotect the sheet and sort it, 2_Check says so; sort it back by the row column."),
    ]
    for i, (a, b) in enumerate(notes, start=26):
        text(ws, f"B{i}", a, BOLD)
        text(ws, f"C{i}", b, wrap=True)
        ws.merge_cells(f"C{i}:I{i}")
        ws.row_dimensions[i].height = 45

    text(ws, "B32", "What the shading means", SECTION)
    ws["B33"].fill = INPUT
    text(ws, "C33", "Cells you fill in yourself. Everything else is calculated, and the sheets are protected so it "
                    "cannot be typed over by mistake (Review > Unprotect Sheet, no password, if you must).", wrap=True)
    ws.merge_cells("C33:I33")
    ws.row_dimensions[33].height = 30

    text(ws, "B35", "What one row of your data is", SECTION)
    text(ws, "B36", "One row is one catch: one species from one trip. A trip that landed three species is three "
                    "rows, and the trip columns (tot_catch_kg, n_fishers, trip_duration_hrs, tot_catch_price) repeat "
                    "on all three.", wrap=True)
    ws.merge_cells("B36:I36")
    ws.row_dimensions[36].height = 30
    header_row(ws, 38, ["trip_id", "landing_date", "n_fishers", "trip_duration_hrs", "gear", "catch_taxon", "catch_kg",
                        "tot_catch_kg"])
    example = [["TRIP_0104", "2026-03-11", 3, 5.5, "Gill Net", "SIG", 5.3, 22.7],
               ["TRIP_0104", "2026-03-11", 3, 5.5, "Gill Net", "LWX", 3.2, 22.7],
               ["TRIP_0105", "2026-03-11", 2, 4, "Trap", "OCZ", 6.1, 6.1]]
    for r, vals in enumerate(example, start=39):
        for c, v in enumerate(vals):
            ws.cell(row=r, column=2 + c, value=v)
    text(ws, "B42", "Two rows for trip 0104, one for 0105. Adding up tot_catch_kg gives 51.5 kg. Adding up catch_kg "
                    "gives 14.6 kg: the part of each catch that was weighed by species, which is not always all of "
                    "it. The real total is 28.8 kg: tot_catch_kg once per trip. This workbook does that for you, and "
                    "2_Check shows the difference on your own data.", wrap=True)
    ws.merge_cells("B42:I42")
    ws.row_dimensions[42].height = 45

    text(ws, "B44", "Limits", SECTION)
    limits = ["Every total is for the trips that were surveyed. It is not the total landings of the district "
              "(sub-county in Kenya).",
              "It holds the data it was made with and does not connect to the internet. For newer data, download a "
              "new workbook.",
              "Very large downloads (over 100,000 rows) are slow to recalculate: download one area at a time.",
              "8_Columns says what every column means."]
    for i, line in enumerate(limits, start=45):
        text(ws, f"C{i}", "•  " + line)
    for row in ws.iter_rows(min_col=2, max_col=2):
        for cell in row:
            if cell.value is not None:
                cell.alignment = Alignment(vertical="top")
    text(ws, "B50", f"Version {VERSION}  ·  made by the Peskas management platform (WorldFish)  ·  if something "
                    "looks wrong, say so rather than working around it", NOTE)
    protect(ws)
    return {"country": "C6", "organisation": "C7", "districts_label": "B8", "districts": "C8", "status": "C9",
            "downloaded_on": "C10", "currency": "C11"}


def check(ws):
    for col, width in zip("ABCD", (2, 62, 18, 70)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "Check your file", TITLE)
    text(ws, "B3", "Read this before you use any number from the sheets that follow. If the line below is empty, "
                   "click Enable Editing in the yellow bar at the top.")
    ws["B4"] = ('=IF(C7=0,"This workbook has no data rows.",IF(C17<>"OK",C17,IF(C8=0,"NOTHING MATCHES: clear the '
                'filters on 1_Data and the dates on Start.",IF(C8=C7,"Showing all "&C7&" rows in the file.",'
                '"FILTERED: showing "&C8&" of "&C7&" rows."))))')
    ws["B4"].font = BOLD
    ws["B4"].fill = BANNER
    text(ws, "B6", "What is in the file, and what is included", SECTION)
    date_inc = rng("date_inc")
    rows = [("Rows in the file", f"=COUNTA({rng('trip_id')})", COUNT),
            ("Rows included right now", f"=SUM({rng('include')})", COUNT),
            ("Fishing trips included", f"=SUM({rng('trip_first')})", COUNT),
            ("Trips that reported a catch", f"=SUMIFS({rng('trip_first')},{rng('catch_outcome')},1)", COUNT),
            ("Trips that reported no catch", f"=SUMIFS({rng('trip_first')},{rng('catch_outcome')},0)", COUNT),
            ("Earliest landing date included", f"=IF(COUNT({date_inc})=0,\"\",MIN({date_inc}))", DATE),
            ("Latest landing date included", f"=IF(COUNT({date_inc})=0,\"\",MAX({date_inc}))", DATE),
            ("Catches naming a species",
             f"=SUMIFS({rng('new_catch')},{rng('include')},1,{rng('scientific_name')},\"<>\")", COUNT),
            ("Trips in the whole file", None, COUNT)]
    for i, (label, f, nf) in enumerate(rows, start=7):
        text(ws, f"B{i}", label)
        if f:
            ws[f"C{i}"] = f
        ws[f"C{i}"].number_format = nf
        ws[f"C{i}"].alignment = Alignment(horizontal="right")
    text(ws, "D15", "Written by the platform when it made this workbook.", NOTE)
    text(ws, "B17", "Is each trip's rows together?")
    ws["C17"] = (f'=IF(SUM({rng("new_trip")})=C15,"OK","SORTED: 1_Data has been sorted, so trips are split up and '
                 f'counted more than once. Sort 1_Data by the row column, smallest to largest.")')
    text(ws, "B19", "The double count, on your own data", SECTION)
    text(ws, "B20", "This is the most common error in fisheries reporting. The numbers below show its size on "
                    "your own data.", wrap=True)
    ws.merge_cells("B20:D20")
    double = [("WRONG total: what you get if you add up the tot_catch_kg column",
               f"=SUMIFS({rng('tot_catch_kg')},{rng('include')},1)", KG, GREY),
              ("The real total catch (tot_catch_kg, once per trip)", f"={TRIP_KG}", KG, BOLD),
              ("How much you would have overstated it by", "=IFERROR(C21-C22,\"\")", KG, None),
              ("As a multiple of the truth", "=IFERROR(C21/C22,\"\")", "0.00\"×\"", None),
              ("Adding up catch_kg instead: the weighed sample", f"={SAMPLE}", KG, None),
              ("The weighed sample as a share of the real total", "=IFERROR(C25/C22,\"\")", SHARE, None)]
    for i, (label, f, nf, font) in enumerate(double, start=21):
        text(ws, f"B{i}", label, font)
        ws[f"C{i}"] = f
        ws[f"C{i}"].number_format = nf
        if font:
            ws[f"C{i}"].font = font
    text(ws, "D25", "In KEFS data only part of each catch is weighed by species: use catch_kg for shares, "
                    "never for totals.", NOTE)

    text(ws, "B28", "Things to be aware of", SECTION)
    header_row(ws, 29, ["Check", "Trips", "What it means for your numbers"])
    tf = rng("trip_first")
    aware = [("Trips with no crew count recorded", f"=SUMPRODUCT(({tf}=1)*NOT(ISNUMBER({rng('n_fishers')})))",
              "Left out of every catch-rate figure. They still count in the catch totals."),
             ("Trips with no trip duration recorded",
              f"=SUMPRODUCT(({tf}=1)*NOT(ISNUMBER({rng('trip_duration_hrs')})))",
              "Same: no duration means no kg per fisher per hour for that trip."),
             ("Trips left out of the catch rate for no crew count or duration",
              f"=SUMPRODUCT(({tf}=1)*({rng('fisher_hours')}=0))", "Compare it with the trips included above."),
             ("Trips with no catch", "=C11", "Left out of the per-trip catch rate (median and mean), as on the "
                                             "platform. They count in the totals as zero.")]
    for i, (a, f, d) in enumerate(aware, start=30):
        text(ws, f"B{i}", a)
        ws[f"C{i}"] = f
        ws[f"C{i}"].number_format = COUNT
        text(ws, f"D{i}", d, wrap=True)

    text(ws, "B35", "Columns", SECTION)
    text(ws, "B36", "Written by the platform when it made this workbook.", NOTE)
    header_row(ws, 38, ["Column", "Rows with a value"])
    for i, name in enumerate(DATA, start=39):
        ws[f"B{i}"] = name
        ws[f"C{i}"] = f"=COUNTA({rng(name)})" if name != "landing_date" else f"=COUNT({rng(name)})"
        ws[f"C{i}"].number_format = COUNT
    text(ws, "D39", "An empty column means the form does not collect it: the figures that need it stay empty.", NOTE)
    protect(ws)
    return {"trips_total": "C15", "columns_note": "B37"}


def indicators(ws):
    for col, width in zip("ABCDE", (2, 46, 16, 30, 70)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "The numbers", TITLE)
    text(ws, "B3", "Every figure is worked out one fishing trip at a time, so no catch is counted twice.")
    banner(ws)
    head = [("Total catch", f"={TRIP_KG}", KG, "kg"),
            ("Fishing trips", f"=SUM({rng('trip_first')})", COUNT, "trips"),
            ("Total value", f"={TRIP_PRICE}", MONEY, "=Start!$C$11"),
            ("Fishing time", f"=SUM({rng('fisher_hours')})", "#,##0", "hours (all fishers added together)")]
    for i, (a, f, nf, unit) in enumerate(head, start=6):
        text(ws, f"B{i}", a, BOLD)
        ws[f"C{i}"] = f
        ws[f"C{i}"].number_format = nf
        ws[f"D{i}"] = unit
    text(ws, "B10", "These are totals for the trips that were surveyed. They are NOT the total landings of the "
                    "district (sub-county in Kenya). Do not multiply them up unless somebody has given you a raising "
                    "factor.", wrap=True)
    ws.merge_cells("B10:E10")
    ws.row_dimensions[10].height = 30
    text(ws, "B13", "Catch rate: how much one fisher lands in one hour", SECTION)
    text(ws, "B14", "Also called CPUE. Three ways of working it out: they answer different questions and will not "
                    "match. Always say which one you used. Median = the middle value when you line them all up. "
                    "Mean = add them all up and divide.", wrap=True)
    ws.merge_cells("B14:E14")
    ws.row_dimensions[14].height = 30
    header_row(ws, 15, ["Measure", "Value", "Unit", "How it was worked out"])
    per = "=Start!$C$11&\" per kg\""
    rates = [("Catch rate: all catch over all fishing time",
              f"=IFERROR({EFFORT_KG}/SUM({rng('fisher_hours')}),\"\")", RATE, "kg per fisher per hour",
              "The catch of the trips with a crew count and duration, divided by their fishing time."),
             ("Catch rate: middle trip (median)", f"=IFERROR(MEDIAN({rng('cpue_trip')}),\"\")", RATE,
              "kg per fisher per hour", "The middle trip. Use it to describe a normal trip."),
             ("Catch rate: average of trips (mean)", f"=IFERROR(AVERAGE({rng('cpue_trip')}),\"\")", RATE,
              "kg per fisher per hour", "The same as the platform's monthly catch rate. A few very big trips pull "
                                        "it up."),
             ("Catch per trip (average)", f"=IFERROR({TRIP_KG}/SUM({rng('trip_first')}),\"\")", KG,
              "kg per trip", "All the catch divided by the number of trips."),
             ("Price per kilo (median)", f"=IFERROR(MEDIAN({rng('price_kg_trip')}),\"\")", "#,##0.00", per,
              "The middle trip's price. Always use the median for money."),
             ("Price per kilo (mean)", f"=IFERROR(AVERAGE({rng('price_kg_trip')}),\"\")", "#,##0.00", per,
              "One mistyped price can pull this far from the truth. Use the median above.")]
    for i, (a, f, nf, unit, how) in enumerate(rates, start=16):
        text(ws, f"B{i}", a)
        ws[f"C{i}"] = f
        ws[f"C{i}"].number_format = nf
        ws[f"D{i}"] = unit
        text(ws, f"E{i}", how, wrap=True)
    text(ws, "B24", "Always report these two beside any figure above", SECTION)
    text(ws, "B25", "Number of trips the figure came from")
    ws["C25"] = f"=SUM({rng('trip_first')})"
    ws["C25"].number_format = COUNT
    text(ws, "B26", "Date range included (from / to)")
    ws["C26"] = "=2_Check!$C$12"
    ws["D26"] = "=2_Check!$C$13"
    for ref in ("C26", "D26"):
        ws[ref].number_format = DATE
        ws[ref].alignment = Alignment(horizontal="left")
    text(ws, "B28", "A figure from 8 trips and a figure from 800 trips are not the same kind of statement. Put the "
                    "trip count next to the number, every time.", NOTE)
    protect(ws)


def columns(ws):
    for col, width in zip("ABCDE", (2, 22, 10, 22, 110)):
        ws.column_dimensions[col].width = width
    text(ws, "B2", "What each column means", TITLE)
    text(ws, "B3", "The download's columns, as the Peskas API describes them, then the columns this workbook works "
                   "out on 1_Data.")
    header_row(ws, 5, ["Column", "Type", "Unit", "Meaning"])
    r = 6
    for c in COLUMNS:
        ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"] = c["name"], c["type"], c["unit"]
        text(ws, f"E{r}", c["meaning"], wrap=True)
        r += 1
    text(ws, f"B{r + 1}", "Worked out by the workbook (grey headings on 1_Data)", SECTION)
    for i, (name, _, meaning) in enumerate(HELPERS, start=r + 2):
        ws[f"B{i}"] = name
        text(ws, f"E{i}", meaning, wrap=True)
    protect(ws)
