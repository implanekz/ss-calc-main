from datetime import date, datetime
from typing import Optional, List, Dict, Any
import logging
import os

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from core.ss_core_calculator import IndividualSSCalculator
from core.ssdi_calculator import SSDICalculator
from core.divorced_calculator import DivorcedSSCalculator
from core.widow_calculator import WidowSSCalculator
from core.ssa_xml_processor import SSAXMLProcessor, EarningsRecord

from api.calculation_models import (
    BCRRequest,
    BenefitBreakdown,
    CalculationResponse,
    DivorcedCalculationRequest,
    DivorcedCalculationResponse,
    EnhancedCalculationRequest,
    ManualPIACalculationRequest,
    MonthlyOptimizationRequest,
    MonthlyOptimizationResponse,
    PIACalculationResult,
    ScenarioComparison,
    SSDICalculationRequest,
    SSDICalculationResponse,
    WhatIfComparisonRequest,
    WhatIfComparisonResult,
    WidowCalculationRequest,
    WidowCalculationResponse,
    WorkStopLadderRequest,
    WorkStopLadderResult,
    WorkStopRung,
    XMLAnalysisRequest,
    XMLAnalysisResponse,
)


router = APIRouter(tags=["calculations"])
logger = logging.getLogger(__name__)

MAX_XML_UPLOAD_BYTES = 2 * 1024 * 1024
ALLOWED_XML_CONTENT_TYPES = {
    "application/xml",
    "text/xml",
    "application/octet-stream",
}

# Global session storage (use proper session management in production)
user_sessions = {}


@router.post("/generate-bcr")
async def generate_bcr_endpoint(request: BCRRequest):
    """
    Generate a bar chart race video from the provided data.
    """
    try:
        df = generate_bcr_data(
            birth_date=request.birth_date,
            pia=request.pia,
            longevity_age=request.longevity_age,
            inflation_rate=request.inflation_rate
        )
        
        output_path = f"/tmp/ss_leaderboard_{datetime.now().timestamp()}.mp4"
        
        bar_chart_race(
            df,
            out_path=output_path,
            title="Social Security: Cumulative Benefits by Filing Age",
            n_bars=6,
            fps=24,
            interval_ms=120,
            value_prefix="$"
        )
        
        return FileResponse(output_path, media_type="video/mp4", filename=os.path.basename(output_path))

    except Exception as e:
        logger.error(f"BCR generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"BCR generation failed: {str(e)}")


@router.post("/upload-ssa-xml", response_model=XMLAnalysisResponse)
async def upload_ssa_xml(
    file: UploadFile = File(...),
    birth_date: Optional[date] = Form(None),
    calculation_method: str = Form("retirement"), # "retirement" or "disability"
    disability_onset_date: Optional[date] = Form(None)
):
    """
    Upload SSA XML file and analyze earnings impact on PIA
    This is the core of the PIA Impact Analyzer
    """
    if file.content_type not in ALLOWED_XML_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="SSA upload must be an XML file")

    content = await file.read()
    if len(content) > MAX_XML_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="SSA XML upload exceeds 2 MB limit")

    if not file.filename.endswith('.xml'):
        raise HTTPException(status_code=400, detail="File must be XML format")
    
    try:
        # Read and process XML
        xml_content = content.decode('utf-8')
        
        processor = SSAXMLProcessor()
        parse_result = processor.parse_ssa_xml(xml_content)
        
        # Extract birth date from XML if not provided
        if not birth_date:
            birth_date_str = processor.person_info.get('birth_date', '1960-01-01')
            birth_date = datetime.strptime(birth_date_str, '%Y-%m-%d').date()

        # Set birth year for wage indexing
        processor.birth_year = birth_date.year

        # Calculate PIA based on method
        if calculation_method == "disability" and disability_onset_date:
            logger.info(f"Calculating Disability PIA with onset {disability_onset_date}")
            pia_calculation = processor.calculate_disability_pia(disability_onset_date)
        else:
            pia_calculation = processor.calculate_aime_and_pia()
            
        original_pia = pia_calculation.get('pia', 0)

        # Create editable spreadsheet
        spreadsheet = processor.create_editable_spreadsheet()

        # Generate simple recommendations
        recommendations = []
        zero_years = sum(1 for e in processor.earnings_history if e.earnings == 0)
        if zero_years > 0:
            recommendations.append(f"You have {zero_years} years with $0 earnings. Working additional years could replace these zeros and increase your PIA.")
        if len(processor.earnings_history) < 35:
            recommendations.append(f"You have {len(processor.earnings_history)} years of earnings. Working to 35 years maximizes your benefit calculation.")
        
        # Store in session
        session_id = f"user_{datetime.now().timestamp()}"
        user_sessions[session_id] = {
            'processor': processor,
            'birth_date': birth_date
        }
        
        return XMLAnalysisResponse(
            success=True,
            person_info=processor.person_info,
            earnings_summary=parse_result,
            original_pia=original_pia,
            spreadsheet_data=spreadsheet,
            optimization_recommendations=recommendations
        )
        
    except Exception as e:
        logger.error(f"XML processing error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing XML: {str(e)}")

