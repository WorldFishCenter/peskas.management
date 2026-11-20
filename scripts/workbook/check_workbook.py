# /// script
# requires-python = ">=3.10"
# dependencies = ["openpyxl==3.1.5", "pandas", "pyarrow"]
# ///
"""Check an Excel report against figures worked out straight from its source rows.

Fills the workbook from a trips CSV or parquet (scripts/workbook/fill.cjs), optionally sets the Start
dates, hides rows (as a filter does) or moves a row (as a sort does), recalculates it in LibreOffice,
headless and in any locale, and compares every figure with an independent calculation in pandas.

    uv run scripts/workbook/check_workbook.py <trips.csv|parquet> [--country kenya] [--locale pt-PT]
        [--from 2026-03-01 --to 2026-04-30] [--hide landing_site=Vanga] [--sort] [--keep out.xlsx]
"""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
SOFFICE = shutil.which("soffice") or "/Applications/LibreOffice.app/Contents/MacOS/soffice"
MANIFEST = json.loads((REPO / "lib/workbook/template.json").read_text())
START_SHEET, DATA_SHEET = MANIFEST["slots"]["country"]["sheet"], MANIFEST["dataSheet"]
DATA_COLS = {c["col"] for c in MANIFEST["columns"]}
GEAR_ROWS = [int(ref[1:]) for ref in MANIFEST["gears"]["refs"]]
SPECIES_ROWS = [int(ref[1:]) for ref in MANIFEST["species"]["refs"]]
EPOCH = date(1899, 12, 30)
PROFILE = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Setup/L10N"><prop oor:name="ooSetupSystemLocale" oor:op="fuse"><value>{locale}</value></prop></item>
</oor:items>
"""


def load(path):
    df = pd.read_parquet(path) if str(path).endswith(".parquet") else pd.read_csv(path, dtype=str, keep_default_na=False)
    df = df.astype(object).where(pd.notna(df), "")
    return df.astype(str).replace({"None": "", "nan": "", "NaN": ""})


def num(v):
    try:
        x = float(v)
        return None if math.isnan(x) else x
    except (TypeError, ValueError):
        return None


def ordered(df):
    """The filler's order: trips by landing date, a trip's catches by n_catch."""
    df = df.copy()
    df["_trip_order"] = df.groupby("trip_id", sort=False).ngroup()
    df["_catch"] = df["n_catch"].map(lambda v: num(v) or 0)
    df["_date"] = df.groupby("trip_id")["landing_date"].transform("first")
    df["_i"] = range(len(df))
    return df.sort_values(["_date", "_trip_order", "_catch", "_i"], kind="stable").reset_index(drop=True)


def expected(df, gears, species, start=None, end=None):
    """Every figure, from the rows that count: shown and inside the dates."""
    d = df[df["_shown"]]
    day = d["landing_date"].str[:10]
    if start:
        d = d[day >= start]
    if end:
        d = d[d["landing_date"].str[:10] <= end]
    dated = d.loc[d["landing_date"] != "", "landing_date"]
    trips = d.groupby("trip_id", sort=False).first()
    kg = trips["tot_catch_kg"].map(num).astype(float).fillna(0)
    price = trips["tot_catch_price"].map(num).astype(float).fillna(0)
    nf, hrs = trips["n_fishers"].map(num).astype(float), trips["trip_duration_hrs"].map(num).astype(float)
    effort = (nf * hrs).fillna(0)
    cpue = (kg / effort)[(effort > 0) & (kg > 0)]
    pkg = (price / kg)[(kg > 0) & (price > 0)]
    month = trips["landing_date"].str[:7]
    e = {"rows": len(d), "trips": len(trips), "catch": int((trips["catch_outcome"].map(num) == 1).sum()),
         "no_catch": int((trips["catch_outcome"].map(num) == 0).sum()),
         "first": dated.min()[:10] if len(dated) else "", "last": dated.max()[:10] if len(dated) else "",
         "species_catches": d[d["scientific_name"] != ""].drop_duplicates(["trip_id", "n_catch"]).shape[0],
         "wrong": d["tot_catch_kg"].map(num).fillna(0).sum(), "real": kg.sum(),
         "sample": d["catch_kg"].map(num).fillna(0).sum(), "value": price.sum(), "effort": effort.sum(),
         "cpue_ratio": kg[effort > 0].sum() / effort.sum() if effort.sum() else None,
         "cpue_median": cpue.median() if len(cpue) else None, "cpue_mean": cpue.mean() if len(cpue) else None,
         "per_trip": kg.sum() / len(trips) if len(trips) else None,
         "pkg_median": pkg.median() if len(pkg) else None, "pkg_mean": pkg.mean() if len(pkg) else None,
         "no_crew": int(nf.isna().sum()), "no_hours": int(hrs.isna().sum()), "no_effort": int((effort == 0).sum())}
    e["months"] = {}
    if len(dated):
        last = pd.Period(e["last"], "M")
        for period in pd.period_range(max(pd.Period(e["first"], "M"), last - 23), last, freq="M"):
            key = str(period)
            sel = month == key
            c = cpue[sel.reindex(cpue.index, fill_value=False)]
            e["months"][key] = (kg[sel].sum(), int(sel.sum()), effort[sel].sum(), c.mean() if len(c) else None,
                                price[sel].sum())
    def gear_row(sel):
        n, hours, ek = int(sel.sum()), effort[sel].sum(), kg[sel & (effort > 0)].sum()
        rate = "too few trips" if n < 20 else (ek / hours if hours else None)
        return kg[sel].sum(), n, hours, rate, kg[sel].sum() / kg.sum() if kg.sum() else None, ek

    g = trips["gear"]
    e["gears"] = {name: gear_row(g == name) for name in gears}
    e["gears"]["All other gear"] = gear_row(~g.isin(gears))
    e["species"] = {}
    for name in species:
        rows = d[d["scientific_name"] == name]
        code = df.loc[df["scientific_name"] == name, "catch_taxon"]
        lengths = rows["length_cm"].map(num)
        fish = rows["n_fish"].map(num).fillna(1)[lengths.notna()] if "n_fish" in rows else None
        avg = (lengths.dropna() * fish).sum() / fish.sum() if fish is not None and fish.sum() else None
        weight = sum(num(v) or 0 for v in rows["catch_kg"])
        e["species"][name] = (code.iloc[0] if len(code) else "not found", weight,
                              rows.drop_duplicates(["trip_id", "n_catch"]).shape[0],
                              weight / e["sample"] if e["sample"] else None, avg)
    listed = e["species"].values()
    other = e["sample"] - sum(v[1] for v in listed)
    e["species_other"] = (other, e["species_catches"] - sum(v[2] for v in listed),
                          other / e["sample"] if e["sample"] else None)
    e["file_rows"] = int((df["trip_id"] != "").sum())
    e["file_trips"] = df["trip_id"].nunique()
    return e


def set_cell(xml, ref, value):
    pat = re.compile(rf'<c r="{ref}"([^>]*?)(?:/>|>.*?</c>)', re.S)
    m = pat.search(xml)
    s = re.search(r' s="\d+"', m.group(1))
    return pat.sub(lambda _: f'<c r="{ref}"{s.group(0) if s else ""}><v>{value}</v></c>', xml, count=1)


def edit(path, out, start=None, end=None, hide=None, sort=False):
    """The officer's actions, as XML edits: dates on Start, rows hidden by a filter, a sort."""
    import zipfile
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
    start_xml = files[START_SHEET].decode()
    for ref, v in (("C20", start), ("C21", end)):
        if v:
            start_xml = set_cell(start_xml, ref, (date.fromisoformat(v) - EPOCH).days)
    files[START_SHEET] = start_xml.encode()
    data = files[DATA_SHEET].decode()
    if hide:
        data = re.sub(r'<row r="(\d+)">', lambda m: f'<row r="{m.group(1)}" hidden="1">' if int(m.group(1)) in hide
                      else m.group(0), data)
    if sort:
        # Move row 2's data cells to the last row and back, as sorting by a catch column would.
        rows = re.findall(r'<row r="(\d+)"[^>]*>(.*?)</row>', data, re.S)
        last = rows[-1][0]

        def data_cells(xml, r):
            return {m.group(1): m.group(0) for m in re.finditer(rf'<c r="([A-Z]+){r}"[^>]*?(?:/>|>.*?</c>)', xml, re.S)
                    if m.group(1) in DATA_COLS}
        a, b = data_cells(data, 2), data_cells(data, last)
        for col in set(a) | set(b):
            if col in a:
                data = data.replace(a[col], "\0" + col)
        for col in b:
            data = data.replace(b[col], a.get(col, "").replace(f'r="{col}2"', f'r="{col}{last}"') if col in a else "")
        for col in a:
            data = data.replace("\0" + col, b[col].replace(f'r="{col}{last}"', f'r="{col}2"') if col in b else "")
    files[DATA_SHEET] = data.encode()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in files.items():
            z.writestr(n, b)


