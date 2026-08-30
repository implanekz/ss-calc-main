"""
Phase 0: cap-then-index, AWI fallback, and the 1991 unit-mismatch regression.

SSA caps *nominal* taxed earnings, then indexes what's left. Comparing an
indexed amount to that year's nominal taxable maximum systematically
understates PIA. See docs/DATA-LINEAGE.md §1.
"""

from backend.core.ssa_xml_processor import SSAXMLProcessor, EarningsRecord


def _row_for_year(indexed, year):
    matches = [row for row in indexed if row["year"] == year]
    assert matches, f"no indexed row for {year}"
    return matches[0]


class TestCapThenIndex:
    def test_1991_half_cap_is_not_chopped_after_indexing(self):
        """
        DATA-LINEAGE example: 1991 nominal $24,024 indexes to ~$76,927 against
        the 2024 AWI. The 1991 taxable maximum is $53,400. Cap-after-index
        chops this year and flags it capped even though the person earned less
        than half the ceiling.
        """
        processor = SSAXMLProcessor(birth_year=1964)  # indexes to 2024
        processor.earnings_history = [
            EarningsRecord(year=1991, earnings=24024, is_zero=False),
        ]

        indexed = processor.calculate_indexed_earnings()
        row = _row_for_year(indexed, 1991)

        awi_1991 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[1991]
        awi_2024 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[2024]
        expected = round(24024 * (awi_2024 / awi_1991), 2)

        assert row["is_capped"] is False
        assert row["indexed_earnings"] == expected
        assert expected > SSAXMLProcessor.TAXABLE_MAXIMUM[1991]

    def test_nominal_max_earner_is_capped_then_indexed(self):
        """
        A high earner who actually hit the 1991 taxable maximum must stay
        flagged capped, and the indexed amount must be max * factor — not
        chopped back to the nominal ceiling.
        """
        processor = SSAXMLProcessor(birth_year=1964)
        max_1991 = SSAXMLProcessor.TAXABLE_MAXIMUM[1991]
        processor.earnings_history = [
            EarningsRecord(year=1991, earnings=max_1991, is_zero=False),
        ]

        row = _row_for_year(processor.calculate_indexed_earnings(), 1991)
        awi_1991 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[1991]
        awi_2024 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[2024]
        expected = round(max_1991 * (awi_2024 / awi_1991), 2)

        assert row["is_capped"] is True
        assert row["original_earnings"] == max_1991
        assert row["indexed_earnings"] == expected
        assert expected > max_1991

    def test_edited_row_above_nominal_cap_is_cut_before_index(self):
        """Pasted / edited rows can exceed the SSA ceiling; cap the nominal first."""
        processor = SSAXMLProcessor(birth_year=1964)
        max_1991 = SSAXMLProcessor.TAXABLE_MAXIMUM[1991]
        processor.earnings_history = [
            EarningsRecord(year=1991, earnings=max_1991 * 2, is_zero=False),
        ]

        row = _row_for_year(processor.calculate_indexed_earnings(), 1991)
        awi_1991 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[1991]
        awi_2024 = SSAXMLProcessor.AVERAGE_WAGE_INDEX[2024]
        expected = round(max_1991 * (awi_2024 / awi_1991), 2)

        assert row["is_capped"] is True
        assert row["indexed_earnings"] == expected


class TestAwiFallback:
    def test_missing_indexing_year_sets_awi_approximated(self):
        """
        Born 1966 indexes to 2026; AWI for 2026 is not published yet.
        Use the latest AWI but tell the caller it is an approximation.
        """
        processor = SSAXMLProcessor(birth_year=1966)
        processor.earnings_history = [
            EarningsRecord(year=1991, earnings=24024, is_zero=False),
        ]

        indexed = processor.calculate_indexed_earnings()
        assert processor.awi_approximated is True
        result = processor.calculate_aime_and_pia()
        assert result["awi_approximated"] is True
        assert indexed  # still produces rows

    def test_known_indexing_year_is_not_approximated(self):
        processor = SSAXMLProcessor(birth_year=1964)
        processor.earnings_history = [
            EarningsRecord(year=1991, earnings=24024, is_zero=False),
        ]

        processor.calculate_indexed_earnings()
        assert processor.awi_approximated is False
        result = processor.calculate_aime_and_pia()
        assert result["awi_approximated"] is False


class TestInRangeCareer:
    def test_thirty_five_year_career_born_1966_computes_pia(self):
        """Realistic 58+ audience fixture: 39 years, born 1966."""
        processor = SSAXMLProcessor(birth_year=1966)
        processor.earnings_history = [
            EarningsRecord(
                year=year,
                earnings=55000 * (1.03 ** (year - 1987)),
                is_zero=False,
            )
            for year in range(1987, 2026)
        ]

        result = processor.calculate_aime_and_pia()
        assert result["pia"] > 0
        assert result["aime"] > 0
        assert len(result["top_35_years"]) <= 35
