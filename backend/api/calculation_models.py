from datetime import date
from pydantic import BaseModel, Field, validator, field_validator
from typing import Optional, List, Dict, Any


class PersonInput(BaseModel):
    birth_date: date
    pia: Optional[float] = None
    name: Optional[str] = None
    
    @validator('birth_date')
    def validate_birth_date(cls, v):
        if v > date.today():
            raise ValueError("Birth date cannot be in the future")
        if v < date(1900, 1, 1):
            raise ValueError("Birth date too far in the past")
        return v

class XMLAnalysisRequest(BaseModel):
    birth_date: date
    modified_earnings: Optional[List[Dict]] = None
    
class XMLAnalysisResponse(BaseModel):
    success: bool
    person_info: Dict
    earnings_summary: Dict
    original_pia: float
    modified_pia: Optional[float] = None
    pia_impact: Optional[Dict] = None
    spreadsheet_data: List[Dict]
    optimization_recommendations: List[str]

class EnhancedCalculationRequest(BaseModel):
    spouse1: PersonInput
    spouse2: Optional[PersonInput] = None
    is_married: bool = False
    
    # Claiming strategy
    spouse1_claiming_age: int = Field(..., ge=62, le=70)
    spouse2_claiming_age: Optional[int] = Field(None, ge=62, le=70)
    
    # Longevity and economics
    spouse1_longevity: int = Field(90, ge=70, le=100)
    spouse2_longevity: Optional[int] = Field(90, ge=70, le=100)
    inflation_rate: float = Field(0.025, ge=0.0, le=0.10)
    
    # Life stages
    go_go_end_age: int = Field(75, ge=65, le=90)
    slow_go_end_age: int = Field(85, ge=70, le=95)
    
    # Death scenario analysis
    premature_death_year: Optional[int] = Field(None, ge=2025, le=2100)

class MonthlyOptimizationRequest(BaseModel):
    """Request for month-by-month optimization analysis"""
    person: PersonInput
    current_age_years: int = Field(..., ge=62, le=70)
    current_age_months: int = Field(0, ge=0, le=11)
    longevity_age: int = Field(90, ge=70, le=100)
    inflation_rate: float = Field(0.025, ge=0.0, le=0.10)

class MonthlyOptimizationResponse(BaseModel):
    """Response for month-by-month optimization"""
    current_monthly_benefit: float
    next_month_benefit: float
    monthly_increase: float
    annual_increase: float
    lifetime_value_of_waiting: float
    recommendation: str

class BenefitBreakdown(BaseModel):
    """Benefit calculation breakdown for one person"""
    pia: float
    claiming_age: int
    monthly_benefit: float
    annual_benefit: float
    lifetime_benefits: float
    reduction_or_credit_percent: float

class ScenarioComparison(BaseModel):
    """Comparison of different claiming scenarios"""
    scenario_name: str
    spouse1_claiming_age: int
    spouse2_claiming_age: Optional[int]
    total_household_benefits: float
    spouse1_breakdown: BenefitBreakdown
    spouse2_breakdown: Optional[BenefitBreakdown]

class CalculationResponse(BaseModel):
    """Response model for Social Security calculations"""
    household_summary: Dict[str, Any]
    spouse1_analysis: Dict[str, Any]
    spouse2_analysis: Optional[Dict[str, Any]]
    scenario_comparisons: List[ScenarioComparison]
    optimization_insights: Dict[str, Any]
    chart_data: Dict[str, Any]

class BCRRequest(BaseModel):
    birth_date: date
    pia: float
    longevity_age: int = 95
    inflation_rate: float = 0.025

class DivorcedCalculationRequest(BaseModel):
    """Request for divorced individual calculation"""
    birth_date: date
    own_pia: float = Field(..., gt=0, description="Person's own PIA")
    ex_spouse_pia: float = Field(..., gt=0, description="Ex-spouse's PIA")
    marriage_duration_years: int = Field(..., ge=0, le=100, description="Length of marriage in years")
    divorce_date: date
    is_remarried: bool = False
    has_child_under_16: bool = False
    child_birth_date: Optional[date] = None
    longevity_age: int = Field(95, ge=70, le=100)
    inflation_rate: float = Field(0.025, ge=0.0, le=0.10)