def recalc(path, locale, workdir):
    profile = Path(workdir) / f"profile-{locale}"
    (profile / "user").mkdir(parents=True, exist_ok=True)
    (profile / "user" / "registrymodifications.xcu").write_text(PROFILE.format(locale=locale))
    out = Path(workdir) / "out"
    subprocess.run([SOFFICE, f"-env:UserInstallation=file://{profile}", "--headless", "--calc", "--convert-to",
                    "xlsx:Calc MS Excel 2007 XML", "--outdir", str(out), str(path)], check=True,
                   capture_output=True, timeout=900)
    return openpyxl.load_workbook(out / Path(path).name, data_only=True)


def compare(wb, e):
    bad = []

    def same(label, got, want, tol=1e-6):
        if isinstance(want, list):
            ok = got == want
        elif isinstance(want, str) or want is None:
            ok = (got in (None, "") and want in (None, "")) or got == want
        elif isinstance(got, (datetime, date)):
            ok = False
        else:
            ok = isinstance(got, (int, float)) and abs(got - want) <= tol * max(1.0, abs(want))
        if not ok:
            bad.append(f"{label}: workbook {got!r}, expected {want!r}")

    def day(v):
        return v.date().isoformat() if isinstance(v, datetime) else ((EPOCH.fromordinal(EPOCH.toordinal() + int(v))
                                                                       .isoformat()) if isinstance(v, (int, float)) else v)

    c, i, mo, ge, sp = (wb[n] for n in ("2_Check", "3_Indicators", "4_By_month", "5_By_gear", "6_By_species"))
    for ref, key in (("C8", "rows"), ("C9", "trips"), ("C10", "catch"), ("C11", "no_catch"), ("C14", "species_catches"),
                     ("C21", "wrong"), ("C22", "real"), ("C25", "sample"), ("C30", "no_crew"), ("C31", "no_hours"),
                     ("C32", "no_effort")):
        same(f"2_Check!{ref} {key}", c[ref].value, e[key])
    same("2_Check!C7 rows in the file", c["C7"].value, e["file_rows"])
    same("2_Check!C15 trips in the whole file", c["C15"].value, e["file_trips"])
    real = e["real"] or None
    same("2_Check!C23 overstatement", c["C23"].value, e["wrong"] - e["real"] if real else None)
    same("2_Check!C24 multiple", c["C24"].value, e["wrong"] / real if real else None)
    same("2_Check!C26 sample share", c["C26"].value, e["sample"] / real if real else None)
    same("2_Check!C12 first date", day(c["C12"].value), e["first"])
    same("2_Check!C13 last date", day(c["C13"].value), e["last"])
    for ref, key in (("C6", "real"), ("C7", "trips"), ("C8", "value"), ("C9", "effort"), ("C16", "cpue_ratio"),
                     ("C17", "cpue_median"), ("C18", "cpue_mean"), ("C19", "per_trip"), ("C20", "pkg_median"),
                     ("C21", "pkg_mean")):
        same(f"3_Indicators!{ref} {key}", i[ref].value, e[key])
    shown = {mo[f"B{r}"].value: r for r in range(6, 30) if mo[f"B{r}"].value not in (None, "")}
    same("4_By_month months", list(shown), list(e["months"]))
    for key, r in shown.items():
        for col, want in zip("CDEFG", e["months"].get(key, (None,) * 5)):
            same(f"4_By_month!{col}{r} {key}", mo[f"{col}{r}"].value, want)
    for r in GEAR_ROWS + [GEAR_ROWS[-1] + 1]:
        name = ge[f"B{r}"].value
        if name in e["gears"]:
            for col, want in zip("CDEFGH", e["gears"][name]):
                same(f"5_By_gear!{col}{r} {name}", ge[f"{col}{r}"].value, want)
    same("5_By_gear all gear", ge[f"C{GEAR_ROWS[-1] + 3}"].value, e["real"])
    for r in SPECIES_ROWS:
        name = sp[f"B{r}"].value
        if name in e["species"]:
            for col, want in zip("CDEFG", e["species"][name]):
                same(f"6_By_species!{col}{r} {name}", sp[f"{col}{r}"].value, want)
    other, total = SPECIES_ROWS[-1] + 1, SPECIES_ROWS[-1] + 3
    for col, want in zip("DEF", e["species_other"]):
        same(f"6_By_species!{col}{other} all other species", sp[f"{col}{other}"].value, want)
    same("6_By_species all species", sp[f"D{total}"].value, e["sample"])
    same("6_By_species shares add to 1", sum(sp[f"F{r}"].value or 0 for r in SPECIES_ROWS + [other]),
         1.0 if e["sample"] else 0)
    return bad, error_cells(wb), c["B4"].value, c["C17"].value