@router.post("/analyze-earnings-changes")
async def analyze_earnings_changes(request: XMLAnalysisRequest):
    """
    Analyze impact of modified earnings on PIA
    Shows the power of replacing zero years or adding high-earning years
    """
    # In production, use proper session management
    if not user_sessions:
        raise HTTPException(status_code=400, detail="No XML file uploaded. Please upload SSA XML first.")
    
    # Get the most recent session (in production, use proper session ID)
    session = list(user_sessions.values())[-1]
    processor = session['processor']
    original_calculator = session['calculator']
    
    try:
        if request.modified_earnings:
            # Create new earnings history from modifications
            modified_earnings = []
            for entry in request.modified_earnings:
                record = EarningsRecord(
                    year=entry['year'],
                    earnings=entry['earnings'],
                    is_zero=entry['earnings'] == 0,
                    is_projected=entry.get('is_future_projection', False)
                )
                modified_earnings.append(record)
            
            # Create new calculator with modified earnings
            modified_calculator = IndividualSSCalculator(request.birth_date, earnings_history=modified_earnings)
            modified_pia = modified_calculator.calculate_pia_from_earnings()
            
            # Calculate impact
            pia_change = modified_pia - original_calculator.pia
            monthly_change = pia_change
            annual_change = pia_change * 12
            lifetime_25_year = annual_change * 25
            
            # Create impact analysis
            pia_impact = {
                'original_pia': original_calculator.pia,
                'modified_pia': modified_pia,
                'monthly_change': round(monthly_change, 2),
                'annual_change': round(annual_change, 2),
                'lifetime_impact_25_years': round(lifetime_25_year, 2),
                'percentage_change': round((pia_change / original_calculator.pia) * 100, 2),
                'equivalent_investment_4_percent': round(lifetime_25_year / 0.04, 2)
            }
            
            # Generate new recommendations
            recommendations = _generate_optimization_insights(pia_impact, request.modified_earnings)
            
        else:
            modified_pia = None
            pia_impact = None
            recommendations = []
        
        # Update spreadsheet with impact indicators
        spreadsheet = processor.create_editable_spreadsheet()
        
        return XMLAnalysisResponse(
            success=True,
            person_info=processor.person_info,
            earnings_summary={
                'total_years': len(processor.earnings_history),
                'zero_years': sum(1 for e in processor.earnings_history if e.is_zero)
            },
            original_pia=original_calculator.pia,
            modified_pia=modified_pia,
            pia_impact=pia_impact,
            spreadsheet_data=spreadsheet,
            optimization_recommendations=recommendations
        )
        
    except Exception as e:
        logger.error(f"Earnings analysis error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error analyzing changes: {str(e)}")

