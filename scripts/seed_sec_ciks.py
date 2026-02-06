#!/usr/bin/env python3
import argparse
import csv
import datetime as dt
import io
import sys
import time
import urllib.request

USER_AGENT = "InstitutionalPortfolio/1.0 (contact: admin@example.com)"
BASE_URL = "https://www.sec.gov/Archives/edgar/full-index"


def recent_quarters(n: int):
    today = dt.date.today()
    year = today.year
    quarter = (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        out.append((year, quarter))
        quarter -= 1
        if quarter == 0:
            quarter = 4
            year -= 1
    return out


def fetch_master_idx(year: int, quarter: int) -> str:
    url = f"{BASE_URL}/{year}/QTR{quarter}/master.idx"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("latin-1")


def parse_master_idx(text: str):
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("CIK|Company Name|Form Type|Date Filed|Filename"):
            start = i + 1
            break
    for line in lines[start:]:
        parts = line.split("|")
        if len(parts) < 5:
            continue
        cik, name, form, _date, _file = parts
        yield cik.strip(), name.strip(), form.strip()


def pad_cik(cik: str) -> str:
    digits = "".join([c for c in cik if c.isdigit()])
    return digits.zfill(10)


def main():
    parser = argparse.ArgumentParser(description="Build SEC CIK seed list from EDGAR full-index master.idx.")
    parser.add_argument("--quarters", type=int, default=4, help="Number of recent quarters to scan")
    parser.add_argument("--limit", type=int, default=200, help="Max number of unique CIKs")
    parser.add_argument("--out", default="seeds/sec_institutions.csv", help="Output CSV path")
    parser.add_argument("--sleep", type=float, default=0.2, help="Sleep between requests (sec)")
    args = parser.parse_args()

    seen = {}
    for year, quarter in recent_quarters(args.quarters):
        try:
            text = fetch_master_idx(year, quarter)
        except Exception as exc:
            print(f"Failed to fetch {year} Q{quarter}: {exc}", file=sys.stderr)
            continue
        for cik, name, form in parse_master_idx(text):
            if form not in ("13F-HR", "13F-HR/A"):
                continue
            if cik not in seen:
                seen[cik] = name
                if len(seen) >= args.limit:
                    break
        if len(seen) >= args.limit:
            break
        time.sleep(args.sleep)

    rows = sorted(seen.items(), key=lambda x: x[1].lower())
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "source", "country_code", "external_id"])
        for cik, name in rows:
            writer.writerow([name, "SEC", "US", pad_cik(cik)])

    print(f"Wrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