def error_cells(wb):
    return [f"{ws.title}!{cell.coordinate}: {cell.value}" for ws in wb for row in ws.iter_rows() for cell in row
            if isinstance(cell.value, str) and cell.value.startswith("#") and cell.value[1:4].isupper()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--country", default="kenya")
    ap.add_argument("--locale", default="en-US")
    ap.add_argument("--from", dest="start")
    ap.add_argument("--to", dest="end")
    ap.add_argument("--hide", help="column=value: hide the rows that match, as a filter would")
    ap.add_argument("--sort", action="store_true", help="move one row out of its trip, as a sort would")
    ap.add_argument("--where", help="column=value: check only these rows (one form, one district)")
    ap.add_argument("--keep", help="save the filled workbook here")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        df = load(a.source)
        if a.where:
            col, val = a.where.split("=", 1)
            df = df[df[col] == val]
        csv = Path(tmp) / "trips.csv"
        df.to_csv(csv, index=False)
        for c in MANIFEST["columns"]:
            if c["name"] not in df:
                df[c["name"]] = ""  # the workbook leaves a missing column empty
        filled = Path(tmp) / "filled.xlsx"
        subprocess.run(["node", str(REPO / "scripts/workbook/fill.cjs"), str(csv), str(filled), "--country", a.country,
                        "--date", "2026-11-20"], check=True, capture_output=True)
        if a.keep:
            shutil.copy(filled, a.keep)
        if df.empty:
            wb = recalc(filled, a.locale, tmp)
            errors, banner = error_cells(wb), wb["2_Check"]["B4"].value
            ok = banner == "This workbook has no data rows." and not errors
            print(f"{'ok ' if ok else 'FAIL'} {Path(a.source).name} [{a.locale}]: no rows; banner {banner!r}"
                  + (f"; errors {errors[:5]}" if errors else ""))
            sys.exit(0 if ok else 1)
        df = ordered(df)
        df["_shown"] = True
        hide = set()
        if a.hide:
            col, val = a.hide.split("=", 1)
            df["_shown"] = df[col] != val
            hide = {i + 2 for i in df.index[~df["_shown"]]}
        test = Path(tmp) / "test.xlsx"
        edit(filled, test, a.start, a.end, hide, a.sort)
        wb = recalc(test, a.locale, tmp)
        gears = [wb["5_By_gear"][f"B{r}"].value for r in GEAR_ROWS if wb["5_By_gear"][f"B{r}"].value]
        species = [wb["6_By_species"][f"B{r}"].value for r in SPECIES_ROWS if wb["6_By_species"][f"B{r}"].value]
        e = expected(df, gears, species, a.start, a.end)
        bad, errors, banner, order = compare(wb, e)
    label = f"{Path(a.source).name}{' ' + a.where if a.where else ''} [{a.locale}]" + \
            (f" {a.start}..{a.end}" if a.start or a.end else "") + (f" hide {a.hide}" if a.hide else "") + \
            (" sorted" if a.sort else "")
    if a.sort:
        ok = order != "OK" and str(banner).startswith("SORTED")
        print(f"{'ok ' if ok else 'FAIL'} {label}: sort check says {str(order)[:60]!r}")
        sys.exit(0 if ok else 1)
    for line in bad[:25] + errors[:10]:
        print("   ", line)
    status = "ok " if not bad and not errors and order == "OK" else "FAIL"
    print(f"{status} {label}: {e['rows']} rows, {e['trips']} trips, real {e['real']:,.1f} kg, wrong sum "
          f"{e['wrong']:,.1f}, sample {e['sample']:,.1f}, mean CPUE {e['cpue_mean'] or 0:.3f}; {len(e['months'])} months, "
          f"{len(gears)} gears, {len(species)} species; banner {banner!r}")
    sys.exit(0 if status == "ok " else 1)


if __name__ == "__main__":
    main()