@router.post("/calculate", response_model=CalculationResponse)
def calculate_benefits(request: EnhancedCalculationRequest):
    """
    Run full optimization analysis using provided or XML-derived PIA
    Integrates the XML-derived PIA with the main optimization engine
    """
    try:
        # Create calculators
        if request.spouse1.pia is None:
            # Must have uploaded XML first
            if not user_sessions:
                raise HTTPException(status_code=400, detail="No PIA available. Either provide PIA or upload XML file first.")
            
            # Use PIA from XML analysis
            session = list(user_sessions.values())[-1]
            spouse1_pia = session['calculator'].pia
        else:
            spouse1_pia = request.spouse1.pia
        
        spouse1_calc = IndividualSSCalculator(request.spouse1.birth_date, spouse1_pia)
        
        spouse2_calc = None
        if request.is_married and request.spouse2:
            spouse2_calc = IndividualSSCalculator(request.spouse2.birth_date, request.spouse2.pia)
        
        # Calculate scenarios
        scenarios = []
        
        # Current selection
        s1_benefits = spouse1_calc.calculate_lifetime_benefits(
            request.spouse1_claiming_age, request.spouse1_longevity, request.inflation_rate
        )
        
        s2_benefits = None
        if spouse2_calc:
            s2_benefits = spouse2_calc.calculate_lifetime_benefits(
                request.spouse2_claiming_age, request.spouse2_longevity, request.inflation_rate
            )
        
        total_benefits = s1_benefits['total_lifetime_benefits'] + \
                        (s2_benefits['total_lifetime_benefits'] if s2_benefits else 0)
        
        # Pass inflation to get correct adjustment percent
        current_scenario = ScenarioComparison(
            scenario_name='Current Selection',
            spouse1_claiming_age=request.spouse1_claiming_age,
            spouse2_claiming_age=request.spouse2_claiming_age,
            total_household_benefits=total_benefits,
            spouse1_breakdown=BenefitBreakdown(
                pia=spouse1_pia,
                claiming_age=request.spouse1_claiming_age,
                monthly_benefit=s1_benefits['initial_monthly_benefit'],
                annual_benefit=s1_benefits['initial_monthly_benefit'] * 12,
                lifetime_benefits=s1_benefits['total_lifetime_benefits'],
                reduction_or_credit_percent=_calculate_adjustment_percent(spouse1_calc, request.spouse1_claiming_age, request.inflation_rate)
            ),
            spouse2_breakdown=BenefitBreakdown(
                pia=request.spouse2.pia if request.spouse2 else 0,
                claiming_age=request.spouse2_claiming_age or 0,
                monthly_benefit=s2_benefits['initial_monthly_benefit'] if s2_benefits else 0,
                annual_benefit=(s2_benefits['initial_monthly_benefit'] * 12) if s2_benefits else 0,
                lifetime_benefits=s2_benefits['total_lifetime_benefits'] if s2_benefits else 0,
                reduction_or_credit_percent=_calculate_adjustment_percent(spouse2_calc, request.spouse2_claiming_age, request.inflation_rate) if spouse2_calc else 0
            ) if request.is_married else None
        )
        scenarios.append(current_scenario)
        
        # Generate chart data for visualizations
        chart_data = _generate_chart_data(scenarios, request)
        
        # Add premature death analysis if requested
        survivor_analysis = None
        if request.premature_death_year:
            survivor_analysis = _calculate_survivor_impact(
                spouse1_calc, spouse2_calc, request
            )
        
        # Generate optimization insights
        optimization_insights = {
            'best_strategy': current_scenario.scenario_name,
            'optimization_value': 0,  # Would calculate from multiple scenarios
            'key_insights': _generate_key_insights(scenarios, request.is_married),
            'survivor_analysis': survivor_analysis
        }
        
        return CalculationResponse(
            household_summary={
                'is_married': request.is_married,
                'total_scenarios_analyzed': len(scenarios),
                'xml_integration_used': request.spouse1.pia is None
            },
            spouse1_analysis=s1_benefits,
            spouse2_analysis=s2_benefits,
            scenario_comparisons=scenarios,
            optimization_insights=optimization_insights,
            chart_data=chart_data
        )
        
    except Exception as e:
        logger.error(f"Calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Calculation failed: {str(e)}")

