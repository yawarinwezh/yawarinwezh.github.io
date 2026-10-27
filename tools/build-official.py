"""Build js/official-data.js from official/<city>.csv.

Run from the repository root:  python3 tools/build-official.py
A value that differs by more than 10 minutes from BOTH neighbouring days is treated
as a typo on the source site and replaced by the average of those two days; every
such repair is printed so it can be checked.
"""
import csv, datetime, glob, json, os

K = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
DATES = [(datetime.date(2026, 1, 1) + datetime.timedelta(i)) for i in range(365)]
out = {}
for f in sorted(glob.glob("official/*.csv")):
    cid = os.path.basename(f)[:-4]
    rows = list(csv.DictReader(open(f, encoding="utf-8-sig")))
    assert [(int(r["month"]), int(r["day"])) for r in rows] == [(d.month, d.day) for d in DATES], f"{cid}: dates must be Jan 1 .. Dec 31 (365 rows)"
    days = [[int(r[k][:2]) * 60 + int(r[k][3:5]) for k in K] for r in rows]
    for i, d in enumerate(days):
        prev, nxt = days[i - 1], days[(i + 1) % 365]
        for j in range(6):
            if abs(d[j] - prev[j]) > 10 and abs(d[j] - nxt[j]) > 10:
                fixed = round((prev[j] + nxt[j]) / 2)
                print(f"repaired {cid} {rows[i]['month']}/{rows[i]['day']} {K[j]}: {d[j]//60:02}:{d[j]%60:02} -> {fixed//60:02}:{fixed%60:02}")
                d[j] = fixed
        assert d == sorted(d), f"{cid} {rows[i]['month']}/{rows[i]['day']}: times out of order"
    out[cid] = ",".join(str(x) for d in days for x in d)
with open("js/official-data.js", "w") as fh:
    fh.write("// Prayer timetables per city (minutes after midnight, 365 days × fajr,sunrise,dhuhr,asr,maghrib,isha).\n"
             "// Built from official/*.csv; source in official/SOURCE.txt. Regenerate with tools/build-official.py.\n"
             "export const OFFICIAL = " + json.dumps(out) + ";\n")
print("cities:", ", ".join(out))