class DivorcedCalculationResponse(BaseModel):
    """Response for divorced individual calculation"""
    eligible_for_ex_spouse: bool
    eligibility_reason: str
    optimal_strategy: Optional[Dict[str, Any]]
    all_strategies: List[Dict[str, Any]]
    child_in_care_details: Optional[Dict[str, Any]]
    deemed_filing_applies: bool

class WidowCalculationRequest(BaseModel):
    """Request for widowed individual calculation"""
    birth_date: date
    own_pia: float = Field(..., gt=0, description="Person's own PIA")
    deceased_spouse_pia: float = Field(..., gt=0, description="Deceased spouse's PIA")
    deceased_actual_benefit: Optional[float] = Field(None, ge=0, description="Monthly amount deceased spouse was receiving at death")
    deceased_spouse_death_date: date
    is_remarried: bool = False
    remarriage_date: Optional[date] = None
    longevity_age: int = Field(95, ge=70, le=100)
    inflation_rate: float = Field(0.025, ge=0.0, le=0.10)

class WidowCalculationResponse(BaseModel):
    """Response for widowed individual calculation"""
    eligible_for_survivor: bool
    eligibility_reason: str
    optimal_strategy: Optional[Dict[str, Any]]
    all_strategies: List[Dict[str, Any]]

class EarningsYearInput(BaseModel):
    """Single year of earnings input"""
    year: int = Field(..., ge=1937, le=2100)
    earnings: float = Field(..., ge=0)
    is_projected: bool = False

class ManualPIACalculationRequest(BaseModel):
    """Request for manual PIA calculation from earnings history"""
    birth_year: int = Field(..., ge=1937, le=2010)
    earnings_history: List[EarningsYearInput]
    pia_calculation_year: Optional[int] = None  # Year to use for bend points (default: birth_year + 62)

class PIACalculationResult(BaseModel):
    """Result of PIA calculation"""
    aime: float
    pia: float
    pia_year: int
    bend_points_used: List[int]
    indexing_year: int
    top_35_years: List[Dict[str, Any]]
    years_of_zero_in_top_35: int
    lowest_year_in_top_35: float
    highest_year_in_top_35: float
    calculation_details: Dict[str, float]
    awi_approximated: bool = False

class WhatIfComparisonRequest(BaseModel):
    """Request to compare original vs modified earnings"""
    birth_year: int = Field(..., ge=1937, le=2010)
    original_earnings: List[EarningsYearInput]
    modified_earnings: List[EarningsYearInput]

class WhatIfComparisonResult(BaseModel):
    """Comparison of original vs modified PIA"""
    original: PIACalculationResult
    modified: PIACalculationResult
    impact: Dict[str, float]  # monthly_change, annual_change, lifetime_25_years

class SSDICalculationRequest(BaseModel):
    """Request for SSDI benefit analysis"""
    birth_date: date
    pia: float = Field(..., gt=0, description="Estimated Primary Insurance Amount")
    inflation_rate: float = Field(0.025, ge=0.0, le=0.10)
    longevity_age: int = Field(90, ge=70, le=100)

class SSDICalculationResponse(BaseModel):
    """Response for SSDI calculation and comparison"""
    current_age: float
    fra_age: float
    ssdi_monthly_benefit: float
    early_retirement: Dict[str, Any] # eligible, amount, reduction_percent
    strategies: Dict[str, Any] # standard vs suspension
    timeline: List[Dict[str, Any]] # Year by year data for charts

class WorkStopLadderRequest(BaseModel):
    """Request for PIA across a range of work-stop ages"""
    birth_year: int = Field(..., ge=1937, le=2010)
    earnings_history: List[EarningsYearInput]
    # max_length 9 == ages 62..70 inclusive, the entire legal domain. The route
    # does synchronous CPU work per rung on an unauthenticated endpoint, so an
    # unbounded list is a request-amplification primitive.
    stop_ages: List[int] = Field(..., min_length=1, max_length=9)

    @field_validator("stop_ages")
    @classmethod
    def validate_stop_ages(cls, value: List[int]) -> List[int]:
        for age in value:
            if age < 62 or age > 70:
                raise ValueError("stop_ages must be between 62 and 70")
        if len(set(value)) != len(value):
            raise ValueError("stop_ages must not contain duplicate ages")
        return value


class WorkStopRung(BaseModel):
    """PIA outcome for a single work-stop age"""
    stop_age: int
    stop_year: int
    aime: float
    pia: float


class WorkStopLadderResult(BaseModel):
    rungs: List[WorkStopRung]