@router.post("/monthly-optimization", response_model=MonthlyOptimizationResponse)
def monthly_optimization(request: MonthlyOptimizationRequest):
    """
    Calculate the value of waiting one more month to claim
    Implements the "one day at a time" decision making
    """
    try:
        pia = request.person.pia
        if pia is None:
            if not user_sessions:
                raise HTTPException(status_code=400, detail="No PIA available")
            session = list(user_sessions.values())[-1]
            pia = session['calculator'].pia
        
        calc = IndividualSSCalculator(request.person.birth_date, pia)
        
        # Current benefit
        current_benefit = calc.calculate_monthly_benefit(request.current_age_years, request.current_age_months, request.inflation_rate)
        
        # Next month benefit
        next_month_years = request.current_age_years
        next_month_months = request.current_age_months + 1
        if next_month_months >= 12:
            next_month_years += 1
            next_month_months = 0
            
        next_month_benefit = calc.calculate_monthly_benefit(next_month_years, next_month_months, request.inflation_rate)
        
        # Calculate lifetime value of waiting
        current_lifetime = calc.calculate_lifetime_benefits(
            request.current_age_years, request.longevity_age, request.inflation_rate, request.current_age_months
        )
        
        next_month_lifetime = calc.calculate_lifetime_benefits(
            next_month_years, request.longevity_age, request.inflation_rate, next_month_months
        )
        
        monthly_increase = next_month_benefit - current_benefit
        annual_increase = monthly_increase * 12
        lifetime_value = next_month_lifetime['total_lifetime_benefits'] - current_lifetime['total_lifetime_benefits']
        
        # Generate recommendation
        if lifetime_value > 5000:
            recommendation = f"Consider waiting - one month delay adds ${lifetime_value:,.0f} lifetime value"
        elif lifetime_value > 1000:
            recommendation = f"Moderate benefit to waiting - adds ${lifetime_value:,.0f} over lifetime"
        else:
            recommendation = f"Minimal benefit to waiting - only ${lifetime_value:,.0f} additional lifetime value"
        
        return MonthlyOptimizationResponse(
            current_monthly_benefit=round(current_benefit, 2),
            next_month_benefit=round(next_month_benefit, 2),
            monthly_increase=round(monthly_increase, 2),
            annual_increase=round(annual_increase, 2),
            lifetime_value_of_waiting=round(lifetime_value, 2),
            recommendation=recommendation
        )
        
    except Exception as e:
        logger.error(f"Monthly optimization error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Monthly optimization failed: {str(e)}")

# Helper functions
def _generate_pia_recommendations(earnings_history: List[EarningsRecord], calculator: IndividualSSCalculator) -> List[str]:
    """Generate recommendations for PIA optimization"""
    recommendations = []
    
    zero_years = [e for e in earnings_history if e.is_zero]
    low_years = [e for e in earnings_history if 0 < e.earnings < 20000]
    
    if zero_years:
        recommendations.append(f"You have {len(zero_years)} zero-earning years. Each year you can replace with earnings will increase your PIA.")
    
    if low_years:
        recommendations.append(f"You have {len(low_years)} low-earning years under $20K. Higher earning years will push these out of your top 35.")
    
    current_year = datetime.now().year
    age_62_year = calculator.birth_year + 62
    
    if age_62_year > current_year:
        years_until_62 = age_62_year - current_year
        recommendations.append(f"If you stop working at 62, you\'ll add {years_until_62} zero-earning years to your record.")
    
    recommendations.append("Use the spreadsheet to test different scenarios and see the impact on your PIA.")
    
    return recommendations

def _generate_optimization_insights(pia_impact: Dict, modified_earnings: List[Dict]) -> List[str]:
    """Generate insights from PIA impact analysis"""
    insights = []
    
    monthly_change = pia_impact['monthly_change']
    lifetime_impact = pia_impact['lifetime_impact_25_years']
    
    if monthly_change > 100:
        insights.append(f"Significant improvement: ${monthly_change:.0f} higher monthly benefit for life")
    elif monthly_change > 25:
        insights.append(f"Moderate improvement: ${monthly_change:.0f} higher monthly benefit")
    
    if abs(lifetime_impact) > 50000:
        insights.append(f"25-year lifetime impact: ${lifetime_impact:,.0f}")
    
    return insights

def _calculate_adjustment_percent(calc: IndividualSSCalculator, claiming_age: int, inflation_rate: float) -> float:
    """Calculate the reduction or credit percentage for claiming age, including pre-claiming inflation."""
    # First, get the final monthly benefit, which includes all adjustments (inflation, reduction/credit)
    final_benefit = calc.calculate_monthly_benefit(claiming_age, inflation_rate=inflation_rate)
    
    # The baseline for comparison should be the original, un-inflated PIA
    # This shows the combined effect of both inflation and claiming decision
    adjustment = (final_benefit / calc.pia - 1.0) * 100
    return round(adjustment, 2)

