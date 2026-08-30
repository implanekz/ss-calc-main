#!/usr/bin/env python3
"""
Pro Forma Earnings History Generator

Given a target PIA and birth year, reverse-engineer a realistic earnings history
that would produce that PIA. Useful for testing, demos, and documentation.

Usage:
    python3 generate_pia_profile.py --birth-year 1960 --target-pia 2500
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.ssa_xml_processor import SSAXMLProcessor, EarningsRecord
from typing import List, Dict, Tuple
import argparse


def generate_earnings_profile(
    birth_year: int,
    target_pia: float,
    career_pattern: str = "steady",
    working_years: int = 35,
    zero_years: int = 3,
    tolerance: float = 5.0
) -> Tuple[List[EarningsRecord], Dict]:
    """
    Generate a realistic earnings history that produces the target PIA.

    Args:
        birth_year: Person's birth year
        target_pia: Desired PIA (monthly benefit at FRA)
        career_pattern: "steady", "increasing", "peak_mid", "lumpy"
        working_years: How many years of earnings (default 35, not counting zeros)
        zero_years: Number of zero-earning years to include (default 3, realistic)
        tolerance: Acceptable PIA difference (+/- dollars)

    Returns:
        Tuple of (earnings_records, calculation_details)
    """

    # Career patterns define earnings distribution
    PATTERNS = {
        "steady": lambda y, n: 1.0,  # Same every year
        "increasing": lambda y, n: (y + 1) / n,  # Linear growth
        "peak_mid": lambda y, n: 1.0 - abs(y - n/2) / (n/2) * 0.5,  # Peak at midcareer
        "lumpy": lambda y, n: 1.0 if y % 3 == 0 else 0.7,  # Variable income
    }

    pattern_func = PATTERNS.get(career_pattern, PATTERNS["steady"])

    # Calculate target AIME from PIA (reverse bend point formula)
    # PIA formula: 90% of first bend point, 32% of the span to the second, 15% above.

    pia_year = birth_year + 62
    processor = SSAXMLProcessor(birth_year=birth_year)

    # Get bend points for the person's eligibility year, falling back to the most
    # recent published set rather than a hardcoded historical year.
    bend_points = processor.PIA_BEND_POINTS_BY_YEAR.get(
        pia_year,
        processor.PIA_BEND_POINTS_BY_YEAR[max(processor.PIA_BEND_POINTS_BY_YEAR)],
    )

    # Reverse engineer AIME from target PIA
    target_aime = reverse_calculate_aime(target_pia, bend_points)

    print(f"\n{'='*60}")
    print(f"Generating Pro Forma Earnings History")
    print(f"{'='*60}")
    print(f"Birth Year: {birth_year}")
    print(f"Target PIA: ${target_pia:,.2f}/month")
    print(f"Target AIME: ${target_aime:,.2f}/month")
    print(f"Career Pattern: {career_pattern}")
    print(f"Working Years: {working_years} (+ {zero_years} zero years)")
    print(f"Bend Points ({pia_year}): ${bend_points[0]:,}, ${bend_points[1]:,}")
    print(f"{'='*60}\n")

    # Strategically place zero years to be realistic
    # Common gaps: early career, mid-career (child rearing), late career (unemployment)
    total_career_years = working_years + zero_years
    zero_year_positions = []

    if zero_years >= 1:
        zero_year_positions.append(2)  # Early career gap (year 2)
    if zero_years >= 2:
        zero_year_positions.append(total_career_years // 2)  # Mid-career gap
    if zero_years >= 3:
        zero_year_positions.append(total_career_years - 5)  # Late career gap

    # Add more zeros if requested
    for i in range(len(zero_year_positions), zero_years):
        # Scatter remaining zeros
        pos = (i + 1) * (total_career_years // (zero_years + 1))
        if pos not in zero_year_positions:
            zero_year_positions.append(pos)

    # Binary search for the right average earnings level
    low_annual = 10000
    high_annual = 200000
    best_earnings = None
    best_result = None
    iterations = 0
    max_iterations = 50

    while iterations < max_iterations:
        iterations += 1
        mid_annual = (low_annual + high_annual) / 2

        # Generate earnings history using this average
        earnings_records = []
        start_year = birth_year + 22  # Start working at 22

        for i in range(total_career_years):
            year = start_year + i

            # Insert zero years at strategic positions
            if i in zero_year_positions:
                earnings_records.append(EarningsRecord(
                    year=year,
                    earnings=0,
                    is_zero=True,
                    is_projected=False
                ))
                continue

            # Apply pattern to vary earnings across career (excluding zero years)
            work_year_index = i - sum(1 for pos in zero_year_positions if pos < i)
            multiplier = pattern_func(work_year_index, working_years)
            annual_earnings = mid_annual * multiplier

            # Cap at taxable maximum for that year
            max_taxable = processor.TAXABLE_MAXIMUM.get(year, 200000)
            annual_earnings = min(annual_earnings, max_taxable)

            earnings_records.append(EarningsRecord(
                year=year,
                earnings=round(annual_earnings, 2),
                is_zero=False,
                is_projected=False
            ))

        # Calculate PIA with these earnings
        processor.earnings_history = earnings_records
        result = processor.calculate_aime_and_pia(pia_year=pia_year)
        actual_pia = result['pia']

        print(f"Iteration {iterations}: Avg=${mid_annual:,.0f} → PIA=${actual_pia:,.2f} (target ${target_pia:,.2f})")

        # Check if within tolerance
        if abs(actual_pia - target_pia) <= tolerance:
            best_earnings = earnings_records
            best_result = result
            print(f"\n✓ SUCCESS! Found earnings profile within ${tolerance} tolerance")
            break

        # Adjust search range
        if actual_pia < target_pia:
            low_annual = mid_annual
        else:
            high_annual = mid_annual

        # Track best attempt
        if best_result is None or abs(actual_pia - target_pia) < abs(best_result['pia'] - target_pia):
            best_earnings = earnings_records
            best_result = result

    if best_earnings is None:
        raise ValueError(f"Could not generate earnings history for PIA ${target_pia:,.2f}")

    return best_earnings, best_result


def reverse_calculate_aime(target_pia: float, bend_points: List[int]) -> float:
    """
    Reverse-engineer AIME from target PIA using bend point formula.
    This is an approximation to help with initial search.
    """
    # Bend point formula:
    # PIA = 0.90 * min(AIME, BP1) + 0.32 * min(max(AIME - BP1, 0), BP2 - BP1) + 0.15 * max(AIME - BP2, 0)

    bp1, bp2 = bend_points[0], bend_points[1]

    # First bracket only (up to $1,174)
    first_bracket_pia = bp1 * 0.90

    if target_pia <= first_bracket_pia:
        # All in first bracket
        return target_pia / 0.90

    # Second bracket ($1,174 to $7,078)
    second_bracket_pia = (bp2 - bp1) * 0.32

    if target_pia <= first_bracket_pia + second_bracket_pia:
        # In first and second bracket
        remaining = target_pia - first_bracket_pia
        return bp1 + (remaining / 0.32)

    # Third bracket (above $7,078)
    remaining = target_pia - first_bracket_pia - second_bracket_pia
    return bp2 + (remaining / 0.15)


def print_earnings_history(earnings: List[EarningsRecord], result: Dict):
    """Print the generated earnings history in readable format."""

    print(f"\n{'='*60}")
    print(f"Generated Earnings History")
    print(f"{'='*60}\n")

    # Group by decade for readability
    decades = {}
    for record in earnings:
        decade = (record.year // 10) * 10
        if decade not in decades:
            decades[decade] = []
        decades[decade].append(record)

    total_earnings = 0
    for decade in sorted(decades.keys()):
        print(f"{decade}s:")
        for record in decades[decade]:
            print(f"  {record.year}: ${record.earnings:>12,.2f}")
            total_earnings += record.earnings
        decade_total = sum(r.earnings for r in decades[decade])
        print(f"  Decade Total: ${decade_total:>12,.2f}\n")

    print(f"{'='*60}")
    print(f"Total Career Earnings: ${total_earnings:,.2f}")
    print(f"{'='*60}\n")

    # Calculation summary
    print(f"\n{'='*60}")
    print(f"PIA Calculation Results")
    print(f"{'='*60}")
    print(f"AIME: ${result['aime']:,.2f}/month")
    print(f"PIA: ${result['pia']:,.2f}/month")
    print(f"Annual Benefit at FRA: ${result['pia'] * 12:,.2f}")
    print(f"Years in Top 35: {len(result['top_35_years'])}")
    print(f"Zero Years: {result['years_of_zero_in_top_35']}")
    print(f"\nBend Point Breakdown:")
    print(f"  First bracket (90%):  ${result['calculation_details']['first_bracket']:>8,.2f}")
    print(f"  Second bracket (32%): ${result['calculation_details']['second_bracket']:>8,.2f}")
    print(f"  Third bracket (15%):  ${result['calculation_details']['third_bracket']:>8,.2f}")
    print(f"  {'─'*40}")
    print(f"  Total PIA:            ${result['pia']:>8,.2f}")
    print(f"{'='*60}\n")


def export_as_json(earnings: List[EarningsRecord], result: Dict, filename: str):
    """Export earnings history as JSON for use in testing."""
    import json

    data = {
        "birth_year": result.get('pia_year', 2022) - 62,
        "target_pia": result['pia'],
        "actual_aime": result['aime'],
        "earnings_history": [
            {
                "year": r.year,
                "earnings": r.earnings,
                "is_projected": r.is_projected
            }
            for r in earnings
        ],
        "calculation_result": result
    }

    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"✓ Exported to {filename}")


def export_as_xml(
    earnings: List[EarningsRecord],
    filename: str,
    birth_year: int,
    estimated_pia: float,
    statement_date: str,
    name: str = "Sample Earner",
    ssn: str = "000-00-0000",
):
    """Write a pro forma SSA statement the existing parser already accepts."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<SSAStatement>",
        f"    <StatementDate>{statement_date}</StatementDate>",
        "    <PersonInfo>",
        f"        <Name>{name}</Name>",
        f"        <SSN>{ssn}</SSN>",
        f"        <BirthDate>{birth_year}-06-15</BirthDate>",
        f"        <EstimatedPIA>{int(round(estimated_pia))}</EstimatedPIA>",
        "    </PersonInfo>",
        "    <EarningsHistory>",
    ]
    for record in earnings:
        if record.is_projected:
            continue
        lines.extend([
            "        <EarningsRecord>",
            f"            <Year>{record.year}</Year>",
            f"            <Earnings>{int(round(record.earnings))}</Earnings>",
            "        </EarningsRecord>",
        ])
    lines.extend([
        "    </EarningsHistory>",
        "</SSAStatement>",
        "",
    ])
    with open(filename, "w") as f:
        f.write("\n".join(lines))
    print(f"✓ Exported XML to {filename}")


