"""
SSA XML File Processor & PIA Impact Analyzer
Processes SSA earnings history XML files and calculates AIME/PIA impact
"""

import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple, Optional
from datetime import date, datetime
from dataclasses import dataclass

@dataclass
class EarningsRecord:
    """Individual year earnings record"""
    year: int
    earnings: float
    is_zero: bool
    is_projected: bool = False  # For future years user might add
    
class SSAXMLProcessor:
    """Processes SSA XML files and calculates AIME/PIA"""
    
    # PIA bend points by year of eligibility (year worker attains 62, becomes
    # disabled before 62, or dies before 62).
    # Source: https://www.ssa.gov/oact/cola/bendpoints.html (verified 2026-08-13)
    PIA_BEND_POINTS_BY_YEAR = {
        2026: [1286, 7749],
        2025: [1226, 7391],
        2024: [1174, 7078],
        2023: [1115, 6721],
        2022: [1024, 6172],
        2021: [996, 6002],
        2020: [960, 5785],
    }
    PIA_FACTORS = [0.90, 0.32, 0.15]  # 90%, 32%, 15% factors (constant)

    # Retirement & survivor family maximum bend points, by year of eligibility.
    # Applied as 150% / 272% / 134% / 175% of the PIA portions they delimit.
    # Source: https://www.ssa.gov/oact/cola/familymax.html (verified 2026-08-13)
    # NOTE: the disability (DI) family maximum uses a different formula entirely
    # (85% of AIME, floored at PIA, capped at 150% of PIA) and is not in this table.
    FAMILY_MAX_BEND_POINTS_BY_YEAR = {
        2026: [1643, 2371, 3093],
        2025: [1567, 2262, 2950],
        2024: [1500, 2166, 2825],
        2023: [1425, 2056, 2682],
        2022: [1308, 1889, 2463],
        2021: [1272, 1837, 2395],
        2020: [1226, 1770, 2309],
    }
    FAMILY_MAX_FACTORS = [1.50, 2.72, 1.34, 1.75]
    
    # Maximum taxable earnings by year (complete SSA data)
    TAXABLE_MAXIMUM = {
        2026: 184500,
        2025: 176100, 2024: 168600, 2023: 160200, 2022: 147000, 2021: 142800,
        2020: 137700, 2019: 132900, 2018: 128400, 2017: 127200, 2016: 118500,
        2015: 118500, 2014: 117000, 2013: 113700, 2012: 110100, 2011: 106800,
        2010: 106800, 2009: 106800, 2008: 102000, 2007: 97500, 2006: 94200,
        2005: 90000, 2004: 87900, 2003: 87000, 2002: 84900, 2001: 80400,
        2000: 76200, 1999: 72600, 1998: 68400, 1997: 65400, 1996: 62700,
        1995: 61200, 1994: 60600, 1993: 57600, 1992: 55500, 1991: 53400,
        1990: 51300, 1989: 48000, 1988: 45000, 1987: 43800, 1986: 42000,
        1985: 39600, 1984: 37800, 1983: 35700, 1982: 32400, 1981: 29700,
        1980: 25900, 1979: 22900, 1978: 17700, 1977: 16500, 1976: 15300,
        1975: 14100, 1974: 13200, 1973: 10800, 1972: 9000, 1971: 7800,
        1970: 7800, 1969: 7800, 1968: 7800, 1967: 6600, 1966: 6600,
    }

    # Average Wage Index for indexing historical earnings (official SSA AWI).
    # Source: https://www.ssa.gov/oact/cola/awiseries.html (verified 2026-08-13)
    # AWI for year N is not published until the fall of year N+1, so the most
    # recent available value here lags the current year by two.
    AVERAGE_WAGE_INDEX = {
        2024: 69846.57, 2023: 66621.80, 2022: 63795.13, 2021: 60575.07,
        2020: 55628.60, 2019: 54099.99, 2018: 52145.80, 2017: 50321.89,
        2016: 48642.15, 2015: 48098.63, 2014: 46481.52, 2013: 44888.16,
        2012: 44321.67, 2011: 42979.61, 2010: 41673.83, 2009: 40711.61,
        2008: 41334.97, 2007: 40405.48, 2006: 38651.41, 2005: 36952.94,
        2004: 35648.55, 2003: 34064.95, 2002: 33252.09, 2001: 32921.92,
        2000: 32154.82, 1999: 30469.84, 1998: 28861.44, 1997: 27426.00,
        1996: 25913.90, 1995: 24705.66, 1994: 23753.53, 1993: 23132.67,
        1992: 22935.42, 1991: 21811.60, 1990: 21027.98, 1989: 20099.55,
        1988: 19334.04, 1987: 18426.51, 1986: 17321.82, 1985: 16822.51,
        1984: 16135.07, 1983: 15239.24, 1982: 14531.34, 1981: 13773.10,
        1980: 12513.46, 1979: 11479.46, 1978: 10556.03, 1977: 9779.44,
    }
    
    def __init__(self, birth_year: Optional[int] = None, statement_date: Optional[date] = None):
        self.earnings_history = []
        self.indexed_earnings = []
        self.top_35_years = []
        self.current_aime = 0
        self.current_pia = 0
        self.birth_year = birth_year
        # Store when the XML statement was generated (critical for AWI accuracy)
        self.statement_date = statement_date or date.today()
        # Calculate indexing year (year person turns 60)
        self.indexing_year = birth_year + 60 if birth_year else datetime.now().year - 2
        # True when AWI for the indexing year is unpublished and we used the latest
        self.awi_approximated = False
        
    def parse_ssa_xml(self, xml_content: str) -> Dict:
        """
        Parse SSA XML file and extract earnings history
        Note: Actual SSA XML structure may vary - this is a template
        """
        try:
            root = ET.fromstring(xml_content)

            # Extract statement date (critical for AWI accuracy!)
            statement_date_str = self._safe_find_text(root, './/StatementDate', None)
            if not statement_date_str:
                # Try alternative XML paths
                statement_date_str = self._safe_find_text(root, './/AsOfDate', None)
            if not statement_date_str:
                statement_date_str = self._safe_find_text(root, './/DateGenerated', None)

            if statement_date_str:
                try:
                    self.statement_date = datetime.strptime(statement_date_str, '%Y-%m-%d').date()
                except ValueError:
                    # Try alternative date formats
                    try:
                        self.statement_date = datetime.strptime(statement_date_str, '%m/%d/%Y').date()
                    except ValueError:
                        self.statement_date = date.today()

            # Extract basic info (structure depends on actual SSA XML format)
            self.person_info = {
                'name': self._safe_find_text(root, './/Name', 'Unknown'),
                'ssn': self._safe_find_text(root, './/SSN', 'XXX-XX-XXXX'),
                'birth_date': self._safe_find_text(root, './/BirthDate', '1900-01-01'),
                'estimated_pia': self._safe_find_text(root, './/EstimatedPIA', '0'),
                'statement_date': self.statement_date.strftime('%Y-%m-%d')
            }

            # Extract earnings history - support multiple XML formats
            earnings_history = []
            
            # Format 1: SSA nested structure with EarningsRecord elements
            earnings_elements = root.findall('.//EarningsRecord')
            
            if earnings_elements:
                # SSA format: <EarningsRecord><Year>1997</Year><Earnings>30000</Earnings></EarningsRecord>
                print(f"DEBUG: Found {len(earnings_elements)} EarningsRecord elements (SSA format)")
                for record in earnings_elements:
                    year_text = self._safe_find_text(record, 'Year', '0')
                    earnings_text = self._safe_find_text(record, 'Earnings', '0')
                    
                    print(f"DEBUG: SSA format - Year: {year_text}, Earnings: {earnings_text}")
                    
                    year = int(year_text)
                    earnings = float(earnings_text)
                    
                    if year > 0:
                        earnings_history.append(EarningsRecord(
                            year=year,
                            earnings=earnings,
                            is_zero=(earnings == 0)
                        ))
            else:
                # Format 2: Attribute-based format with Year elements
                year_elements = root.findall('.//Year')
                
                if year_elements:
                    # Attribute format: <Year year="1997" amount="30000"/>
                    print(f"DEBUG: Found {len(year_elements)} Year elements (attribute format)")
                    for year_elem in year_elements:
                        year_text = year_elem.get('year', '0')
                        earnings_text = year_elem.get('amount', '0')
                        
                        print(f"DEBUG: Attribute format - Year: {year_text}, Amount: {earnings_text}")
                        
                        year = int(year_text)
                        earnings = float(earnings_text)
                        
                        if year > 0:
                            earnings_history.append(EarningsRecord(
                                year=year,
                                earnings=earnings,
                                is_zero=(earnings == 0)
                            ))
            
            print(f"DEBUG: Total earnings records created: {len(earnings_history)}")
            
            # Validate that we got some earnings
            if not earnings_history:
                print("ERROR: No earnings history loaded!")
                print(f"DEBUG: Root tag: {root.tag}")
                print(f"DEBUG: XML content preview: {xml_content[:500]}")
                raise ValueError("No earnings history found in XML file. Please check XML format.")
            
            # Sort by year
            earnings_history.sort(key=lambda x: x.year)
            self.earnings_history = earnings_history

            return {
                'person_info': self.person_info,
                'total_years': len(earnings_history),
                'earnings_count': len(earnings_history),
                'zero_years': sum(1 for e in earnings_history if e.is_zero),
                'highest_year': max(e.earnings for e in earnings_history) if earnings_history else 0,
                'years_covered': f"{min(e.year for e in earnings_history)}-{max(e.year for e in earnings_history)}" if earnings_history else "None"
            }
            
        except ET.ParseError as e:
            raise ValueError(f"Invalid XML format: {str(e)}")
        except Exception as e:
            raise ValueError(f"Error processing XML: {str(e)}")
    
    def _safe_find_text(self, element, path: str, default: str) -> str:
        """Safely extract text from XML element"""
        found = element.find(path)
        return found.text if found is not None and found.text else default
    
    def calculate_indexed_earnings(self, indexing_year: Optional[int] = None) -> List[Dict]:
        """
        Calculate indexed earnings using SSA wage indexing formula
        Earnings are indexed to the year the person turns 60
        """
        if not self.earnings_history:
            raise ValueError("No earnings history loaded")

        # Use provided indexing_year, or instance's indexing_year, or default
        if indexing_year is None:
            indexing_year = self.indexing_year

        indexed_earnings = []
        indexing_awi = self.AVERAGE_WAGE_INDEX.get(indexing_year)
        self.awi_approximated = indexing_awi is None

        if not indexing_awi:
            # AWI for year N is published in the fall of N+1. Use the latest
            # published value and surface the approximation to the caller.
            indexing_awi = max(self.AVERAGE_WAGE_INDEX.values())

        for record in self.earnings_history:
            # Cap nominal (taxed) earnings first. Indexed dollars are a different
            # unit and must never be compared to that year's taxable maximum.
            if record.year in self.TAXABLE_MAXIMUM:
                max_earnings = self.TAXABLE_MAXIMUM[record.year]
            else:
                latest_year = max(self.TAXABLE_MAXIMUM.keys())
                max_earnings = self.TAXABLE_MAXIMUM[latest_year]
            is_capped = record.earnings >= max_earnings
            capped_nominal = min(record.earnings, max_earnings)

            # Don't index earnings at age 60 or later (use actual amounts)
            if record.year >= indexing_year:
                indexed_amount = capped_nominal
                indexing_factor = 1.0
            else:
                year_awi = self.AVERAGE_WAGE_INDEX.get(record.year)
                if year_awi and year_awi > 0:
                    indexing_factor = indexing_awi / year_awi
                    indexed_amount = capped_nominal * indexing_factor
                else:
                    # If AWI not available for that year, don't index
                    indexed_amount = capped_nominal
                    indexing_factor = 1.0

            indexed_earnings.append({
                'year': record.year,
                'original_earnings': record.earnings,
                'indexed_earnings': round(indexed_amount, 2),
                'indexing_factor': round(indexing_factor, 4),
                'is_zero': record.is_zero,
                'is_capped': is_capped,
                'max_taxable': max_earnings
            })

        self.indexed_earnings = indexed_earnings
        return indexed_earnings

    def _calculate_pia_structure(self, aime, pia, pia_year, bend_points, b1, b2, b3):
        """Helper to format PIA response structure"""
        return {
            'aime': self.current_aime,
            'pia': self.current_pia,
            'pia_year': pia_year,
            'bend_points_used': bend_points,
            'top_35_years': [y for y in self.top_35_years if y['year'] is not None],
            'years_of_zero_in_top_35': sum(1 for year in self.top_35_years if year['is_zero']),
            'lowest_year_in_top_35': min((year['indexed_earnings'] for year in self.top_35_years), default=0),
            'highest_year_in_top_35': max((year['indexed_earnings'] for year in self.top_35_years), default=0),
            'calculation_details': {
                'first_bracket': round(b1, 2),
                'second_bracket': round(b2, 2),
                'third_bracket': round(b3, 2),
                'total_pia': round(pia, 2)
            },
            'awi_approximated': self.awi_approximated
        }

    def _calculate_pia_components(self, aime: float, year: int) -> Tuple[float, List[int], float, float, float]:
        """Core PIA formula logic"""
        # Get bend points
        bend_points = self.PIA_BEND_POINTS_BY_YEAR.get(year)
        if not bend_points:
            latest_year = max(self.PIA_BEND_POINTS_BY_YEAR.keys())
            bend_points = self.PIA_BEND_POINTS_BY_YEAR[latest_year]

        pia = 0
        remaining_aime = aime

        # First bracket (90%)
        first_bracket_amount = min(remaining_aime, bend_points[0])
        first_bracket_pia = first_bracket_amount * self.PIA_FACTORS[0]
        pia += first_bracket_pia
        remaining_aime -= first_bracket_amount

        # Second bracket (32%)
        second_bracket_amount = min(remaining_aime, bend_points[1] - bend_points[0])
        second_bracket_pia = max(0, second_bracket_amount * self.PIA_FACTORS[1])
        pia += second_bracket_pia
        remaining_aime -= second_bracket_amount

        # Third bracket (15%)
        # Fix: remaining_aime could be negative if aime < bend_points[0] (handled by min above but good to be safe)
        third_bracket_pia = max(0, remaining_aime * self.PIA_FACTORS[2])
        pia += third_bracket_pia

        return pia, bend_points, first_bracket_pia, second_bracket_pia, third_bracket_pia

    def calculate_disability_pia(self, onset_date: date) -> Dict:
        """
        Calculate PIA using Disability rules (Freeze, custom computation years)
        """
        if not self.birth_year:
             raise ValueError("Birth year required for disability calculation")

        # 1. Eligibility Year = Onset Year
        eligibility_year = onset_date.year
        
        # 2. Indexing Year = Eligibility Year - 2
        indexing_year = eligibility_year - 2
        
        # Re-index earnings based on disability timeline
        self.calculate_indexed_earnings(indexing_year=indexing_year)
        
        # 3. Computation Years Logic
        # Elapsed years = years from age 22 to year BEFORE onset (or year of onset? usually onset year - 22)
        # Technically: Years from year attaining 22 through year before onset.
        # Example: Born 1980. Turn 22 in 2002. Onset 2024.
        # Elapsed = 2024 - 2002 = 22 years.
        year_turn_22 = self.birth_year + 22
        elapsed_years = max(0, onset_date.year - year_turn_22)
        
        # Dropout years = elapsed / 5 (max 5)
        # Disability allows up to 5 dropouts usually.
        dropout_years = min(5, elapsed_years // 5)
        
        # Computation years (min 2)
        computation_years = max(2, elapsed_years - dropout_years)
        
        # 4. Selection (The Freeze)
        # Exclude years wholly within period of disability (future years from onset)
        # We limit selection to years BEFORE onset year? 
        # Typically earnings in onset year are counted if they raise the average, but for simplicity/freeze projection 
        # we often look at prior record. However, standard practice is to use all indexed earnings up to onset.
        valid_earnings = [e for e in self.indexed_earnings if e['year'] < onset_date.year]
        
        sorted_earnings = sorted(valid_earnings, key=lambda x: x['indexed_earnings'], reverse=True)
        top_years = sorted_earnings[:computation_years]
        
        # 5. AIME Calculation
        total_indexed = sum(y['indexed_earnings'] for y in top_years)
        # Divisor is computation years * 12 used for benefit calc
        # Note: Regular retirement uses fixed 35 years (420 months). Disability uses actual computation years.
        divisor_months = computation_years * 12
        if divisor_months == 0: divisor_months = 12 # Safety
        
        aime = total_indexed / divisor_months
        self.current_aime = round(aime, 2)
        
        # 6. PIA Calculation
        pia, bend_points, b1, b2, b3 = self._calculate_pia_components(aime, eligibility_year)
        self.current_pia = round(pia, 2)
        
        # Store for display
        self.top_35_years = top_years # Technically top N years
        
        return self._calculate_pia_structure(aime, pia, eligibility_year, bend_points, b1, b2, b3)

    def calculate_aime_and_pia(self, pia_year: Optional[int] = None) -> Dict:
        """
        Calculate AIME (Average Indexed Monthly Earnings) and PIA (Primary Insurance Amount)
        Standard Retirement Method (Top 35 Years)
        """
        if not self.indexed_earnings:
            self.calculate_indexed_earnings()

        # Determine PIA calculation year (year person turns 62, or current year)
        if pia_year is None:
            pia_year = self.birth_year + 62 if self.birth_year else datetime.now().year

        # Get top 35 years
        sorted_earnings = sorted(self.indexed_earnings, key=lambda x: x['indexed_earnings'], reverse=True)
        self.top_35_years = sorted_earnings[:35]
        
        # Pad with zeros
        while len(self.top_35_years) < 35:
            self.top_35_years.append({
                'year': None, 'original_earnings': 0, 'indexed_earnings': 0, 
                'indexing_factor': 0, 'is_zero': True, 'is_capped': False, 'max_taxable': 0
            })

        # Calculate AIME (Fixed 35 years)
        total_indexed_earnings = sum(year['indexed_earnings'] for year in self.top_35_years)
        aime = total_indexed_earnings / (35 * 12)
        self.current_aime = round(aime, 2)

        # Calculate PIA
        pia, bend_points, b1, b2, b3 = self._calculate_pia_components(aime, pia_year)
        self.current_pia = round(pia, 2)

        return self._calculate_pia_structure(aime, pia, pia_year, bend_points, b1, b2, b3)
    
    def create_editable_spreadsheet(self) -> List[Dict]:
        """
        Create user-friendly spreadsheet data for editing.

        Future years are PROJECTED the way SSA's own statement projection works:
        the most recent known (non-zero) earnings amount is carried forward. They
        used to be padded with $0, which quietly broke every downstream
        "what if you keep working until age N?" comparison — zeroing a year that
        is already $0 changes nothing, so every work-stop age produced an
        identical PIA. Historical gaps inside the record stay $0, because those
        are genuine zero-earnings years.
        """
        if not self.earnings_history:
            raise ValueError("No earnings history to create spreadsheet")

        spreadsheet_data = []

        current_year = datetime.now().year

        # Fill in all years from first earnings year to current
        start_year = min(record.year for record in self.earnings_history)
        end_year = max(max(record.year for record in self.earnings_history), current_year)

        # Create lookup for existing earnings
        earnings_lookup = {record.year: record.earnings for record in self.earnings_history}

        # The amount carried forward: the most recent year that actually has
        # earnings. Zero if the record has no earnings at all.
        years_with_earnings = [year for year, amount in earnings_lookup.items() if amount > 0]
        last_known_earnings = earnings_lookup[max(years_with_earnings)] if years_with_earnings else 0

        for year in range(start_year, end_year + 5):  # Add 5 future years for planning
            recorded = earnings_lookup.get(year, 0)
            is_future = year > current_year
            is_carried_forward = is_future and recorded == 0 and last_known_earnings > 0
            earnings = last_known_earnings if is_carried_forward else recorded

            if is_carried_forward:
                notes = 'Projected — your most recent earnings carried forward'
            elif is_future:
                notes = 'Future projection'
            elif earnings == 0:
                notes = 'Zero earnings year'
            else:
                notes = ''

            spreadsheet_data.append({
                'year': year,
                'earnings': earnings,
                'is_zero': earnings == 0,
                'is_future_projection': is_future,
                'is_projected': is_future,
                'is_editable': True,
                'notes': notes,
                'max_taxable': self.TAXABLE_MAXIMUM.get(year, 200000),  # Use reasonable default for future years
                'source': 'ssa_xml' if not is_future else 'projected'
            })

        return spreadsheet_data

    def merge_with_new_xml(
        self,
        new_xml_content: str,
        preserve_future_projections: bool = True,
        preserve_manual_edits: bool = False
    ) -> Dict:
        """
        Smart merge when user uploads a newer XML file.

        Args:
            new_xml_content: The new XML file content
            preserve_future_projections: Keep user's custom future earnings projections
            preserve_manual_edits: Keep any manual edits to historical earnings

        Returns:
            Dict with merge details and recommendations
        """
        # Store current state
        old_earnings = {record.year: record for record in self.earnings_history}
        old_statement_date = self.statement_date

        # Parse new XML
        new_processor = SSAXMLProcessor(birth_year=self.birth_year)
        parse_result = new_processor.parse_ssa_xml(new_xml_content)
        new_earnings = {record.year: record for record in new_processor.earnings_history}
        new_statement_date = new_processor.statement_date

        # Check if new XML is actually newer
        if new_statement_date <= old_statement_date:
            return {
                'is_newer': False,
                'message': f'Uploaded XML ({new_statement_date}) is not newer than existing ({old_statement_date})',
                'recommendation': 'Keep existing data'
            }

        # Identify what changed
        statement_year = new_statement_date.year
        current_year = datetime.now().year

        changes = {
            'historical_updates': [],  # Years that exist in both but values changed
            'new_years': [],           # Years in new XML but not old
            'future_projections': [],  # User's custom projections
            'conflicts': []            # Manual edits that would be overwritten
        }

        # Analyze differences
        for year, new_record in new_earnings.items():
            if year in old_earnings:
                old_record = old_earnings[year]
                if old_record.earnings != new_record.earnings:
                    changes['historical_updates'].append({
                        'year': year,
                        'old_value': old_record.earnings,
                        'new_value': new_record.earnings,
                        'difference': new_record.earnings - old_record.earnings,
                        'is_manual_edit': old_record.is_projected  # User might have edited this
                    })
            else:
                changes['new_years'].append({
                    'year': year,
                    'value': new_record.earnings
                })

        # Identify user's future projections
        for year, old_record in old_earnings.items():
            if year > statement_year and old_record.is_projected and old_record.earnings > 0:
                changes['future_projections'].append({
                    'year': year,
                    'value': old_record.earnings
                })

        # Build merged earnings history
        merged_earnings = []

        for year in sorted(set(list(old_earnings.keys()) + list(new_earnings.keys()))):
            if preserve_future_projections and year > statement_year and year in old_earnings:
                # Keep user's projection
                merged_earnings.append(old_earnings[year])
            elif preserve_manual_edits and year in old_earnings and old_earnings[year].is_projected:
                # Keep manual edit
                merged_earnings.append(old_earnings[year])
            elif year in new_earnings:
                # Use new XML data
                merged_earnings.append(new_earnings[year])
            else:
                # Use old data (shouldn't happen often)
                merged_earnings.append(old_earnings[year])

        # Update self with merged data
        self.earnings_history = merged_earnings
        self.statement_date = new_statement_date

        return {
            'is_newer': True,
            'old_statement_date': old_statement_date.strftime('%Y-%m-%d'),
            'new_statement_date': new_statement_date.strftime('%Y-%m-%d'),
            'changes': changes,
            'merged_count': len(merged_earnings),
            'recommendations': [
                f"Updated {len(changes['historical_updates'])} historical earnings records",
                f"Added {len(changes['new_years'])} new earnings years",
                f"Preserved {len(changes['future_projections'])} future projections" if preserve_future_projections else "Removed future projections",
                "Consider recalculating PIA with updated AWI factors"
            ]
        }
    
    def calculate_what_if_scenario(self, modified_earnings: List[Dict]) -> Dict:
        """
        Calculate PIA impact from modified earnings
        """
        # Create temporary earnings history from modified data
        temp_earnings = []
        for entry in modified_earnings:
            record = EarningsRecord(
                year=entry['year'],
                earnings=entry['earnings'],
                is_zero=entry['earnings'] == 0,
                is_projected=entry.get('is_future_projection', False)
            )
            temp_earnings.append(record)
        
        # Store original data
        original_earnings = self.earnings_history
        original_indexed = self.indexed_earnings
        original_aime = self.current_aime
        original_pia = self.current_pia
        
        # Calculate with modified data
        self.earnings_history = temp_earnings
        self.indexed_earnings = []
        
        try:
            new_calculation = self.calculate_aime_and_pia()
            
            # Compare results
            comparison = {
                'original': {
                    'aime': original_aime,
                    'pia': original_pia
                },
                'modified': {
                    'aime': self.current_aime,
                    'pia': self.current_pia
                },
                'impact': {
                    'aime_change': round(self.current_aime - original_aime, 2),
                    'pia_change': round(self.current_pia - original_pia, 2),
                    'monthly_benefit_change': round(self.current_pia - original_pia, 2),
                    'annual_benefit_change': round((self.current_pia - original_pia) * 12, 2),
                    'lifetime_impact_25_years': round((self.current_pia - original_pia) * 12 * 25, 2)
                },
                'analysis': new_calculation
            }
            
        finally:
            # Restore original data
            self.earnings_history = original_earnings
            self.indexed_earnings = original_indexed
            self.current_aime = original_aime
            self.current_pia = original_pia
        
        return comparison


# Example usage and testing
if __name__ == "__main__":
    # Test with sample data for someone born in 1960 (turns 62 in 2022, 60 in 2020)
    processor = SSAXMLProcessor(birth_year=1960)

    # Create sample earnings history
    sample_earnings = [
        EarningsRecord(1980, 15000, False),
        EarningsRecord(1985, 25000, False),
        EarningsRecord(1990, 35000, False),
        EarningsRecord(1995, 45000, False),
        EarningsRecord(2000, 55000, False),
        EarningsRecord(2005, 65000, False),
        EarningsRecord(2010, 75000, False),
        EarningsRecord(2015, 85000, False),
        EarningsRecord(2020, 95000, False),
        EarningsRecord(2021, 100000, False),
        EarningsRecord(2022, 0, True),  # Retired at 62
        EarningsRecord(2023, 0, True),
        EarningsRecord(2024, 0, True),
        EarningsRecord(2025, 0, True),
    ]

    processor.earnings_history = sample_earnings

    print("=== SSA XML Processor Test ===")
    print(f"Birth year: 1960 (turns 60 in 2020, 62 in 2022)")
    print(f"Indexing year: {processor.indexing_year}")

    calculation = processor.calculate_aime_and_pia()
    print(f"\nAIME: ${calculation['aime']:,.2f}")
    print(f"PIA: ${calculation['pia']:,.2f}")
    print(f"PIA Year: {calculation['pia_year']}")
    print(f"Bend points used: ${calculation['bend_points_used'][0]}, ${calculation['bend_points_used'][1]}")
    print(f"Zero years in top 35: {calculation['years_of_zero_in_top_35']}")
    print(f"\nCalculation breakdown:")
    print(f"  First bracket (90%): ${calculation['calculation_details']['first_bracket']:,.2f}")
    print(f"  Second bracket (32%): ${calculation['calculation_details']['second_bracket']:,.2f}")
    print(f"  Third bracket (15%): ${calculation['calculation_details']['third_bracket']:,.2f}")

    # Test what-if scenario: continue working through age 67
    modified_data = []
    for record in sample_earnings:
        modified_data.append({
            'year': record.year,
            'earnings': record.earnings,
            'is_future_projection': False
        })

    # Add continued earnings 2022-2027 (ages 62-67)
    for year in range(2022, 2028):
        # Replace existing zero or add new
        existing_idx = next((i for i, r in enumerate(modified_data) if r['year'] == year), None)
        if existing_idx is not None:
            modified_data[existing_idx] = {
                'year': year,
                'earnings': 80000,  # Continue working at $80K/year
                'is_future_projection': True
            }
        else:
            modified_data.append({
                'year': year,
                'earnings': 80000,
                'is_future_projection': True
            })

    print("\n=== What-If Scenario: Work through age 67 at $80K/year ===")
    comparison = processor.calculate_what_if_scenario(modified_data)
    print(f"Original PIA: ${comparison['original']['pia']:,.2f}")
    print(f"Modified PIA: ${comparison['modified']['pia']:,.2f}")
    print(f"Monthly increase: ${comparison['impact']['pia_change']:,.2f}")
    print(f"Annual increase: ${comparison['impact']['annual_benefit_change']:,.2f}")
    print(f"25-year lifetime impact: ${comparison['impact']['lifetime_impact_25_years']:,.2f}")