def _generate_key_insights(scenarios: List[ScenarioComparison], is_married: bool) -> List[str]:
    """Generate key insights from scenario comparison"""
    insights = []
    
    insights.append("Social Security optimization can provide equivalent value to hundreds of thousands in investment assets")
    
    if is_married:
        insights.append("Consider survivor benefits when optimizing - the higher earner\'s delay benefits the surviving spouse")
    
    return insights

def _generate_chart_data(scenarios: List[ScenarioComparison], request: EnhancedCalculationRequest) -> Dict[str, Any]:
    """Generate visualization-ready data"""
    return {
        "scenarios": [s.dict() for s in scenarios],
        "life_stage_boundaries": {
            "go_go_end": request.go_go_end_age,
            "slow_go_end": request.slow_go_end_age
        },
        "inflation_rate": request.inflation_rate
    }

def _calculate_survivor_impact(spouse1_calc: IndividualSSCalculator, spouse2_calc: IndividualSSCalculator, request: EnhancedCalculationRequest) -> Dict:
    """Calculate impact of premature death on surviving spouse"""
    if not request.is_married or not spouse2_calc:
        return None

    # Pass inflation to get correct benefit amounts
    spouse1_benefit = spouse1_calc.calculate_monthly_benefit(request.spouse1_claiming_age, inflation_rate=request.inflation_rate)
    spouse2_benefit = spouse2_calc.calculate_monthly_benefit(request.spouse2_claiming_age, inflation_rate=request.inflation_rate)

    survivor_benefit = max(spouse1_benefit, spouse2_benefit)
    lost_benefit = min(spouse1_benefit, spouse2_benefit)

    return {
        'income_before_death': spouse1_benefit + spouse2_benefit,
        'income_after_death': survivor_benefit,
        'monthly_income_loss': lost_benefit,
        'annual_income_loss': lost_benefit * 12,
        'analysis': f"Income drops from ${(spouse1_benefit + spouse2_benefit):,.0f} to ${survivor_benefit:,.0f} per month"
    }

@router.post("/calculate-divorced", response_model=DivorcedCalculationResponse)
def calculate_divorced(request: DivorcedCalculationRequest):
    """
    Calculate optimal strategy for divorced individual
    Compares own benefits, ex-spouse benefits, and switching strategies
    """
    try:
        # Create divorced calculator
        calc = DivorcedSSCalculator(
            birth_date=request.birth_date,
            own_pia=request.own_pia,
            ex_spouse_pia=request.ex_spouse_pia,
            marriage_duration_years=request.marriage_duration_years,
            divorce_date=request.divorce_date,
            is_remarried=request.is_remarried,
            has_child_under_16=request.has_child_under_16,
            child_birth_date=request.child_birth_date
        )

        # Calculate optimal strategy
        result = calc.calculate_optimal_strategy(
            longevity_age=request.longevity_age,
            inflation_rate=request.inflation_rate
        )

        return DivorcedCalculationResponse(
            eligible_for_ex_spouse=result['eligible_for_ex_spouse'],
            eligibility_reason=result['eligibility_reason'],
            optimal_strategy=result.get('optimal_strategy'),
            all_strategies=result.get('all_strategies', []),
            child_in_care_details=result.get('child_in_care_details'),
            deemed_filing_applies=result.get('deemed_filing_applies', False)
        )

    except Exception as e:
        logger.error(f"Divorced calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Divorced calculation failed: {str(e)}")

@router.post("/calculate-widow", response_model=WidowCalculationResponse)
def calculate_widow(request: WidowCalculationRequest):
    """
    Calculate optimal strategy for widowed individual
    Compares own benefits, survivor benefits, and crossover strategies
    """
    try:
        # Create widow calculator
        calc = WidowSSCalculator(
            birth_date=request.birth_date,
            own_pia=request.own_pia,
            deceased_spouse_pia=request.deceased_spouse_pia,
            deceased_actual_benefit=request.deceased_actual_benefit,
            deceased_spouse_death_date=request.deceased_spouse_death_date,
            is_remarried=request.is_remarried,
            remarriage_date=request.remarriage_date
        )

        # Calculate optimal strategy
        result = calc.calculate_optimal_strategy(
            longevity_age=request.longevity_age,
            inflation_rate=request.inflation_rate
        )

        return WidowCalculationResponse(
            eligible_for_survivor=result['eligible_for_survivor'],
            eligibility_reason=result['eligibility_reason'],
            optimal_strategy=result.get('optimal_strategy'),
            all_strategies=result.get('all_strategies', [])
        )

    except Exception as e:
        logger.error(f"Widow calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Widow calculation failed: {str(e)}")