def export_as_csv(earnings: List[EarningsRecord], filename: str):
    """Export earnings history as CSV for spreadsheet use."""
    import csv

    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Year', 'Earnings'])
        for record in earnings:
            writer.writerow([record.year, f"{record.earnings:.2f}"])

    print(f"✓ Exported to {filename}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate pro forma earnings history for a target PIA"
    )
    parser.add_argument(
        '--birth-year',
        type=int,
        required=True,
        help='Birth year (e.g., 1960)'
    )
    parser.add_argument(
        '--target-pia',
        type=float,
        required=True,
        help='Target PIA in dollars (e.g., 2500)'
    )
    parser.add_argument(
        '--pattern',
        choices=['steady', 'increasing', 'peak_mid', 'lumpy'],
        default='steady',
        help='Career earnings pattern'
    )
    parser.add_argument(
        '--years',
        type=int,
        default=35,
        help='Number of working years (default: 35)'
    )
    parser.add_argument(
        '--zero-years',
        type=int,
        default=3,
        help='Number of zero-earning years to include for realism (default: 3)'
    )
    parser.add_argument(
        '--export-json',
        type=str,
        help='Export to JSON file (e.g., profile_2500.json)'
    )
    parser.add_argument(
        '--export-csv',
        type=str,
        help='Export to CSV file (e.g., earnings_2500.csv)'
    )
    parser.add_argument(
        '--export-xml',
        type=str,
        help='Export a pro forma SSA XML file the app can upload'
    )
    parser.add_argument(
        '--statement-date',
        type=str,
        default=None,
        help='StatementDate for XML export (YYYY-MM-DD). Default: today.'
    )
    parser.add_argument(
        '--name',
        type=str,
        default='Sample Earner',
        help='Name written into the XML PersonInfo block'
    )

    args = parser.parse_args()

    # Generate earnings profile
    earnings, result = generate_earnings_profile(
        birth_year=args.birth_year,
        target_pia=args.target_pia,
        career_pattern=args.pattern,
        working_years=args.years,
        zero_years=args.zero_years
    )

    # Print results
    print_earnings_history(earnings, result)

    # Export if requested
    if args.export_json:
        export_as_json(earnings, result, args.export_json)

    if args.export_csv:
        export_as_csv(earnings, args.export_csv)

    if args.export_xml:
        from datetime import date as date_cls
        export_as_xml(
            earnings,
            args.export_xml,
            birth_year=args.birth_year,
            estimated_pia=result["pia"],
            statement_date=args.statement_date or date_cls.today().isoformat(),
            name=args.name,
        )

    print("\n✓ Pro forma earnings profile generated successfully!")
    print(f"\nTo use this profile in your app:")
    print(f"  1. Birth year: {args.birth_year}")
    print(f"  2. PIA: ${result['pia']:,.2f}")
    print(f"  3. Import earnings from {'JSON' if args.export_json else 'CSV' if args.export_csv else 'output above'}")