@router.post("/calculate-ssdi", response_model=SSDICalculationResponse)
async def calculate_ssdi(request: SSDICalculationRequest):
    """
    Calculate SSDI benefits and compare with early retirement and suspension strategies.
    """
    try:
        calc = SSDICalculator(request.birth_date, request.pia)
        
        result = calc.calculate_ssdi_comparison(
            inflation_rate=request.inflation_rate,
            longevity_age=request.longevity_age
        )
        
        return SSDICalculationResponse(**result)
        
    except Exception as e:
        logger.error(f"SSDI calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"SSDI calculation failed: {str(e)}")

@router.post("/calculate-pia-from-earnings", response_model=PIACalculationResult)
async def calculate_pia_from_earnings(request: ManualPIACalculationRequest):
    """
    Calculate PIA from manually entered earnings history.
    This is Phase 1 of the PIA calculator - no XML upload required.
    Users can enter their earnings history year by year and see the impact on their PIA.
    """
    try:
        # Create processor with birth year
        processor = SSAXMLProcessor(birth_year=request.birth_year)

        # Convert earnings input to EarningsRecord objects
        earnings_records = []
        for entry in request.earnings_history:
            record = EarningsRecord(
                year=entry.year,
                earnings=entry.earnings,
                is_zero=(entry.earnings == 0),
                is_projected=entry.is_projected
            )
            earnings_records.append(record)

        processor.earnings_history = earnings_records

        # Calculate AIME and PIA
        calculation = processor.calculate_aime_and_pia(pia_year=request.pia_calculation_year)

        return PIACalculationResult(
            aime=calculation['aime'],
            pia=calculation['pia'],
            pia_year=calculation['pia_year'],
            bend_points_used=calculation['bend_points_used'],
            indexing_year=processor.indexing_year,
            top_35_years=calculation['top_35_years'],
            years_of_zero_in_top_35=calculation['years_of_zero_in_top_35'],
            lowest_year_in_top_35=calculation['lowest_year_in_top_35'],
            highest_year_in_top_35=calculation['highest_year_in_top_35'],
            calculation_details=calculation['calculation_details'],
            awi_approximated=bool(calculation.get('awi_approximated')),
        )

    except Exception as e:
        logger.error(f"PIA calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"PIA calculation failed: {str(e)}")

@router.post("/compare-earnings-scenarios", response_model=WhatIfComparisonResult)
async def compare_earnings_scenarios(request: WhatIfComparisonRequest):
    """
    Compare two earnings scenarios to see the impact on PIA.
    This is Phase 3 - the "what-if" analysis.

    Example: Compare retiring at 62 with zeros vs continuing to work until 67.
    Shows the exact dollar impact of those decisions on lifetime benefits.
    """
    try:
        # Calculate original PIA
        processor_original = SSAXMLProcessor(birth_year=request.birth_year)
        original_records = [
            EarningsRecord(year=e.year, earnings=e.earnings, is_zero=(e.earnings == 0), is_projected=e.is_projected)
            for e in request.original_earnings
        ]
        processor_original.earnings_history = original_records
        original_calc = processor_original.calculate_aime_and_pia()

        # Calculate modified PIA
        processor_modified = SSAXMLProcessor(birth_year=request.birth_year)
        modified_records = [
            EarningsRecord(year=e.year, earnings=e.earnings, is_zero=(e.earnings == 0), is_projected=e.is_projected)
            for e in request.modified_earnings
        ]
        processor_modified.earnings_history = modified_records
        modified_calc = processor_modified.calculate_aime_and_pia()

        # Calculate impact
        pia_change = modified_calc['pia'] - original_calc['pia']
        annual_change = pia_change * 12
        lifetime_25_years = annual_change * 25

        return WhatIfComparisonResult(
            original=PIACalculationResult(
                aime=original_calc['aime'],
                pia=original_calc['pia'],
                pia_year=original_calc['pia_year'],
                bend_points_used=original_calc['bend_points_used'],
                indexing_year=processor_original.indexing_year,
                top_35_years=original_calc['top_35_years'],
                years_of_zero_in_top_35=original_calc['years_of_zero_in_top_35'],
                lowest_year_in_top_35=original_calc['lowest_year_in_top_35'],
                highest_year_in_top_35=original_calc['highest_year_in_top_35'],
                calculation_details=original_calc['calculation_details']
            ),
            modified=PIACalculationResult(
                aime=modified_calc['aime'],
                pia=modified_calc['pia'],
                pia_year=modified_calc['pia_year'],
                bend_points_used=modified_calc['bend_points_used'],
                indexing_year=processor_modified.indexing_year,
                top_35_years=modified_calc['top_35_years'],
                years_of_zero_in_top_35=modified_calc['years_of_zero_in_top_35'],
                lowest_year_in_top_35=modified_calc['lowest_year_in_top_35'],
                highest_year_in_top_35=modified_calc['highest_year_in_top_35'],
                calculation_details=modified_calc['calculation_details']
            ),
            impact={
                'monthly_change': round(pia_change, 2),
                'annual_change': round(annual_change, 2),
                'lifetime_25_years': round(lifetime_25_years, 2),
                'percent_increase': round((pia_change / original_calc['pia'] * 100) if original_calc['pia'] > 0 else 0, 2)
            }
        )

    except Exception as e:
        logger.error(f"Earnings comparison error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Earnings comparison failed: {str(e)}")

def _history_for_stop_year(earnings_history, stop_year: int) -> List[EarningsRecord]:
    """
    Build the earnings history implied by "you keep working until `stop_year`".

    Two halves, both required for the ladder to answer its own question:
      1. Project forward. A submitted record ends a few years after today, so
         for anyone not already near 62 every stop year lands past the end of
         the record and there is nothing to zero. Carry the most recent
         non-zero earnings amount forward to the stop year, the way SSA's own
         statement projection does.
      2. Zero from the stop year on, since that is the year work stops.
    """
    known = {entry.year: entry.earnings for entry in earnings_history}
    years_with_earnings = [year for year, amount in known.items() if amount > 0]
    carry_forward = known[max(years_with_earnings)] if years_with_earnings else 0

    records = [
        EarningsRecord(
            year=entry.year,
            earnings=0 if entry.year >= stop_year else entry.earnings,
            is_zero=(entry.year >= stop_year or entry.earnings == 0),
            is_projected=entry.is_projected,
        )
        for entry in earnings_history
    ]

    if known and carry_forward > 0:
        for year in range(max(known) + 1, stop_year):
            records.append(
                EarningsRecord(
                    year=year,
                    earnings=carry_forward,
                    is_zero=False,
                    is_projected=True,
                )
            )

    return records


@router.post("/api/work-stop-ladder", response_model=WorkStopLadderResult)
def work_stop_ladder(request: WorkStopLadderRequest):
    """
    Recompute PIA for each candidate work-stop age.

    Answers "what happens if you stop working at 62 vs 65 vs 67?" by projecting
    earnings forward to each stop year, zeroing every year at or after it, and
    recomputing AIME/PIA.

    Declared `def` rather than `async def` on purpose: the work is synchronous
    CPU, so Starlette runs it on the threadpool instead of blocking the event
    loop for every other request on the worker.
    """
    try:
        rungs = []
        for stop_age in sorted(set(request.stop_ages)):
            stop_year = request.birth_year + stop_age
            processor = SSAXMLProcessor(birth_year=request.birth_year)
            processor.earnings_history = _history_for_stop_year(
                request.earnings_history, stop_year
            )
            calculation = processor.calculate_aime_and_pia()
            rungs.append(
                WorkStopRung(
                    stop_age=stop_age,
                    stop_year=stop_year,
                    aime=calculation["aime"],
                    pia=calculation["pia"],
                )
            )
        return WorkStopLadderResult(rungs=rungs)
    except Exception as e:
        logger.error(f"Work-stop ladder error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Work-stop ladder failed: {str(e)}")
