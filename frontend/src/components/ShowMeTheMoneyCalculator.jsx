import React, { useState, useEffect, useMemo, useRef, useReducer } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, BubbleController } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { SankeyController, Flow } from 'chartjs-chart-sankey';
import { Checkbox, Button } from './ui';
import { PillTabs, PillTab } from './ui';
import { useUser } from '../contexts/UserContext.jsx';
import { useDevMode } from '../contexts/DevModeContext.jsx';
import { useCalculatorPersistence } from '../hooks/useCalculatorPersistence';
import { useNavigate } from 'react-router-dom';
import { OneMonthAtATimeModal } from './OneMonthAtATime';
import { OurLifelongTimeline } from './OurLifelongTimeline';
import HouseholdWorkStopPanel from './HouseholdWorkStopPanel';
import { isTimelineReachable, getHouseholdBucket } from './OurLifelongTimeline/timelineMath';
import { calculateProjection, combineProjections, resolveProjectionEndYear } from '../calculators/showMeTheMoney/projections';
import { buildLongevitySummary } from '../calculators/longevity/summary';
import {
    emptyLongevityProfile,
    migrateLifeExpectancyPreferences
} from '../calculators/longevity/preferences';
import { applyBenefitCut, calculateAxisRanges } from '../calculators/showMeTheMoney/ssCuts';
import {
    createScenario,
    scenarioReducer,
    serializeScenario,
    deserializeScenario,
    PROVENANCE,
    hasThirtyFiveNonZeroYears,
    planLabel,
    effectivePia,
    piaFieldView,
    resolveEnteredPia,
    householdWorkStopRungsForRelationship
} from '../calculators/showMeTheMoney/scenario';
import { fetchEarnings, fetchWorkStopLadder, calculatePiaFromEarnings, readDevEarnings } from '../services/earningsService';
import { describeEarningsVintage } from '../utils/earningsVintage';
import { readWorkshopPia, disableWorkshopPia, workshopPiaHydrationAction } from '../utils/workshopPia';
import { getAuthToken } from '../config/supabase';
import { SCENARIO_COLORS, SCENARIO_TINTS, SCENARIO_INK, STAGE_COLORS, STAGE_GRIP_COLOR, STAGE_BORDER_COLOR, REFERENCE_COLORS, SIGNAL_COLORS, CHART_CHROME, withAlpha } from '../theme/navigatorColors';

const birthYearFromDob = (dob) => {
    if (!dob) return null;
    const year = new Date(dob).getFullYear();
    return Number.isNaN(year) ? null : year;
};

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin, SankeyController, Flow, BubbleController);

// FRA + reduction/DRC + pre/post-claim COLA are imported from shared benefitFormulas

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
});

// Retirement Stages Slider Component
const RetirementStagesSlider = ({
    label,
    goGoEndAge,
    setGoGoEndAge,
    slowGoEndAge,
    setSlowGoEndAge,
    isDraggingGoGo,
    setIsDraggingGoGo,
    isDraggingSlowGo,
    setIsDraggingSlowGo
}) => {
    const sliderRef = useRef(null);
    const MIN_AGE = 62;
    const MAX_AGE = 95;

    // Convert age to percentage position (0-100%)
    const ageToPercent = (age) => {
        return ((age - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
    };

    // Convert mouse X position to age
    const xToAge = (clientX) => {
        if (!sliderRef.current) return MIN_AGE;
        const rect = sliderRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        return Math.round(MIN_AGE + (percent / 100) * (MAX_AGE - MIN_AGE));
    };

    // Handle mouse/touch events for Go-Go handle
    const handleGoGoMouseDown = (e) => {
        e.preventDefault();
        setIsDraggingGoGo(true);
    };

    const handleSlowGoMouseDown = (e) => {
        e.preventDefault();
        setIsDraggingSlowGo(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDraggingGoGo) {
                const newAge = xToAge(e.clientX);
                // Ensure Go-Go ends before Slow-Go
                if (newAge < slowGoEndAge) {
                    setGoGoEndAge(newAge);
                }
            } else if (isDraggingSlowGo) {
                const newAge = xToAge(e.clientX);
                // Ensure Slow-Go ends after Go-Go and before max
                if (newAge > goGoEndAge && newAge <= MAX_AGE) {
                    setSlowGoEndAge(newAge);
                }
            }
        };

        const handleMouseUp = () => {
            setIsDraggingGoGo(false);
            setIsDraggingSlowGo(false);
        };

        if (isDraggingGoGo || isDraggingSlowGo) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDraggingGoGo, isDraggingSlowGo, goGoEndAge, slowGoEndAge, setGoGoEndAge, setSlowGoEndAge, setIsDraggingGoGo, setIsDraggingSlowGo]);

    const goGoWidth = ageToPercent(goGoEndAge);
    const slowGoWidth = ageToPercent(slowGoEndAge) - ageToPercent(goGoEndAge);
    const noGoWidth = 100 - ageToPercent(slowGoEndAge);

    return (
        <div className="w-full" style={{ paddingLeft: '60px', paddingRight: '30px' }}>
            <div ref={sliderRef} className="relative h-9 flex rounded-md overflow-hidden border" style={{ borderColor: STAGE_BORDER_COLOR }}>
                {/* Go-Go Years Section */}
                <div
                    className="relative flex items-center justify-center font-bold text-sm tracking-wide transition-all duration-200"
                    style={{
                        width: `${goGoWidth}%`,
                        backgroundColor: STAGE_COLORS.goGo.bg,
                        color: STAGE_COLORS.goGo.text,
                    }}
                >
                    {label && (
                        <div className="absolute left-3 px-2 py-0.5 bg-white/70 font-extrabold text-xs rounded tracking-wider uppercase select-none" style={{ color: STAGE_COLORS.goGo.text }}>
                            {label}
                        </div>
                    )}
                    {goGoWidth > (label ? 22 : 15) ? (
                        <span>Go-Go Years</span>
                    ) : goGoWidth > (label ? 15 : 8) ? (
                        <span>Go-Go</span>
                    ) : null}
                </div>

                {/* Handle 1: Between Go-Go and Slow-Go */}
                <div
                    className="absolute top-0 bottom-0 w-8 flex items-center justify-center cursor-ew-resize z-10 group"
                    style={{ left: `calc(${goGoWidth}% - 16px)` }}
                    onMouseDown={handleGoGoMouseDown}
                >
                    <div className={`h-full transition-all ${isDraggingGoGo ? 'w-1' : 'w-px group-hover:w-0.5'}`} style={{ backgroundColor: STAGE_GRIP_COLOR, opacity: 0.35 }} />
                    {/* Draggable handle indicator */}
                    <div className={`absolute top-1/2 -translate-y-1/2 rounded-sm transition-all ${isDraggingGoGo ? 'w-2 h-6' : 'w-1.5 h-5 group-hover:w-2 group-hover:h-6'}`} style={{ backgroundColor: STAGE_GRIP_COLOR }}>
                        {/* Grip dots */}
                        <div className="flex flex-col items-center justify-center h-full gap-0.5">
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                        </div>
                    </div>
                </div>

                {/* Slow-Go Years Section */}
                <div
                    className="relative flex items-center justify-center font-bold text-sm tracking-wide transition-all duration-200"
                    style={{
                        width: `${slowGoWidth}%`,
                        backgroundColor: STAGE_COLORS.slowGo.bg,
                        color: STAGE_COLORS.slowGo.text,
                    }}
                >
                    {slowGoWidth > 15 ? (
                        <span>Slow-Go Years</span>
                    ) : slowGoWidth > 8 ? (
                        <span>Slow-Go</span>
                    ) : null}
                </div>

                {/* Handle 2: Between Slow-Go and No-Go */}
                <div
                    className="absolute top-0 bottom-0 w-8 flex items-center justify-center cursor-ew-resize z-10 group"
                    style={{ left: `calc(${goGoWidth + slowGoWidth}% - 16px)` }}
                    onMouseDown={handleSlowGoMouseDown}
                >
                    <div className={`h-full transition-all ${isDraggingSlowGo ? 'w-1' : 'w-px group-hover:w-0.5'}`} style={{ backgroundColor: STAGE_GRIP_COLOR, opacity: 0.35 }} />
                    {/* Draggable handle indicator */}
                    <div className={`absolute top-1/2 -translate-y-1/2 rounded-sm transition-all ${isDraggingSlowGo ? 'w-2 h-6' : 'w-1.5 h-5 group-hover:w-2 group-hover:h-6'}`} style={{ backgroundColor: STAGE_GRIP_COLOR }}>
                        {/* Grip dots */}
                        <div className="flex flex-col items-center justify-center h-full gap-0.5">
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                            <div className="w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
                        </div>
                    </div>
                </div>

                {/* No-Go Years Section */}
                <div
                    className="relative flex items-center justify-center font-bold text-sm tracking-wide transition-all duration-200"
                    style={{
                        width: `${noGoWidth}%`,
                        backgroundColor: STAGE_COLORS.noGo.bg,
                        color: STAGE_COLORS.noGo.text,
                    }}
                >
                    {noGoWidth > 15 ? (
                        <span>No-Go Years</span>
                    ) : noGoWidth > 8 ? (
                        <span>No-Go</span>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

// Flow Visualization Component - Three Scenarios Side-by-Side
const FlowVisualization = ({ scenarioData, age, monthlyNeeds, activeRecordView, isMarried, inflationRate, currentAge, selectedStrategy, setSelectedStrategy, piaStrategy, setPiaStrategy, preferredFilingYear, preferredFilingMonth }) => {
    // Responsive container refs/state must be declared before any early returns (React hooks rule)
    const containerRef = useRef(null);
    const [svgHeight, setSvgHeight] = useState(700);
    const [svgWidth, setSvgWidth] = useState(1200);
    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const update = () => {
            const h = el.clientHeight || 700;
            const computed = Math.max(500, Math.min(800, h - 140));
            setSvgHeight(computed);
            const w = el.clientWidth || 1200;
            const computedW = Math.max(1000, Math.min(1400, w - 48));
            setSvgWidth(computedW);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (!scenarioData) {
        return <div className="h-full flex items-center justify-center text-gray-500">Loading...</div>;
    }

    const { primaryProjections, spouseProjections, combinedProjections, birthYearPrimary } = scenarioData;

    const projections = activeRecordView === 'primary'
        ? primaryProjections
        : activeRecordView === 'spouse' && spouseProjections
            ? spouseProjections
            : combinedProjections;

    // Calculate the calendar year for the selected age
    // When viewing spouse-only projections, use spouse's birth year so the timeline aligns correctly
    const effectiveBirthYear = (activeRecordView === 'spouse' && scenarioData.birthYearSpouse)
        ? scenarioData.birthYearSpouse
        : birthYearPrimary;
    const calendarYear = effectiveBirthYear + age;

    // Get monthly values for each filing scenario
    // Always use the pure filing age projections (same as Monthly tab)
    const age62Monthly = projections.age62.monthly[calendarYear] || 0;
    const age67Monthly = projections.preferred.monthly[calendarYear] || 0;
    const age70Monthly = projections.age70.monthly[calendarYear] || 0;

    // Apply inflation to monthly needs from current age to selected age
    const yearsFromNow = age - currentAge;
    const inflatedMonthlyNeeds = monthlyNeeds * Math.pow(1 + inflationRate, yearsFromNow);

    // For the hybrid column, we need to show the two individual spouse benefits when married
    const showHybridColumn = isMarried && activeRecordView === 'combined';

    // Get individual spouse values for the hybrid (62/70) column
    let bottomSegmentAmount = 0;  // Person who files at 62 - shown as bottom/first segment
    let topSegmentAmount = 0; // Person who files at 70 - shown as top/second segment (only when age >= 70)

    if (showHybridColumn && primaryProjections && spouseProjections) {
        // Get the benefit amounts for each spouse at the current calendar year
        // These already include proper reduction factors and inflation adjustments
        const primary62AtCurrentAge = primaryProjections.age62.monthly[calendarYear] || 0;
        const spouse62AtCurrentAge = spouseProjections.age62.monthly[calendarYear] || 0;
        const primary70AtCurrentAge = primaryProjections.age70.monthly[calendarYear] || 0;
        const spouse70AtCurrentAge = spouseProjections.age70.monthly[calendarYear] || 0;

        // Determine which spouse has lower PIA based on their age 62 benefits (proxy for PIA)
        const primaryIsLowerPia = primary62AtCurrentAge <= spouse62AtCurrentAge;

        // Hybrid strategy logic: ALWAYS use the optimal strategy
        // - Lower PIA spouse files at 62 and gets reduced benefits ongoing
        // - Higher PIA spouse waits until 70 to file for maximum benefits
        // - At ages before 70, we only show the lower PIA's benefit
        // - At age 70+, we show both: lower PIA (who filed at 62) + higher PIA (filing at 70)

        if (primaryIsLowerPia) {
            // Primary (lower PIA) files at 62
            bottomSegmentAmount = primary62AtCurrentAge;
            // Spouse (higher PIA) files at 70
            topSegmentAmount = age >= 70 ? spouse70AtCurrentAge : 0;
        } else {
            // Spouse (lower PIA) files at 62
            bottomSegmentAmount = spouse62AtCurrentAge;
            // Primary (higher PIA) files at 70
            topSegmentAmount = age >= 70 ? primary70AtCurrentAge : 0;
        }
    }

    const hybridTotalIncome = bottomSegmentAmount + topSegmentAmount;

    // Calculate coverage for each scenario
    const scenarios = [
        {
            label: 'File at 62',
            age: 62,
            income: age62Monthly,
            covered: Math.min(age62Monthly, inflatedMonthlyNeeds),
            gap: Math.max(0, inflatedMonthlyNeeds - age62Monthly),
            color: SCENARIO_COLORS.age62
        },
        {
            label: `File at ${preferredFilingYear}${preferredFilingMonth > 0 ? `y ${preferredFilingMonth}m` : ''}`,
            age: preferredFilingYear,
            income: age67Monthly,
            covered: Math.min(age67Monthly, inflatedMonthlyNeeds),
            gap: Math.max(0, inflatedMonthlyNeeds - age67Monthly),
            color: SCENARIO_COLORS.preferred
        },
        {
            label: 'File at 70',
            age: 70,
            income: age70Monthly,
            covered: Math.min(age70Monthly, inflatedMonthlyNeeds),
            gap: Math.max(0, inflatedMonthlyNeeds - age70Monthly),
            color: SCENARIO_COLORS.age70
        }
    ];

    const gapColor = SIGNAL_COLORS.cautionSoft; // Shortfall that savings must cover

    const width = svgWidth;
    const height = svgHeight; // was 700 fixed
    const barWidth = 100;
    const barSpacing = 80;
    const startX = 100;
    const rightMargin = Math.max(220, Math.round(width * 0.18));
    const rightX = width - rightMargin;
    const maxValue = Math.max(inflatedMonthlyNeeds, age70Monthly) * 1.1; // Add 10% padding

    // Calculate heights proportional to values - scale with container height
    const availableHeight = Math.max(260, height - 280);
    const getHeight = (value) => Math.max(30, (value / maxValue) * availableHeight);

    // Target bar is 50% taller to give room for swoopy curves
    const getTargetHeight = (value) => getHeight(value) * 1.5;

    // Generate dramatic curved flow path - only for selected strategy
    // Handle hybrid column (index 3) differently
    const selectedScenario = selectedStrategy === 3
        ? {
            label: 'File at 62/70',
            age: age >= 70 ? '62/70' : age >= 67 ? 67 : 62,
            income: hybridTotalIncome,
            covered: Math.min(hybridTotalIncome, inflatedMonthlyNeeds),
            gap: Math.max(0, inflatedMonthlyNeeds - hybridTotalIncome),
            color: SCENARIO_COLORS.hybrid
        }
        : scenarios[selectedStrategy];

    const selectedBarX = selectedStrategy === 3
        ? startX  // Hybrid column is at far left
        : showHybridColumn
            ? startX + (barWidth + barSpacing) + selectedStrategy * (barWidth + barSpacing)  // Shift right when hybrid shown
            : startX + selectedStrategy * (barWidth + barSpacing);  // No shift when hybrid not shown
    const baseY = height - 100; // Increased from 80 to give more space for labels above target bar

    // Calculate control points for swoopy Sankey flow
    // Flow from bottom of strategy bar to bottom of target bar,
    // and from top of strategy bar to the coverage point on target bar
    // Compute target column height, but clamp so it never extends past the SVG top
    // This avoids the right-hand target bar being cut off at the top on some screens
    let targetHeight = getTargetHeight(inflatedMonthlyNeeds);
    const maxTargetHeight = Math.max(120, baseY - 80); // keep ~80px for labels/title
    if (targetHeight > maxTargetHeight) {
        targetHeight = maxTargetHeight;
    }
    // Scale label offsets and sizes based on available headroom
    const headroom = Math.max(60, baseY - targetHeight);
    const labelScale = Math.max(0.75, Math.min(1, headroom / 120));
    const labelY1 = baseY - targetHeight - Math.round(60 * labelScale);
    const labelY2 = baseY - targetHeight - Math.round(42 * labelScale);
    const labelY3 = baseY - targetHeight - Math.round(20 * labelScale);
    const targetBottom = baseY;
    const targetCoveragePoint = selectedScenario ? baseY - (selectedScenario.covered / inflatedMonthlyNeeds) * targetHeight : baseY;

    const strategyBottom = baseY;
    const strategyTop = selectedScenario ? baseY - getHeight(selectedScenario.covered) : baseY;

    const midX = (selectedBarX + barWidth + rightX) / 2;

    // Create swoopy flow path - different logic for hybrid column
    let flowPath = null;
    let flowPathLower = null;
    let flowPathHigher = null;

    if (selectedStrategy === 3 && showHybridColumn) {
        // Two separate flows for the hybrid column (only when age >= 70)
        const lowerHeight = getHeight(bottomSegmentAmount);
        const higherHeight = getHeight(topSegmentAmount);
        const totalCombined = hybridTotalIncome;

        if (totalCombined > 0 && age >= 70 && topSegmentAmount > 0) {
            // Two-segment flow when both spouses have filed
            const lowerTop = baseY - lowerHeight;
            const lowerCoveragePoint = baseY - (bottomSegmentAmount / inflatedMonthlyNeeds) * targetHeight;

            flowPathLower = `
                M ${selectedBarX + barWidth} ${baseY}
                C ${midX} ${baseY},
                  ${midX} ${baseY},
                  ${rightX} ${baseY}
                L ${rightX} ${lowerCoveragePoint}
                C ${midX} ${lowerCoveragePoint},
                  ${midX} ${lowerTop},
                  ${selectedBarX + barWidth} ${lowerTop}
                Z
            `;

            // Higher segment flow (from 70 benefit stacked on top to target)
            const higherBottom = baseY - lowerHeight;
            const higherTop = baseY - lowerHeight - higherHeight;
            const higherCoverageStart = lowerCoveragePoint;
            const higherCoverageEnd = baseY - ((bottomSegmentAmount + topSegmentAmount) / inflatedMonthlyNeeds) * targetHeight;

            flowPathHigher = `
                M ${selectedBarX + barWidth} ${higherBottom}
                C ${midX} ${higherBottom},
                  ${midX} ${higherCoverageStart},
                  ${rightX} ${higherCoverageStart}
                L ${rightX} ${higherCoverageEnd}
                C ${midX} ${higherCoverageEnd},
                  ${midX} ${higherTop},
                  ${selectedBarX + barWidth} ${higherTop}
                Z
            `;
        } else if (totalCombined > 0) {
            // Single flow when only lower PIA has filed (age < 70)
            flowPath = `
                M ${selectedBarX + barWidth} ${strategyBottom}
                C ${midX} ${strategyBottom},
                  ${midX} ${targetBottom},
                  ${rightX} ${targetBottom}
                L ${rightX} ${targetCoveragePoint}
                C ${midX} ${targetCoveragePoint},
                  ${midX} ${strategyTop},
                  ${selectedBarX + barWidth} ${strategyTop}
                Z
            `;
        }
    } else if (selectedScenario && selectedScenario.income > 0) {
        // Standard flow for single-column scenarios
        flowPath = `
            M ${selectedBarX + barWidth} ${strategyBottom}
            C ${midX} ${strategyBottom},
              ${midX} ${targetBottom},
              ${rightX} ${targetBottom}
            L ${rightX} ${targetCoveragePoint}
            C ${midX} ${targetCoveragePoint},
              ${midX} ${strategyTop},
              ${selectedBarX + barWidth} ${strategyTop}
            Z
        `;
    }

    // Calculate coverage percentage for tooltips
    const coveragePercent = inflatedMonthlyNeeds > 0
        ? (selectedScenario.covered / inflatedMonthlyNeeds * 100).toFixed(0)
        : 0;
    const gapPercent = inflatedMonthlyNeeds > 0
        ? (selectedScenario.gap / inflatedMonthlyNeeds * 100).toFixed(0)
        : 0;

    return (
        <div className="h-full flex flex-col p-6">
            <div className="mb-4 ml-8">
                <div className="text-3xl font-bold text-gray-900 mb-2">
                    Impact of Filing Strategy at Age {age}
                </div>
                <div className="text-lg text-gray-600">
                    Monthly Expense Needs This Year: {currencyFormatter.format(Math.round(inflatedMonthlyNeeds))}
                    {yearsFromNow > 0 && (
                        <span className="text-sm text-gray-500 ml-2">
                            ({currencyFormatter.format(Math.round(monthlyNeeds))} today + {(inflationRate * 100).toFixed(1)}% inflation)
                        </span>
                    )}
                </div>
            </div>

            <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-auto">
                <svg width={width} height={height} className="mx-auto" viewBox={`0 0 ${width} ${height}`}>
                    <style>
                        {`
                            .flow-bar {
                                transition: all 0.7s cubic-bezier(0.4, 0.0, 0.2, 1);
                            }
                            .flow-bar:hover {
                                opacity: 1 !important;
                                filter: brightness(1.1);
                            }
                            .flow-path {
                                transition: all 0.7s cubic-bezier(0.4, 0.0, 0.2, 1);
                            }
                            .flow-path:hover {
                                opacity: 0.7 !important;
                            }
                            .flow-text {
                                transition: all 0.5s ease-in-out;
                            }
                            .tooltip-group {
                                pointer-events: none;
                                opacity: 0;
                                transition: opacity 0.2s ease-in-out;
                            }
                            .flow-bar-group:hover .tooltip-group {
                                opacity: 1;
                            }
                        `}
                    </style>

                    {/* Flow path - only for selected strategy */}
                    {flowPath && (
                        <g>
                            <path
                                d={flowPath}
                                fill={selectedScenario.color}
                                opacity="0.5"
                                className="flow-path"
                            />
                            <title>
                                {`SS Income covers ${coveragePercent}% of monthly needs\n`}
                                {`${currencyFormatter.format(Math.round(selectedScenario.covered))} out of ${currencyFormatter.format(Math.round(inflatedMonthlyNeeds))}\n`}
                                {selectedScenario.gap > 0 && `Remaining ${gapPercent}% must come from savings`}
                            </title>
                        </g>
                    )}

                    {/* Flow paths for hybrid column - two separate flows */}
                    {flowPathLower && (
                        <g>
                            <path
                                d={flowPathLower}
                                fill={SCENARIO_COLORS.age62}
                                opacity="0.5"
                                className="flow-path"
                            />
                            <title>
                                {`Lower PIA files at ${age >= 70 ? 62 : age >= 67 ? 67 : 62}\n`}
                                {`${currencyFormatter.format(Math.round(bottomSegmentAmount))} per month\n`}
                                {`Early filing provides immediate income`}
                            </title>
                        </g>
                    )}
                    {flowPathHigher && (
                        <g>
                            <path
                                d={flowPathHigher}
                                fill={SCENARIO_COLORS.age70}
                                opacity="0.5"
                                className="flow-path"
                            />
                            <title>
                                {`Higher PIA files at 70\n`}
                                {`${currencyFormatter.format(Math.round(topSegmentAmount))} per month\n`}
                                {`Late filing maximizes lifetime benefits`}
                            </title>
                        </g>
                    )}

                    {/* Hybrid (62/70) Column - only shown when married and viewing combined - positioned at far left */}
                    {showHybridColumn && (
                        <g>
                            {(() => {
                                const hybridX = startX;  // Far left position
                                const lowerHeight = getHeight(bottomSegmentAmount);
                                const higherHeight = getHeight(topSegmentAmount);
                                const isHybridSelected = selectedStrategy === 3;
                                const barOpacity = isHybridSelected ? 1 : 0.1;

                                return (
                                    <>
                                        {/* Radio button */}
                                        <circle
                                            cx={hybridX + barWidth / 2}
                                            cy={baseY - lowerHeight - higherHeight - 30}
                                            r="8"
                                            fill="white"
                                            stroke={SCENARIO_COLORS.hybrid}
                                            strokeWidth="2"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedStrategy(3)}
                                        />
                                        {isHybridSelected && (
                                            <circle
                                                cx={hybridX + barWidth / 2}
                                                cy={baseY - lowerHeight - higherHeight - 30}
                                                r="4"
                                                fill={SCENARIO_COLORS.hybrid}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setSelectedStrategy(3)}
                                            />
                                        )}

                                        {/* Lower PIA segment (bottom, red) */}
                                        {bottomSegmentAmount > 0 && (
                                            <g>
                                                <rect
                                                    x={hybridX}
                                                    y={baseY - lowerHeight}
                                                    width={barWidth}
                                                    height={lowerHeight}
                                                    fill={SCENARIO_COLORS.age62}
                                                    rx="8"
                                                    opacity={barOpacity}
                                                    className="flow-bar"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setSelectedStrategy(3)}
                                                />
                                                <title>
                                                    {`Lower PIA files at ${age >= 70 ? 62 : age >= 67 ? 67 : 62}\n`}
                                                    {`${currencyFormatter.format(Math.round(bottomSegmentAmount))} per month\n`}
                                                    {`Early filing provides immediate income`}
                                                </title>
                                            </g>
                                        )}

                                        {/* Higher PIA segment (top, teal) - only shown when age >= 70 */}
                                        {topSegmentAmount > 0 && (
                                            <g>
                                                <rect
                                                    x={hybridX}
                                                    y={baseY - lowerHeight - higherHeight}
                                                    width={barWidth}
                                                    height={higherHeight}
                                                    fill={SCENARIO_COLORS.age70}
                                                    rx="8"
                                                    opacity={barOpacity}
                                                    className="flow-bar"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setSelectedStrategy(3)}
                                                />
                                                <title>
                                                    {`Higher PIA files at 70\n`}
                                                    {`${currencyFormatter.format(Math.round(topSegmentAmount))} per month\n`}
                                                    {`Late filing maximizes lifetime benefits`}
                                                </title>
                                            </g>
                                        )}

                                        {/* Label */}
                                        <text
                                            x={hybridX + barWidth / 2}
                                            y={baseY + 25}
                                            textAnchor="middle"
                                            fontSize="14"
                                            fontWeight="600"
                                            fill="#374151"
                                        >
                                            File at 62/70
                                        </text>

                                        {/* Description of hybrid strategy */}
                                        <text x={hybridX + barWidth / 2} y={baseY + 60} textAnchor="middle" fontSize="11" fill="#6B7280">
                                            Lower PIA files @ 62
                                        </text>
                                        <text x={hybridX + barWidth / 2} y={baseY + 75} textAnchor="middle" fontSize="11" fill="#6B7280">
                                            Higher PIA files @ 70
                                        </text>
                                    </>
                                );
                            })()}
                        </g>
                    )}

                    {/* Three scenario bars - shifted right when hybrid column is shown */}
                    {scenarios.map((scenario, i) => {
                        const barX = showHybridColumn
                            ? startX + (barWidth + barSpacing) + i * (barWidth + barSpacing)  // Shift right
                            : startX + i * (barWidth + barSpacing);
                        const totalHeight = getHeight(inflatedMonthlyNeeds);
                        const coveredHeight = getHeight(scenario.covered);
                        const gapHeight = getHeight(scenario.gap);
                        const isSelected = i === selectedStrategy;
                        const barOpacity = isSelected ? 1 : 0.1;

                        // Calculate percentages for this scenario
                        const scenarioCoveragePercent = inflatedMonthlyNeeds > 0
                            ? (scenario.covered / inflatedMonthlyNeeds * 100).toFixed(0)
                            : 0;
                        const scenarioGapPercent = inflatedMonthlyNeeds > 0
                            ? (scenario.gap / inflatedMonthlyNeeds * 100).toFixed(0)
                            : 0;

                        return (
                            <g key={`scenario-${i}`} className="flow-bar-group">
                                {/* Radio button */}
                                <circle
                                    cx={barX + barWidth / 2}
                                    cy={baseY - totalHeight - 30}
                                    r="8"
                                    fill="white"
                                    stroke={scenario.color}
                                    strokeWidth="2"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setSelectedStrategy(i)}
                                />
                                {isSelected && (
                                    <circle
                                        cx={barX + barWidth / 2}
                                        cy={baseY - totalHeight - 30}
                                        r="4"
                                        fill={scenario.color}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => setSelectedStrategy(i)}
                                    />
                                )}

                                {/* Covered portion (SS Income) */}
                                {scenario.covered > 0 && (
                                    <g>
                                        <rect
                                            x={barX}
                                            y={baseY - coveredHeight}
                                            width={barWidth}
                                            height={coveredHeight}
                                            fill={scenario.color}
                                            rx="8"
                                            opacity={barOpacity}
                                            className="flow-bar"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedStrategy(i)}
                                        />
                                        <title>
                                            {`${scenario.label}: SS Income Covers ${scenarioCoveragePercent}% of needs\n`}
                                            {`${currencyFormatter.format(Math.round(scenario.income))} per month\n`}
                                            {`SS income does the heavy lifting in retirement!`}
                                        </title>
                                    </g>
                                )}

                                {/* Gap portion (Unfunded) - GRAY */}
                                {scenario.gap > 0 && (
                                    <g>
                                        <rect
                                            x={barX}
                                            y={baseY - coveredHeight - gapHeight}
                                            width={barWidth}
                                            height={gapHeight}
                                            fill={gapColor}
                                            rx="8"
                                            opacity={barOpacity}
                                            className="flow-bar"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedStrategy(i)}
                                        />
                                        <title>
                                            {`${scenario.label}: ${scenarioGapPercent}% shortfall\n`}
                                            {`${currencyFormatter.format(Math.round(scenario.gap))} per month from savings\n`}
                                            {`Filing later reduces your savings burden!`}
                                        </title>
                                    </g>
                                )}

                                {/* Labels */}
                                <text
                                    x={barX + barWidth / 2}
                                    y={baseY + 25}
                                    textAnchor="middle"
                                    fontSize="14"
                                    fontWeight="600"
                                    fill="#374151"
                                >
                                    {scenario.label}
                                </text>

                                {/* SS Income amount */}
                                <text
                                    x={barX + barWidth / 2}
                                    y={baseY - coveredHeight / 2 - 8}
                                    textAnchor="middle"
                                    fill={scenario.color === SCENARIO_COLORS.preferred ? CHART_CHROME.ink : 'white'}
                                    fontSize="13"
                                    fontWeight="600"
                                    className="flow-text"
                                >
                                    SS: {currencyFormatter.format(Math.round(scenario.income))}
                                </text>

                                {/* Gap amount */}
                                {scenario.gap > 0 && gapHeight > 30 && (
                                    <text
                                        x={barX + barWidth / 2}
                                        y={baseY - coveredHeight - gapHeight / 2}
                                        textAnchor="middle"
                                        fill="#5C4A12"
                                        fontSize="12"
                                        fontWeight="600"
                                        className="flow-text"
                                    >
                                        Gap: {currencyFormatter.format(Math.round(scenario.gap))}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* Monthly needs reference bar on right - 50% taller for visual flow */}
                    {/* Split into covered portion (SS benefits) and shortfall portion (from savings) */}
                    {selectedScenario && (
                        <g>
                            {/* Covered portion (bottom) - deep dark burnt orange representing SS benefits */}
                            <rect
                                x={rightX}
                                y={baseY - (selectedScenario.covered / inflatedMonthlyNeeds) * targetHeight}
                                width={barWidth}
                                height={(selectedScenario.covered / inflatedMonthlyNeeds) * targetHeight}
                                fill={selectedScenario.color}
                                rx="8"
                                opacity="0.9"
                                className="flow-bar"
                            />
                            <title>
                                {`${coveragePercent}% covered by Social Security\n`}
                                {`${currencyFormatter.format(Math.round(selectedScenario.covered))} per month\n`}
                                {`SS provides reliable retirement income`}
                            </title>

                            {/* Shortfall portion (top) - salmon/coral representing gap that needs savings */}
                            {selectedScenario.gap > 0 && (
                                <g>
                                    <rect
                                        x={rightX}
                                        y={baseY - targetHeight}
                                        width={barWidth}
                                        height={(selectedScenario.gap / inflatedMonthlyNeeds) * targetHeight}
                                        fill={SIGNAL_COLORS.cautionSoft}
                                        rx="8"
                                        opacity="0.85"
                                        className="flow-bar"
                                    />
                                    <title>
                                        {`${gapPercent}% shortfall - must come from savings\n`}
                                        {`${currencyFormatter.format(Math.round(selectedScenario.gap))} per month\n`}
                                        {`Consider filing later to reduce this burden`}
                                    </title>
                                    {/* Shortfall amount label */}
                                    {((selectedScenario.gap / inflatedMonthlyNeeds) * targetHeight) > 40 && (
                                        <text
                                            x={rightX + barWidth / 2}
                                            y={baseY - targetHeight + ((selectedScenario.gap / inflatedMonthlyNeeds) * targetHeight) / 2}
                                            textAnchor="middle"
                                            fill="#5C4A12"
                                            fontSize="13"
                                            fontWeight="600"
                                            className="flow-text"
                                        >
                                            {currencyFormatter.format(Math.round(selectedScenario.gap))}
                                        </text>
                                    )}
                                </g>
                            )}

                            {/* Labels above the column - stacked with clear hierarchy */}
                            <text x={rightX + barWidth / 2} y={labelY1} textAnchor="middle" fontSize={Math.round(16 * labelScale)} fontWeight="700" fill="#374151">
                                Target
                            </text>
                            <text x={rightX + barWidth / 2} y={labelY2} textAnchor="middle" fontSize={Math.round(13 * labelScale)} fontWeight="600" fill="#6B7280">
                                Monthly Expense Needs This Year
                            </text>
                            <text x={rightX + barWidth / 2} y={labelY3} textAnchor="middle" fontSize={Math.round(18 * labelScale)} fontWeight="700" fill="#374151">
                                {currencyFormatter.format(Math.round(inflatedMonthlyNeeds))}
                            </text>
                        </g>
                    )}

                    {/* Title labels - larger font */}
                    <text x={showHybridColumn ? startX + (barWidth * 4 + barSpacing * 3) / 2 : startX + (barWidth * 3 + barSpacing * 2) / 2} y={25} textAnchor="middle" fontSize="18" fontWeight="700" fill="#374151">
                        Filing Strategies
                    </text>
                </svg>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mt-4">
                {scenarios.map((scenario, i) => (
                    <div key={i} className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-600 mb-1">{scenario.label}</div>
                        <div className="text-sm">
                            <span className="text-gray-900 font-medium">Gap: </span>
                            <span className="font-bold" style={{ color: scenario.gap > 0 ? SIGNAL_COLORS.loss : SIGNAL_COLORS.gain }}>
                                {scenario.gap > 0 ? currencyFormatter.format(Math.round(scenario.gap)) : 'Covered!'}
                            </span>
                        </div>
                        {scenario.gap > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                                {((scenario.gap / inflatedMonthlyNeeds) * 100).toFixed(0)}% from savings
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Race Track Visualization Component - Animated Bar Chart Race
const RaceTrackVisualization = ({ scenarioData, activeRecordView, isMarried, inflationRate, currentAge }) => {
    // Hooks must come before any early returns
    const raceContainerRef = useRef(null);
    const [raceWidth, setRaceWidth] = useState(1200);
    const [raceContainerHeight, setRaceContainerHeight] = useState(600);
    useEffect(() => {
        if (!raceContainerRef.current) return;
        const el = raceContainerRef.current;
        const update = () => {
            const w = el.clientWidth || 1200;
            const computedW = Math.max(900, Math.min(1400, w - 48));
            setRaceWidth(computedW);
            const h = el.clientHeight || 600;
            setRaceContainerHeight(h);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const [currentRaceAge, setCurrentRaceAge] = useState(62);
    const [isPlaying, setIsPlaying] = useState(false);
    const [raceViewMode, setRaceViewMode] = useState('cumulative'); // 'monthly' or 'cumulative'
    const [showSince70, setShowSince70] = useState(true);

    // Calculate fixed max value - MUST be at top level before any conditional logic
    const maxValue = useMemo(() => {
        if (!scenarioData) return 1000000;

        const allAges = Array.from({ length: 95 - 62 + 1 }, (_, i) => 62 + i);

        const allValues = allAges.flatMap(age => {
            const effectiveBirthYear = (activeRecordView === 'spouse' && scenarioData.birthYearSpouse)
                ? scenarioData.birthYearSpouse
                : scenarioData.birthYearPrimary;
            const calendarYear = effectiveBirthYear + age;
            const projections = activeRecordView === 'primary'
                ? scenarioData.primaryProjections
                : activeRecordView === 'spouse' && scenarioData.spouseProjections
                    ? scenarioData.spouseProjections
                    : scenarioData.combinedProjections;

            if (raceViewMode === 'monthly') {
                return [
                    projections.age62.monthly[calendarYear] || 0,
                    projections.preferred.monthly[calendarYear] || 0,
                    projections.age70.monthly[calendarYear] || 0
                ];
            } else {
                const values = [
                    projections.age62.cumulative[calendarYear] || 0,
                    projections.preferred.cumulative[calendarYear] || 0,
                    projections.age70.cumulative[calendarYear] || 0
                ];
                if (age >= 70) {
                    values.push(
                        (projections.age62.cumulative[calendarYear] || 0) - (projections.age62.cumulative[effectiveBirthYear + 69] || 0),
                        (projections.preferred.cumulative[calendarYear] || 0) - (projections.preferred.cumulative[effectiveBirthYear + 69] || 0),
                        (projections.age70.cumulative[calendarYear] || 0) - (projections.age70.cumulative[effectiveBirthYear + 69] || 0)
                    );
                }
                return values;
            }
        });

        return Math.max(...allValues) * 1.1;
    }, [raceViewMode, scenarioData, activeRecordView]);

    // Animation effect - must be called before any conditional returns
    useEffect(() => {
        if (!isPlaying || !scenarioData) return;

        // 60 seconds total for ages 62-95 (33 years)
        // Base interval: 60000ms / 33 ages = ~1818ms per age
        const baseInterval = (60000 / 33);

        const timer = setInterval(() => {
            setCurrentRaceAge(prev => {
                if (prev >= 95) {
                    setIsPlaying(false);
                    // Stay at 95, don't auto-reset
                    return 95;
                }
                return prev + 1;
            });
        }, baseInterval);

        return () => clearInterval(timer);
    }, [isPlaying, scenarioData]);

    // Handle play button click - reset if at end
    const handlePlayClick = () => {
        if (currentRaceAge === 95 && !isPlaying) {
            // Reset to beginning before playing
            setCurrentRaceAge(62);
            setTimeout(() => setIsPlaying(true), 100);
        } else {
            setIsPlaying(!isPlaying);
        }
    };

    if (!scenarioData) {
        return <div className="h-full flex items-center justify-center text-gray-500">Loading...</div>;
    }

    const { primaryProjections, spouseProjections, combinedProjections, birthYearPrimary } = scenarioData;

    // Determine which projections to use based on view
    const projections = activeRecordView === 'primary'
        ? primaryProjections
        : activeRecordView === 'spouse' && spouseProjections
            ? spouseProjections
            : combinedProjections;

    // Use the correct birth year for calendar year lookup based on whose projections we're viewing
    const effectiveBirthYear = (activeRecordView === 'spouse' && scenarioData.birthYearSpouse)
        ? scenarioData.birthYearSpouse
        : birthYearPrimary;

    // Calculate data for all ages and scenarios
    const calculateRaceData = (age) => {
        const calendarYear = effectiveBirthYear + age;

        if (raceViewMode === 'monthly') {
            // Monthly view: Just show 3 bars with monthly income
            const scenarios = [
                {
                    name: 'File at 62',
                    value: projections.age62.monthly[calendarYear] || 0,
                    color: SCENARIO_COLORS.age62
                },
                {
                    name: 'File at 67',
                    value: projections.preferred.monthly[calendarYear] || 0,
                    color: SCENARIO_COLORS.preferred
                },
                {
                    name: 'File at 70',
                    value: projections.age70.monthly[calendarYear] || 0,
                    color: SCENARIO_COLORS.age70
                }
            ];

            // Sort by value descending (highest at top)
            return scenarios.sort((a, b) => b.value - a.value);
        }

        // Cumulative view: Show 6 bars (Total + Since 70 for each strategy)
        const scenarios = [];

        // File at 62 - Total cumulative
        const age62Value = projections.age62.cumulative[calendarYear] || 0;
        // Use age 69 as baseline so age 70 includes the first year of benefits
        const age62Since70 = age >= 70 ? age62Value - (projections.age62.cumulative[effectiveBirthYear + 69] || 0) : 0;

        scenarios.push({
            name: 'File at 62 - Total',
            value: age62Value,
            color: SCENARIO_COLORS.age62,
            isSince70: false
        });

        if (showSince70 && age >= 70) {
            scenarios.push({
                name: 'File at 62 - Since 70',
                value: age62Since70,
                color: SCENARIO_TINTS.age62,
                isSince70: true
            });
        }

        // File at 67 (FRA) - Total cumulative
        const age67Value = projections.preferred.cumulative[calendarYear] || 0;
        // Use age 69 as baseline so age 70 includes the first year of benefits
        const age67Since70 = age >= 70 ? age67Value - (projections.preferred.cumulative[effectiveBirthYear + 69] || 0) : 0;

        scenarios.push({
            name: 'File at 67 - Total',
            value: age67Value,
            color: SCENARIO_COLORS.preferred,
            isSince70: false
        });

        if (showSince70 && age >= 70) {
            scenarios.push({
                name: 'File at 67 - Since 70',
                value: age67Since70,
                color: SCENARIO_TINTS.preferred,
                isSince70: true
            });
        }

        // File at 70 - Total cumulative
        const age70Value = projections.age70.cumulative[calendarYear] || 0;
        // Use age 69 as baseline so age 70 includes the first year of benefits
        const age70Since70 = age >= 70 ? age70Value - (projections.age70.cumulative[effectiveBirthYear + 69] || 0) : 0;

        scenarios.push({
            name: 'File at 70 - Total',
            value: age70Value,
            color: SCENARIO_COLORS.age70,
            isSince70: false
        });

        if (showSince70 && age >= 70) {
            scenarios.push({
                name: 'File at 70 - Since 70',
                value: age70Since70,
                color: SCENARIO_TINTS.age70,
                isSince70: true
            });
        }

        // Sort by value descending (highest at top)
        return scenarios.sort((a, b) => b.value - a.value);
    };

    const raceData = calculateRaceData(currentRaceAge);

    const width = raceWidth;
    // Compute bar height/spacing based on available vertical space so all 6 bars fit
    const numBars = raceData.length;
    const paddingTopForHeader = 110; // room for Play/Age header above SVG
    const paddingBottom = 80;
    const barsArea = Math.max(320, raceContainerHeight - paddingTopForHeader - paddingBottom);
    const barSpacing = Math.max(10, Math.min(18, Math.floor(barsArea / (numBars * 8))));
    const barHeight = Math.max(32, Math.min(60, Math.floor((barsArea - ((numBars - 1) * barSpacing)) / numBars)));
    const leftMargin = Math.max(200, Math.round(width * 0.16)); // Enough space for full label text
    const rightMargin = Math.max(450, Math.round(width * 0.32)); // More space for Gap Tracker
    const topMargin = 20;
    const height = topMargin + (numBars * (barHeight + barSpacing)) + 100;

    const getBarWidth = (value) => {
        return ((value / maxValue) * (width - leftMargin - rightMargin));
    };

    return (
        <div className="h-full flex flex-col p-4">
            {/* Age Display, Play Button, and View Toggle at Top */}
            <div className="flex items-center justify-center gap-4">
                {/* Navigation triangles - simple, no background */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => {
                            setIsPlaying(false);
                            setCurrentRaceAge(prev => Math.max(62, prev - 1));
                        }}
                        className={`text-xl transition-colors ${currentRaceAge <= 62
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-500 hover:text-gray-700 cursor-pointer'
                            }`}
                        title="Go back one year"
                        disabled={currentRaceAge <= 62}
                    >
                        ◀
                    </button>
                    <button
                        onClick={() => {
                            setIsPlaying(false);
                            setCurrentRaceAge(prev => Math.min(95, prev + 1));
                        }}
                        className={`text-xl transition-colors ${currentRaceAge >= 95
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-500 hover:text-gray-700 cursor-pointer'
                            }`}
                        title="Go forward one year"
                        disabled={currentRaceAge >= 95}
                    >
                        ▶
                    </button>
                </div>
                <button
                    onClick={handlePlayClick}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
                >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <div className="text-center">
                    <div className="text-5xl font-bold text-gray-900">
                        {(() => {
                            if (!scenarioData) return currentRaceAge;
                            const primaryAge = currentRaceAge;
                            const spouseBirthYear = isMarried && scenarioData.birthYearSpouse ? scenarioData.birthYearSpouse : null;
                            const primaryBirthYear = scenarioData.birthYearPrimary;

                            if (isMarried && spouseBirthYear) {
                                const spouseAge = currentRaceAge + (primaryBirthYear - spouseBirthYear);
                                return formatCoupleAges(primaryAge, spouseAge);
                            }
                            return `${primaryAge}`;
                        })()}
                    </div>
                    <div className="text-xs font-semibold text-gray-600">Current Age</div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-lg shadow-md border border-gray-300 p-1">
                    <button
                        onClick={() => setRaceViewMode('cumulative')}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${raceViewMode === 'cumulative'
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        Cumulative
                    </button>
                    <button
                        onClick={() => setRaceViewMode('monthly')}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${raceViewMode === 'monthly'
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        Monthly
                    </button>
                </div>
            </div>

            {/* Title and subtitle - positioned between controls and SVG */}
            <div className="text-center mt-1 mb-2">
                <h3 className="text-xl font-bold text-gray-900">
                    Filing Strategy Race: {raceViewMode === 'cumulative' ? 'Cumulative Benefits' : 'Monthly Benefits'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                    {isMarried
                        ? 'Comparing what happens if both spouses file at 62, at their preferred ages, or at 70'
                        : raceViewMode === 'cumulative'
                            ? 'Watching benefits accumulate over time'
                            : 'Comparing monthly income at each age'}
                </p>
            </div>

            {/* Race Track Visualization */}
            <div ref={raceContainerRef} className="flex-1 flex items-center justify-center overflow-auto">
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                    <style>
                        {`
                            .race-bar {
                                transition: all 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
                            }
                            .race-bar:hover {
                                opacity: 0.8;
                            }
                            .revenue-line {
                                stroke-width: 3;
                                stroke-dasharray: 5, 5;
                                transition: all 0.3s ease-in-out;
                            }
                        `}
                    </style>


                    {/* Bars - Conditional rendering based on view mode */}
                    {raceViewMode === 'monthly' ? (
                        /* Monthly View: Vertical bars growing from bottom */
                        (() => {
                            const availableWidth = width - leftMargin - rightMargin;
                            const barWidth = Math.min(120, availableWidth / 5); // Width for each vertical bar
                            const barSpacing = (availableWidth - (3 * barWidth)) / 4; // Equal spacing
                            const baseY = height - 140; // More space at bottom for title
                            const maxBarHeight = height - topMargin - 160; // Constrain to fit within SVG bounds

                            const result = raceData.map((scenario, index) => {
                                const barX = leftMargin + barSpacing + (index * (barWidth + barSpacing));
                                const barHeightValue = (scenario.value / maxValue) * maxBarHeight;

                                return (
                                    <g key={scenario.name}>
                                        {/* Vertical bar growing from bottom */}
                                        <rect
                                            x={barX}
                                            y={baseY - barHeightValue}
                                            width={barWidth}
                                            height={barHeightValue}
                                            fill={scenario.color}
                                            rx="8"
                                            className="race-bar"
                                        >
                                            <title>{`${scenario.name}: ${currencyFormatter.format(Math.round(scenario.value))}`}</title>
                                        </rect>

                                        {/* Strategy label (bottom) */}
                                        <text
                                            x={barX + barWidth / 2}
                                            y={baseY + 25}
                                            textAnchor="middle"
                                            fontSize="16"
                                            fontWeight="600"
                                            fill="#374151"
                                        >
                                            {scenario.name}
                                        </text>

                                        {/* Value label (top of bar) */}
                                        <text
                                            x={barX + barWidth / 2}
                                            y={baseY - barHeightValue - 10}
                                            textAnchor="middle"
                                            fontSize="14"
                                            fontWeight="700"
                                            fill="#374151"
                                        >
                                            {currencyFormatter.format(Math.round(scenario.value))}
                                        </text>
                                    </g>
                                );
                            });

                            // Add title at bottom
                            return (
                                <>
                                    {result}
                                </>
                            );
                        })()
                    ) : (
                        /* Cumulative View: Horizontal bars (existing) */
                        raceData.map((scenario, index) => {
                            const y = topMargin + index * (barHeight + barSpacing);
                            const barWidth = getBarWidth(scenario.value);

                            return (
                                <g key={scenario.name}>
                                    {/* Bar background */}
                                    <rect
                                        x={leftMargin}
                                        y={y}
                                        width={width - leftMargin - rightMargin}
                                        height={barHeight}
                                        fill="#F3F4F6"
                                        rx="8"
                                    />

                                    {/* Animated bar */}
                                    <rect
                                        x={leftMargin}
                                        y={y}
                                        width={barWidth}
                                        height={barHeight}
                                        fill={scenario.color}
                                        rx="8"
                                        className="race-bar"
                                    >
                                        <title>{`${scenario.name}: ${currencyFormatter.format(Math.round(scenario.value))}`}</title>
                                    </rect>

                                    {/* Strategy label (left) */}
                                    <text
                                        x={leftMargin - 10}
                                        y={y + barHeight / 2}
                                        textAnchor="end"
                                        alignmentBaseline="middle"
                                        fontSize="16"
                                        fontWeight="600"
                                        fill="#374151"
                                    >
                                        {scenario.name}
                                    </text>

                                    {/* Value label (inside bar or at end) */}
                                    <text
                                        x={leftMargin + barWidth + 10}
                                        y={y + barHeight / 2}
                                        textAnchor="start"
                                        alignmentBaseline="middle"
                                        fontSize="14"
                                        fontWeight="700"
                                        fill="#374151"
                                    >
                                        {currencyFormatter.format(Math.round(scenario.value))}
                                    </text>

                                </g>
                            );
                        })
                    )}

                    {/* "Since 70" Checkbox - Positioned below the last bar */}
                    {raceViewMode === 'cumulative' && (() => {
                        const bottomOfList = topMargin + (numBars - 1) * (barHeight + barSpacing) + barHeight;

                        return (
                            <foreignObject x={leftMargin} y={bottomOfList + 10} width={200} height={30}>
                                <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center gap-2 h-full">
                                    <input
                                        type="checkbox"
                                        checked={showSince70}
                                        onChange={(e) => setShowSince70(e.target.checked)}
                                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                        id="showSince70CheckSvg"
                                    />
                                    <label htmlFor="showSince70CheckSvg" className="text-sm font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700">
                                        Show Since 70
                                    </label>
                                </div>
                            </foreignObject>
                        );
                    })()}

                    {/* Dynamic Difference Tracker - Right Side */}
                    {(() => {
                        const topValue = raceData[0]?.value || 0;
                        const bottomValue = raceData[raceData.length - 1]?.value || 0;
                        const difference = topValue - bottomValue;
                        const topName = raceData[0]?.name || '';
                        const bottomName = raceData[raceData.length - 1]?.name || '';

                        // Position for the difference box - adapt to container width and height
                        const boxWidth = Math.min(340, Math.max(240, width * 0.22));
                        const boxX = width - boxWidth - 30;
                        const boxPadding = 10;
                        const boxHeight = Math.min(400, height - boxPadding * 2);
                        const boxY = boxPadding;
                        // Scale factor for internal text positions (designed for 400px)
                        const s = boxHeight / 400;

                        return (
                            <g>
                                {/* Background box */}
                                <rect
                                    x={boxX}
                                    y={boxY}
                                    width={boxWidth}
                                    height={boxHeight}
                                    fill={difference >= 0 ? SIGNAL_COLORS.gainSoft : SIGNAL_COLORS.lossSoft}
                                    stroke={difference >= 0 ? SIGNAL_COLORS.gain : SIGNAL_COLORS.loss}
                                    strokeWidth="3"
                                    rx="12"
                                />

                                {/* Title */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 40 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(24 * s)}
                                    fontWeight="700"
                                    fill="#374151"
                                >
                                    Gap Tracker
                                </text>

                                {/* Top vs Bottom label */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 70 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(18 * s)}
                                    fill="#6B7280"
                                >
                                    1st - Last
                                </text>

                                {/* Difference amount */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 130 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(36 * s)}
                                    fontWeight="700"
                                    fill={difference >= 0 ? SIGNAL_COLORS.gain : SIGNAL_COLORS.loss}
                                >
                                    {difference >= 0 ? '+' : ''}{currencyFormatter.format(Math.round(difference))}
                                </text>

                                {/* Leader info */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 185 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(18 * s)}
                                    fill={SIGNAL_COLORS.gain}
                                    fontWeight="600"
                                >
                                    🏆 {topName.replace(' - Total', '')}
                                </text>

                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 215 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(20 * s)}
                                    fill={SIGNAL_COLORS.gain}
                                    fontWeight="700"
                                >
                                    {currencyFormatter.format(Math.round(topValue))}
                                </text>

                                {/* Last place info */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 255 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(18 * s)}
                                    fill={SIGNAL_COLORS.loss}
                                    fontWeight="600"
                                >
                                    {bottomName.replace(' - Total', '')}
                                </text>

                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 285 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(20 * s)}
                                    fill={SIGNAL_COLORS.loss}
                                    fontWeight="700"
                                >
                                    {currencyFormatter.format(Math.round(bottomValue))}
                                </text>

                                {/* Separator line */}
                                <line
                                    x1={boxX + 20}
                                    y1={boxY + 310 * s}
                                    x2={boxX + boxWidth - 20}
                                    y2={boxY + 310 * s}
                                    stroke="#9CA3AF"
                                    strokeWidth="2"
                                    strokeDasharray="5,5"
                                />

                                {/* Difference calculation at bottom */}
                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 340 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(16 * s)}
                                    fill="#6B7280"
                                    fontWeight="700"
                                >
                                    {raceViewMode === 'monthly' ? 'Annual Difference: 1st to Last' : 'Difference: 1st to Last'}
                                </text>

                                <text
                                    x={boxX + boxWidth / 2}
                                    y={boxY + 375 * s}
                                    textAnchor="middle"
                                    fontSize={Math.round(32 * s)}
                                    fontWeight="700"
                                    fill={difference >= 0 ? SIGNAL_COLORS.gain : SIGNAL_COLORS.loss}
                                >
                                    {difference >= 0 ? '+' : ''}{currencyFormatter.format(Math.round(raceViewMode === 'monthly' ? difference * 12 : difference))}
                                </text>
                            </g>
                        );
                    })()}

                </svg>
            </div>

            {/* Summary stats - group by strategy */}
            <div className="mt-2 grid grid-cols-3 gap-4">
                {/* File at 62 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: SCENARIO_COLORS.age62 }}></div>
                        <div className="text-sm font-bold text-gray-700">File at 62</div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm">
                            <span className="text-gray-600">Total: </span>
                            <span className="font-bold text-gray-900">
                                {currencyFormatter.format(Math.round(projections.age62.cumulative[effectiveBirthYear + currentRaceAge] || 0))}
                            </span>
                        </div>
                        {currentRaceAge >= 70 && (
                            <div className="text-sm">
                                <span className="text-gray-600">Since 70: </span>
                                <span className="font-semibold text-gray-700">
                                    {currencyFormatter.format(Math.round((projections.age62.cumulative[effectiveBirthYear + currentRaceAge] || 0) - (projections.age62.cumulative[effectiveBirthYear + 69] || 0)))}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* File at 67 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: SCENARIO_COLORS.preferred }}></div>
                        <div className="text-sm font-bold text-gray-700">File at 67</div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm">
                            <span className="text-gray-600">Total: </span>
                            <span className="font-bold text-gray-900">
                                {currencyFormatter.format(Math.round(projections.preferred.cumulative[effectiveBirthYear + currentRaceAge] || 0))}
                            </span>
                        </div>
                        {currentRaceAge >= 70 && (
                            <div className="text-sm">
                                <span className="text-gray-600">Since 70: </span>
                                <span className="font-semibold text-gray-700">
                                    {currencyFormatter.format(Math.round((projections.preferred.cumulative[effectiveBirthYear + currentRaceAge] || 0) - (projections.preferred.cumulative[effectiveBirthYear + 69] || 0)))}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* File at 70 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded" style={{ backgroundColor: SCENARIO_COLORS.age70 }}></div>
                        <div className="text-sm font-bold text-gray-700">File at 70</div>
                        {raceData[0] && raceData[0].name.includes('File at 70') && <span className="ml-auto text-sm font-bold" style={{ color: SCENARIO_INK.age70 }}>🏆 Leading</span>}
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm">
                            <span className="text-gray-600">Total: </span>
                            <span className="font-bold text-gray-900">
                                {currencyFormatter.format(Math.round(projections.age70.cumulative[effectiveBirthYear + currentRaceAge] || 0))}
                            </span>
                        </div>
                        {currentRaceAge >= 70 && (
                            <div className="text-sm">
                                <span className="text-gray-600">Since 70: </span>
                                <span className="font-semibold text-gray-700">
                                    {currencyFormatter.format(Math.round((projections.age70.cumulative[effectiveBirthYear + currentRaceAge] || 0) - (projections.age70.cumulative[effectiveBirthYear + 69] || 0)))}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const tooltipLabelFormatter = (context) => {
    const datasetLabel = context.dataset?.label ? `${context.dataset.label}: ` : '';
    const value = context.parsed?.y ?? context.raw ?? 0;
    return `${datasetLabel}${currencyFormatter.format(Math.round(value))}`;
};

const formatCurrencyTick = (value) => `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const CHART_PADDING = { left: 60, right: 30, top: 10, bottom: 10 };

// Helper function to format ages with oldest first - defined outside component
const formatCoupleAges = (primaryAge, spouseAge) => {
    if (primaryAge === spouseAge) {
        return `${primaryAge}`;
    }
    // Show oldest first, youngest second
    const older = Math.max(primaryAge, spouseAge);
    const younger = Math.min(primaryAge, spouseAge);
    return `${older}/${younger}`;
};

const ShowMeTheMoneyCalculator = () => {
    const navigate = useNavigate();

    // Get user context data
    const { user, profile: realProfile, partners: realPartners, preferences: realPreferences, updateProfile, updatePartner, updatePreferences } = useUser();
    const { isDevMode, devProfile, devPartners, updateDevProfile, updateDevPartner } = useDevMode();

    // Use dev or real data based on mode
    const profile = isDevMode ? devProfile : realProfile;
    const partners = isDevMode ? devPartners : realPartners;
    const preferences = isDevMode ? null : realPreferences;

    // Initialize state from profile data
    const getInitialMarriedState = () => {
        if (!profile) return false;
        return ['married', 'divorced', 'widowed'].includes(profile.relationship_status);
    };

    const getInitialSpouse1Dob = () => {
        if (profile?.date_of_birth) return profile.date_of_birth;
        return '1965-02-03';
    };

    const getInitialSpouse2Dob = () => {
        if (partners && partners.length > 0 && partners[0].date_of_birth) {
            return partners[0].date_of_birth;
        }
        return '1965-06-18';
    };

    // Persistence hook for calculator settings - ALL user inputs
    const { state: persistedState, setState: setPersistedState, isLoaded } = useCalculatorPersistence('showMeTheMoney', {
        isMarried: getInitialMarriedState(),
        spouse1Dob: getInitialSpouse1Dob(),
        spouse1Pia: '',
        spouse1PreferredYear: 67,
        spouse1PreferredMonth: 0,
        spouse2Dob: getInitialSpouse2Dob(),
        spouse2Pia: '',
        spouse2PreferredYear: 65,
        spouse2PreferredMonth: 0,
        inflation: 0.025,
        goGoEndAge: 75,
        slowGoEndAge: 85,
        spouseGoGoEndAge: 75,
        spouseSlowGoEndAge: 85,
        monthlyNeeds: 7000,
        flowAge: 70,
        bubbleAge: 70
    });

    // All scenario-defining inputs live in a single reducer. View state
    // (sidebar, chart view, modals, drag flags, svg dimensions) stays in useState.
    const [scenario, dispatch] = useReducer(
        scenarioReducer,
        undefined,
        () => createScenario({
            isMarried: getInitialMarriedState(),
            spouse1Dob: getInitialSpouse1Dob(),
            spouse2Dob: getInitialSpouse2Dob()
        })
    );

    // Shadow bindings: every name below already appears throughout this file.
    // Re-exposing them here keeps the JSX below unchanged.
    const {
        isMarried, spouse1Dob, spouse1Pia, spouse1PreferredYear, spouse1PreferredMonth,
        // "Already filed" fields exist in the scenario schema (scenario.js) for a spouse who
        // started claiming before using this calculator, but no UI/logic here reads them yet.
        // eslint-disable-next-line no-unused-vars
        spouse1AlreadyFiled, spouse1CurrentBenefit, spouse1FiledAge,
        spouse2Dob, spouse2Pia, spouse2PreferredYear, spouse2PreferredMonth,
        // eslint-disable-next-line no-unused-vars
        spouse2AlreadyFiled, spouse2CurrentBenefit, spouse2FiledAge,
        inflation, prematureDeath, deathAge, piaStrategy,
        goGoEndAge, slowGoEndAge, spouseGoGoEndAge, spouseSlowGoEndAge,
        monthlyNeeds, flowAge, bubbleAge
    } = scenario;

    // Memoized so each setter keeps a stable identity across renders, matching the
    // useState setters these replaced. This matters: several are passed as props
    // into child dependency arrays (RetirementStagesSlider's mousemove/mouseup
    // listener effect), where a fresh identity each render would tear down and
    // re-add the document listeners on every parent re-render. `dispatch` is
    // referentially stable, so the cache is safe to build once.
    const setScenarioField = useMemo(() => {
        const cache = {};
        return (field) => {
            if (!cache[field]) {
                cache[field] = (value) => dispatch({ type: 'SET_FIELD', field, value });
            }
            return cache[field];
        };
    }, []);

    const setIsMarried = setScenarioField('isMarried');
    const setSpouse1Dob = setScenarioField('spouse1Dob');
    const setSpouse1Pia = setScenarioField('spouse1Pia');
    const setSpouse1PreferredYear = setScenarioField('spouse1PreferredYear');
    const setSpouse1PreferredMonth = setScenarioField('spouse1PreferredMonth');
    // Setters for the not-yet-wired "already filed" fields (see destructuring comment above)
    /* eslint-disable no-unused-vars */
    const setSpouse1AlreadyFiled = setScenarioField('spouse1AlreadyFiled');
    const setSpouse1CurrentBenefit = setScenarioField('spouse1CurrentBenefit');
    const setSpouse1FiledAge = setScenarioField('spouse1FiledAge');
    /* eslint-enable no-unused-vars */
    const setSpouse2Dob = setScenarioField('spouse2Dob');
    const setSpouse2Pia = setScenarioField('spouse2Pia');
    const setSpouse2PreferredYear = setScenarioField('spouse2PreferredYear');
    const setSpouse2PreferredMonth = setScenarioField('spouse2PreferredMonth');
    /* eslint-disable no-unused-vars */
    const setSpouse2AlreadyFiled = setScenarioField('spouse2AlreadyFiled');
    const setSpouse2CurrentBenefit = setScenarioField('spouse2CurrentBenefit');
    const setSpouse2FiledAge = setScenarioField('spouse2FiledAge');
    /* eslint-enable no-unused-vars */
    const setInflation = setScenarioField('inflation');
    const setPrematureDeath = setScenarioField('prematureDeath');
    const setDeathAge = setScenarioField('deathAge');
    const setPiaStrategy = setScenarioField('piaStrategy');
    const setGoGoEndAge = setScenarioField('goGoEndAge');
    const setSlowGoEndAge = setScenarioField('slowGoEndAge');
    const setSpouseGoGoEndAge = setScenarioField('spouseGoGoEndAge');
    const setSpouseSlowGoEndAge = setScenarioField('spouseSlowGoEndAge');
    const setMonthlyNeeds = setScenarioField('monthlyNeeds');
    const setFlowAge = setScenarioField('flowAge');
    const setBubbleAge = setScenarioField('bubbleAge');

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Load any stored earnings record(s) on mount / sign-in. Dev Mode has no
    // Supabase session, so getAuthToken() resolves null and this quietly no-ops
    // — the banner below simply stays in its default ESTIMATED state.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const token = await getAuthToken();
            if (cancelled) return;
            try {
                const records = token ? await fetchEarnings(token) : readDevEarnings();
                if (cancelled) return;
                if (records.spouse1) dispatch({ type: 'SET_EARNINGS', person: 'spouse1', record: records.spouse1 });
                if (records.spouse2) dispatch({ type: 'SET_EARNINGS', person: 'spouse2', record: records.spouse2 });
                const workshop = readWorkshopPia();
                for (const person of ['spouse1', 'spouse2']) {
                    const action = workshopPiaHydrationAction(person, workshop[person]);
                    if (action) dispatch(action);
                }
            } catch (error) {
                console.error('Could not load earnings records:', error);
            }
        })();

        return () => { cancelled = true; };
    }, [user]);

    // Work-stop ladder is derived display data computed from the verified
    // earnings record — it is not a scenario input, so it stays in useState
    // rather than the scenario reducer.
    const [workStopLadders, setWorkStopLadders] = useState({ spouse1: null, spouse2: null });

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const next = { spouse1: null, spouse2: null };
            for (const person of ['spouse1', 'spouse2']) {
                const record = scenario.earnings[person];
                if (!record) continue;
                const dob = person === 'spouse1' ? spouse1Dob : spouse2Dob;
                const birthYear = birthYearFromDob(dob) ?? record.birthYear;
                try {
                    next[person] = await fetchWorkStopLadder({
                        birthYear,
                        rows: record.rows,
                        stopAges: [62, 65, 67, 70]
                    });
                } catch (error) {
                    console.error(`Could not compute work-stop ladder for ${person}:`, error);
                }
            }
            if (!cancelled) setWorkStopLadders(next);
        })();

        return () => { cancelled = true; };
        // Nested earnings fields are the actual triggers; `scenario.earnings` identity is unstable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenario.earnings.spouse1, scenario.earnings.spouse2, spouse1Dob, spouse2Dob]);

    // Earnings-derived PIA from banked rows only. Profile DOB wins over the
    // year stored on the earnings record.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            for (const person of ['spouse1', 'spouse2']) {
                const record = scenario.earnings[person];
                if (!record) continue;
                const dob = person === 'spouse1' ? spouse1Dob : spouse2Dob;
                const birthYear = birthYearFromDob(dob) ?? record.birthYear;
                if (!birthYear) continue;
                try {
                    const result = await calculatePiaFromEarnings({
                        birthYear,
                        rows: record.rows
                    });
                    if (!cancelled) {
                        dispatch({ type: 'SET_DERIVED_PIA', person, pia: result.pia });
                    }
                } catch (error) {
                    console.error(`Could not derive PIA from earnings for ${person}:`, error);
                }
            }
        })();

        return () => { cancelled = true; };
        // Nested earnings fields are the actual triggers; `scenario.earnings` identity is unstable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenario.earnings.spouse1, scenario.earnings.spouse2, spouse1Dob, spouse2Dob]);

    // Track if we've loaded initial persisted state to prevent infinite loop
    const hasLoadedPersistedState = useRef(false);

    // Track previous server values to prevent overwriting local edits
    const lastProfilePia = useRef(null);
    const lastPartnerPia = useRef(null);
    const lastSpouse1PreferredYear = useRef(null);
    const lastSpouse1PreferredMonth = useRef(null);
    const lastSpouse2PreferredYear = useRef(null);
    const lastSpouse2PreferredMonth = useRef(null);

    // Load persisted state when it becomes available (only once on mount)
    useEffect(() => {
        if (isLoaded && persistedState && !hasLoadedPersistedState.current) {
            hasLoadedPersistedState.current = true;
            // DOB, relationship, and preferred ages remain profile-owned. A saved
            // typed PIA is used only as a fallback below when the profile has none.
            const restored = deserializeScenario(persistedState);
            [
                'inflation',
                'goGoEndAge',
                'slowGoEndAge',
                'spouseGoGoEndAge',
                'spouseSlowGoEndAge',
                'monthlyNeeds',
                'flowAge',
                'bubbleAge'
            ].forEach(field => {
                if (persistedState[field] !== undefined) {
                    dispatch({ type: 'SET_FIELD', field, value: restored[field] });
                }
            });
            // The saved plan's frozen assumptions must survive the reload too,
            // otherwise bendPointsYear re-stamps from the wall clock on every
            // mount and a plan saved in December reports January's tables.
            // RESTORE_META rather than LOAD: LOAD would also overwrite the
            // profile-owned fields listed above.
            dispatch({
                type: 'RESTORE_META',
                assumptions: restored.assumptions,
                schemaVersion: restored.schemaVersion
            });

            // Profile data remains authoritative, but a typed PIA that has only
            // reached calculator persistence must survive a trip to the PIA
            // Calculator. This fallback updates scenario state only.
            const profilePia = profile?.pia_at_fra ?? profile?.piaAtFra ?? profile?.own_pia ?? profile?.ownPia;
            const restoredSpouse1Pia = resolveEnteredPia(profilePia, restored.spouse1Pia);
            if (profilePia == null && restoredSpouse1Pia !== '') {
                dispatch({ type: 'SET_FIELD', field: 'spouse1Pia', value: restoredSpouse1Pia });
            }

            const partner = partners?.[0];
            const partnerPia = partner?.pia_at_fra ?? partner?.piaAtFra ?? partner?.pia;
            const restoredSpouse2Pia = resolveEnteredPia(partnerPia, restored.spouse2Pia);
            if (partnerPia == null && restoredSpouse2Pia !== '') {
                dispatch({ type: 'SET_FIELD', field: 'spouse2Pia', value: restoredSpouse2Pia });
            }
        }
    }, [isLoaded, persistedState, profile, partners]);

    // Force Sync with Profile/Partners Data
    // This ensures that if the user updates Onboarding, the calculator reflects it effectively.
    // Force Sync with Profile/Partners Data
    // This ensures that if the user updates Onboarding, the calculator reflects it effectively.
    useEffect(() => {
        if (!profile) return;

        // 1. Sync Marital Status
        const profileIsMarried = ['married', 'divorced', 'widowed'].includes(profile.relationship_status);
        if (isMarried !== profileIsMarried) {
            setIsMarried(profileIsMarried);
        }

        // 2. Sync Primary DOB
        const profileDob = profile.date_of_birth || profile.dateOfBirth;
        if (profileDob && profileDob !== spouse1Dob) {
            setSpouse1Dob(profileDob);
        }

        // 3. Sync Primary PIA
        const profilePia = profile.pia_at_fra ?? profile.piaAtFra ?? profile.own_pia ?? profile.ownPia;
        if (profilePia !== undefined && profilePia !== null) {
            // Only update local state if the SERVER value has changed from what we last saw
            // This prevents overwriting local edits when unrelated profile fields update
            if (lastProfilePia.current !== profilePia) {
                dispatch({ type: 'SET_FIELD', field: 'spouse1Pia', value: profilePia });
                lastProfilePia.current = profilePia;
            }
        }

        // 4. Sync Spouse Info
        if (partners && partners.length > 0) {
            const partner = partners[0];
            const partnerDob = partner.date_of_birth || partner.dateOfBirth;
            if (partnerDob && partnerDob !== spouse2Dob) {
                setSpouse2Dob(partnerDob);
            }

            const partnerPia = partner.pia_at_fra ?? partner.piaAtFra ?? partner.pia;
            if (partnerPia !== undefined && partnerPia !== null) {
                // Only update local state if the SERVER value has changed
                if (lastPartnerPia.current !== partnerPia) {
                    dispatch({ type: 'SET_FIELD', field: 'spouse2Pia', value: partnerPia });
                    lastPartnerPia.current = partnerPia;
                }
            }
        }

        // 5. Sync Preferred Ages (Primary)
        const pYear = profile.preferred_claiming_age_years ?? profile.preferredClaimingAgeYears;
        const pMonth = profile.preferred_claiming_age_months ?? profile.preferredClaimingAgeMonths;

        if (pYear !== undefined && pYear !== null) {
            if (lastSpouse1PreferredYear.current !== pYear) {
                dispatch({ type: 'SET_FIELD', field: 'spouse1PreferredYear', value: pYear });
                lastSpouse1PreferredYear.current = pYear;
            }
        }

        if (pMonth !== undefined && pMonth !== null) {
            if (lastSpouse1PreferredMonth.current !== pMonth) {
                dispatch({ type: 'SET_FIELD', field: 'spouse1PreferredMonth', value: pMonth });
                lastSpouse1PreferredMonth.current = pMonth;
            }
        }

        // 6. Sync Preferred Ages (Spouse - from Preferences)
        if (preferences) {
            const sYear = preferences.spouse_preferred_claiming_age_years ?? preferences.spousePreferredClaimingAgeYears;
            const sMonth = preferences.spouse_preferred_claiming_age_months ?? preferences.spousePreferredClaimingAgeMonths;

            if (sYear !== undefined && sYear !== null) {
                if (lastSpouse2PreferredYear.current !== sYear) {
                    dispatch({ type: 'SET_FIELD', field: 'spouse2PreferredYear', value: sYear });
                    lastSpouse2PreferredYear.current = sYear;
                }
            }

            if (sMonth !== undefined && sMonth !== null) {
                if (lastSpouse2PreferredMonth.current !== sMonth) {
                    dispatch({ type: 'SET_FIELD', field: 'spouse2PreferredMonth', value: sMonth });
                    lastSpouse2PreferredMonth.current = sMonth;
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile, partners, preferences]); // Dep on profile/partners strictly to avoid typing loops

    // Persist ALL state changes
    useEffect(() => {
        if (isLoaded) {
            setPersistedState(serializeScenario(scenario));
        }
    }, [scenario, isLoaded, setPersistedState]);

    const primaryFirstName = profile?.first_name?.trim() || profile?.firstName?.trim() || 'Bob';
    const spouseFirstName = partners?.[0]?.first_name?.trim() || partners?.[0]?.firstName?.trim() || 'Spouse';

    const longevityAsOfDate = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }, []);

    const longevityPeople = useMemo(() => {
        const primaryPersonId = profile?.id || user?.id || null;
        const partnerPersonId = partners?.[0]?.id || null;
        const saved = migrateLifeExpectancyPreferences({
            saved: preferences?.lifeExpectancy,
            primaryPersonId,
            partnerPersonId
        });
        const people = [];
        if (primaryPersonId) {
            people.push({
                personId: primaryPersonId,
                name: primaryFirstName,
                sex: saved.profilesByPersonId[primaryPersonId]?.sex || null,
                birthDate: spouse1Dob || profile?.date_of_birth || null,
                profile: saved.profilesByPersonId[primaryPersonId] || emptyLongevityProfile()
            });
        }
        if (isMarried && partnerPersonId) {
            people.push({
                personId: partnerPersonId,
                name: spouseFirstName,
                sex: saved.profilesByPersonId[partnerPersonId]?.sex || null,
                birthDate: spouse2Dob || partners[0]?.date_of_birth || null,
                profile: saved.profilesByPersonId[partnerPersonId] || emptyLongevityProfile()
            });
        }
        return people;
    }, [
        isMarried,
        partners,
        preferences,
        primaryFirstName,
        profile,
        spouse1Dob,
        spouse2Dob,
        spouseFirstName,
        user
    ]);

    const longevitySummary = useMemo(
        () => buildLongevitySummary({ people: longevityPeople, asOfDate: longevityAsOfDate }),
        [longevityPeople, longevityAsOfDate]
    );

    const projectionEndYear = Object.keys(longevitySummary.individuals || {}).length > 0
        ? longevitySummary.axisEndYear
        : undefined;

    // Whose earnings record we actually hold. The banner names the person
    // rather than implying the household is covered: a partner-only upload
    // must not read as verification of the primary's numbers.
    const hasSpouse1Earnings = Boolean(scenario.earnings.spouse1);
    const hasSpouse2Earnings = Boolean(scenario.earnings.spouse2);
    const earningsRecordPhrase = hasSpouse1Earnings && hasSpouse2Earnings
        ? `your and ${spouseFirstName}'s Social Security earnings records`
        : hasSpouse1Earnings
            ? 'your Social Security earnings record'
            : `${spouseFirstName}'s Social Security earnings record`;

    const usingEarningsForChart = (
        (hasSpouse1Earnings && scenario.piaSource.spouse1 === 'earnings' && scenario.derivedPia.spouse1 != null) ||
        (hasSpouse2Earnings && scenario.piaSource.spouse2 === 'earnings' && scenario.derivedPia.spouse2 != null)
    );
    const usingWorkshopForChart = (
        (scenario.piaSource.spouse1 === 'workshop' && scenario.workshopPia.spouse1 != null) ||
        (scenario.piaSource.spouse2 === 'workshop' && scenario.workshopPia.spouse2 != null)
    );
    const workshopThroughYear = ['spouse1', 'spouse2']
        .map((person) => scenario.piaSource[person] === 'workshop' ? scenario.workshopMeta[person]?.throughYear : null)
        .find((year) => year != null);
    const showPiaSourceBanner = scenario.provenance !== PROVENANCE.ESTIMATED || usingWorkshopForChart;
    const spouse1PiaField = piaFieldView(scenario, 'spouse1');
    const spouse2PiaField = piaFieldView(scenario, 'spouse2');

    const vintageNotes = ['spouse1', 'spouse2']
        .filter((person) => scenario.earnings[person])
        .map((person) => ({
            person,
            ...describeEarningsVintage({
                statementDate: scenario.earnings[person].statementDate,
                rows: scenario.earnings[person].rows
            })
        }))
        .filter((note) => note.message);

    const birthYearConflicts = ['spouse1', 'spouse2']
        .filter((person) => {
            const record = scenario.earnings[person];
            const dob = person === 'spouse1' ? spouse1Dob : spouse2Dob;
            const profileYear = birthYearFromDob(dob);
            return record && profileYear && record.birthYear && record.birthYear !== profileYear;
        })
        .map((person) => {
            const record = scenario.earnings[person];
            const dob = person === 'spouse1' ? spouse1Dob : spouse2Dob;
            const who = person === 'spouse1' ? primaryFirstName : spouseFirstName;
            return {
                person,
                message: `${who}'s earnings file says birth year ${record.birthYear}, but the profile uses ${birthYearFromDob(dob)}. We are using the profile date of birth for the PIA.`
            };
        });

    const ladderPeople = [
        hasSpouse1Earnings && workStopLadders.spouse1?.length
            ? { person: 'spouse1', label: primaryFirstName, rungs: workStopLadders.spouse1, record: scenario.earnings.spouse1 }
            : null,
        hasSpouse2Earnings && workStopLadders.spouse2?.length
            ? { person: 'spouse2', label: spouseFirstName, rungs: workStopLadders.spouse2, record: scenario.earnings.spouse2 }
            : null
    ].filter(Boolean);
    const relationshipStatus = profile?.relationship_status ?? profile?.relationshipStatus;
    const householdWorkStopRungs = householdWorkStopRungsForRelationship(
        relationshipStatus,
        workStopLadders
    );

    const [chartView, setChartView] = useState('monthly'); // monthly, cumulative, combined, earlyLate, post70, sscuts
    const [chartData, setChartData] = useState({ labels: [], datasets: [] });
    const [chartOptions, setChartOptions] = useState({});
    const [activeRecordView, setActiveRecordView] = useState('combined');
    const [showMonthlyCashflow, setShowMonthlyCashflow] = useState(false);
    // setPost70View unused: 'monthly'/'combined' view modes are read below (line ~2544+)
    // but there's no UI control yet to switch away from the 'cumulative' default.
    // eslint-disable-next-line no-unused-vars
    const [post70View, setPost70View] = useState('cumulative');
    const [ssCutYear, setSsCutYear] = useState(2034);
    const [ssCutPercentage, setSsCutPercentage] = useState(21);
    const [ssCutsActive, setSsCutsActive] = useState(false);
    const [ssCutsChartData, setSsCutsChartData] = useState(null);
    const [ssCutsSummary, setSsCutsSummary] = useState([]);
    const [ssCutsPayload, setSsCutsPayload] = useState(null);
    const [showSsCutInfo, setShowSsCutInfo] = useState(false);
    const [ssCutsAxisRanges, setSsCutsAxisRanges] = useState(null);
    const [selectedStrategy, setSelectedStrategy] = useState(2); // 0=62, 1=67, 2=70
    const [showPiaFraModal, setShowPiaFraModal] = useState(false);
    const [showPreferredFilingModal, setShowPreferredFilingModal] = useState(false);
    const [isDraggingGoGo, setIsDraggingGoGo] = useState(false);
    const [isDraggingSlowGo, setIsDraggingSlowGo] = useState(false);
    const [isDraggingSpouseGoGo, setIsDraggingSpouseGoGo] = useState(false);
    const [isDraggingSpouseSlowGo, setIsDraggingSpouseSlowGo] = useState(false);
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);

    // One Month at a Time modal state
    const [showOneMonthModal, setShowOneMonthModal] = useState(false);

    // Already Filed state now lives in the scenario reducer above
    const [showAlreadyFiledModal, setShowAlreadyFiledModal] = useState(false);
    // bubbleAge already declared above with other persistent state

    // "Show me just this year" feature
    const [showYearView, setShowYearView] = useState(false);
    const [selectedYearAge, setSelectedYearAge] = useState(70);
    const [animationKey, setAnimationKey] = useState(0);
    const [showYearModal, setShowYearModal] = useState(false);

    // Note: the profile/partners sync effect above already assigns isMarried,
    // spouse1Dob and spouse2Dob, so the two follow-up effects that used to live
    // here were exact duplicates and have been removed.

    useEffect(() => {
        if (!isMarried && activeRecordView === 'spouse') {
            setActiveRecordView('combined');
        }
    }, [isMarried, activeRecordView]);

    const formatAge = (dob) => {
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) {
            return '';
        }

        const now = new Date();
        let years = now.getFullYear() - birthDate.getFullYear();
        let months = now.getMonth() - birthDate.getMonth();

        if (now.getDate() < birthDate.getDate()) {
            months -= 1;
        }

        if (months < 0) {
            years -= 1;
            months += 12;
        }

        return `${years}y ${months}m`;
    };

    const chartSpouse1Pia = effectivePia(scenario, 'spouse1');
    const chartSpouse2Pia = effectivePia(scenario, 'spouse2');

    const scenarioData = useMemo(() => {
        const primaryEndYear = resolveProjectionEndYear(spouse1Dob, projectionEndYear);
        const primaryAge62 = calculateProjection({
            pia: chartSpouse1Pia,
            dob: spouse1Dob,
            filingYear: 62,
            filingMonth: 0,
            inflationRate: inflation,
            endYear: primaryEndYear
        });
        const primaryPreferred = calculateProjection({
            pia: chartSpouse1Pia,
            dob: spouse1Dob,
            filingYear: spouse1PreferredYear,
            filingMonth: spouse1PreferredMonth,
            inflationRate: inflation,
            endYear: primaryEndYear
        });
        const primaryAge70 = calculateProjection({
            pia: chartSpouse1Pia,
            dob: spouse1Dob,
            filingYear: 70,
            filingMonth: 0,
            inflationRate: inflation,
            endYear: primaryEndYear
        });

        const primaryProjections = {
            age62: primaryAge62,
            preferred: primaryPreferred,
            age70: primaryAge70
        };

        // Convert death age to calendar year based on primary person's birth year
        const primaryBirthYear = new Date(spouse1Dob).getFullYear();
        const deathYearNumber = primaryBirthYear + deathAge;

        const combineMonthlyProjection = (primaryScenario, spouseScenario) => combineProjections({
            primaryProjection: primaryScenario,
            spouseProjection: spouseScenario,
            isMarried,
            prematureDeath,
            deathYear: deathYearNumber
        });

        let spouseProjections = null;
        let combinedProjections = primaryProjections;

        if (isMarried) {
            const spouseEndYear = resolveProjectionEndYear(spouse2Dob, projectionEndYear);
            const spouseAge62 = calculateProjection({
                pia: chartSpouse2Pia,
                dob: spouse2Dob,
                filingYear: 62,
                filingMonth: 0,
                inflationRate: inflation,
                endYear: spouseEndYear
            });
            const spousePreferredScenario = calculateProjection({
                pia: chartSpouse2Pia,
                dob: spouse2Dob,
                filingYear: spouse2PreferredYear,
                filingMonth: spouse2PreferredMonth,
                inflationRate: inflation,
                endYear: spouseEndYear
            });
            const spouseAge70 = calculateProjection({
                pia: chartSpouse2Pia,
                dob: spouse2Dob,
                filingYear: 70,
                filingMonth: 0,
                inflationRate: inflation,
                endYear: spouseEndYear
            });

            spouseProjections = {
                age62: spouseAge62,
                preferred: spousePreferredScenario,
                age70: spouseAge70
            };

            combinedProjections = {
                age62: combineMonthlyProjection(primaryAge62, spouseAge62),
                preferred: combineMonthlyProjection(primaryPreferred, spousePreferredScenario),
                age70: combineMonthlyProjection(primaryAge70, spouseAge70)
            };

        }

        const primaryIsLowerPia = !isMarried || chartSpouse1Pia <= chartSpouse2Pia;

        let earlyLateProjection = primaryProjections.age62;
        let preferredLateProjection = primaryProjections.preferred;
        let bothLateProjection = primaryProjections.age70;
        let bothEarlyProjection = primaryProjections.age62;

        if (isMarried && spouseProjections) {
            // ALWAYS use optimal strategy: Lower PIA files at 62, Higher PIA files at 70
            // This maximizes delayed retirement credits on the higher benefit while providing
            // immediate income from the lower benefit

            if (primaryIsLowerPia) {
                // Primary has lower PIA - Primary files at 62, Spouse files at 70
                earlyLateProjection = combineMonthlyProjection(primaryProjections.age62, spouseProjections.age70);
                preferredLateProjection = combineMonthlyProjection(primaryProjections.preferred, spouseProjections.age70);
            } else {
                // Spouse has lower PIA - Spouse files at 62, Primary files at 70
                earlyLateProjection = combineMonthlyProjection(primaryProjections.age70, spouseProjections.age62);
                preferredLateProjection = combineMonthlyProjection(primaryProjections.age70, spouseProjections.preferred);
            }
            bothLateProjection = combineMonthlyProjection(primaryProjections.age70, spouseProjections.age70);
            bothEarlyProjection = combineMonthlyProjection(primaryProjections.age62, spouseProjections.age62);
        }

        const birthYearPrimary = new Date(spouse1Dob).getFullYear();
        const birthYearSpouse = isMarried ? new Date(spouse2Dob).getFullYear() : null;
        const displayAges = [62, 67, 70, 75, 80, 85, 90, 95];
        const primaryYears = displayAges.map(age => birthYearPrimary + age);
        const spouseYears = isMarried && birthYearSpouse ? displayAges.map(age => birthYearSpouse + age) : null;

        return {
            primaryProjections,
            spouseProjections,
            combinedProjections,
            earlyLateProjection,
            preferredLateProjection,
            bothLateProjection,
            bothEarlyProjection,
            birthYearPrimary,
            birthYearSpouse,
            primaryYears,
            spouseYears
        };
    }, [isMarried, spouse1Dob, chartSpouse1Pia, spouse1PreferredYear, spouse1PreferredMonth, spouse2Dob, chartSpouse2Pia, spouse2PreferredYear, spouse2PreferredMonth, inflation, prematureDeath, deathAge, projectionEndYear]);

    // Bubble Chart Data - Calculate 4% Rule Equivalents at selected age
    const bubbleChartData = useMemo(() => {
        if (!scenarioData) return null;

        const { primaryProjections, spouseProjections, combinedProjections, birthYearPrimary } = scenarioData;

        // Select the right projections based on view
        let projections = primaryProjections;
        let birthYear = birthYearPrimary;

        if (activeRecordView === 'spouse' && spouseProjections) {
            projections = spouseProjections;
            birthYear = scenarioData.birthYearSpouse;
        } else if (activeRecordView === 'combined') {
            projections = combinedProjections;
        }

        // Calculate year from age
        const currentYear = birthYear + bubbleAge;

        // Get monthly benefit at the selected age for filing at 62
        const age62Monthly = projections.age62?.monthly?.[currentYear] || 0;
        const age62Annual = age62Monthly * 12;
        const age62AssetEquiv = age62Annual / 0.04;

        // Get monthly benefit at the selected age for filing at 70
        const age70Monthly = projections.age70?.monthly?.[currentYear] || 0;
        const age70Annual = age70Monthly * 12;
        const age70AssetEquiv = age70Annual / 0.04;

        return {
            age62: {
                monthly: age62Monthly,
                annual: age62Annual,
                assetEquiv: age62AssetEquiv
            },
            age70: {
                monthly: age70Monthly,
                annual: age70Annual,
                assetEquiv: age70AssetEquiv
            }
        };
    }, [scenarioData, activeRecordView, bubbleAge]);

    useEffect(() => {
        if (!scenarioData) {
            setChartData({ labels: [], datasets: [] });
            setChartOptions({});
            return;
        }

        const {
            primaryProjections,
            spouseProjections,
            combinedProjections,
            earlyLateProjection,
            preferredLateProjection,
            bothLateProjection,
            birthYearPrimary,
            birthYearSpouse,
            primaryYears,
            spouseYears
        } = scenarioData;

        const projections =
            activeRecordView === 'primary'
                ? primaryProjections
                : activeRecordView === 'spouse' && spouseProjections
                    ? spouseProjections
                    : combinedProjections;

        let displayYearsForData = primaryYears;
        let labels = primaryYears.map(year => `Age ${year - birthYearPrimary}`);

        if (activeRecordView === 'spouse' && spouseYears) {
            displayYearsForData = spouseYears;
            labels = spouseYears.map(year => `Age ${year - birthYearSpouse}`);
        } else if (activeRecordView === 'combined' && isMarried && birthYearSpouse !== null) {
            displayYearsForData = primaryYears;
            labels = primaryYears.map(year => {
                const age1 = year - birthYearPrimary;
                const age2 = year - birthYearSpouse;
                return `Ages ${formatCoupleAges(age1, age2)}`;
            });
        }

        let newChartData;
        let newChartOptions;

        if (chartView === 'sscuts') {
            const comparisonLabel = ssCutsActive ? 'Projected Cuts Applied' : 'Baseline (No Cuts)';
            newChartData = ssCutsChartData || { labels: [], datasets: [] };

            // Build scales with fixed ranges if available
            let yMonthlyScale = {
                type: 'linear',
                display: true,
                position: 'left',
                title: { text: 'Monthly Benefit ($)', display: true },
                ticks: {
                    callback: formatCurrencyTick,
                    precision: 0
                },
                bounds: 'data'
            };

            // Apply fixed ranges if they exist - FORCE the axis limits
            if (ssCutsAxisRanges) {
                console.log('Applying fixed Y-axis ranges:', ssCutsAxisRanges);
                const monthlyMin = ssCutsAxisRanges.monthly.min;
                const monthlyMax = ssCutsAxisRanges.monthly.max;

                yMonthlyScale.min = monthlyMin;
                yMonthlyScale.max = monthlyMax;
                yMonthlyScale.beginAtZero = false;
            } else {
                console.log('No ssCutsAxisRanges found');
            }

            newChartOptions = {
                plugins: {
                    title: { display: true, text: `SS Reserve Fund Cuts – ${comparisonLabel}` },
                    tooltip: { callbacks: { label: tooltipLabelFormatter } },
                    legend: { position: 'bottom' }
                },
                animation: {
                    duration: 700,
                    easing: 'easeInOutQuart'
                },
                layout: { padding: CHART_PADDING },
                scales: {
                    x: { title: { text: 'Age' }, ticks: { autoSkip: false } },
                    y: yMonthlyScale
                },
                maintainAspectRatio: false,
                responsive: true
            };

            console.log('Final chart options for sscuts:', JSON.stringify(newChartOptions.scales, null, 2));

            setChartData(newChartData);
            setChartOptions(newChartOptions);
            return;
        }

        if (chartView === 'monthly') {
            const monthlyBarStyle = { barPercentage: 0.92, categoryPercentage: 0.62, borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: 'bottom', maxBarThickness: 44 };
            newChartData = {
                labels,
                datasets: [
                    { label: 'File at 62', data: displayYearsForData.map(year => Math.round(projections.age62.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.age62, ...monthlyBarStyle },
                    { label: 'Preferred Filing Age', data: displayYearsForData.map(year => Math.round(projections.preferred.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.preferred, ...monthlyBarStyle },
                    { label: 'File at 70', data: displayYearsForData.map(year => Math.round(projections.age70.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.age70, ...monthlyBarStyle },
                ]
            };
            newChartOptions = {
                plugins: {
                    title: { display: true, text: 'What each filing age pays you, year by year', color: '#2D3748', font: { size: 18, weight: '700' } },
                    tooltip: { callbacks: { label: tooltipLabelFormatter } },
                    legend: { labels: { color: '#4E4743', boxWidth: 12, boxHeight: 12, font: { size: 14 } } }
                },
                layout: { padding: CHART_PADDING },
                scales: {
                    x: {
                        title: { text: 'Year' },
                        grid: { display: false },
                        border: { color: '#C8BBAB' },
                        ticks: { autoSkip: false, color: '#4E4743', font: { size: 14, weight: '700' } }
                    },
                    y: {
                        title: { text: 'Monthly Benefit ($)' },
                        grid: { color: '#ECE6DC' },
                        border: { display: false, dash: [2, 4] },
                        ticks: { callback: formatCurrencyTick, color: '#8C8278', font: { size: 13 } }
                    }
                },
                animation: {
                    delay: (context) => {
                        let delay = 0;
                        if (context.type === 'data' && context.mode === 'default') {
                            // Configuration for PARALLEL animation (all colors at once)
                            const sequenceDuration = 2000; // 2 seconds for the full bar sequence

                            const dataSize = context.chart.data.labels.length;
                            // const datasetIndex = context.datasetIndex; // Unused for parallel
                            const dataIndex = context.dataIndex;

                            // Calculate delay per bar to fit within sequenceDuration
                            const delayPerBar = dataSize > 0 ? sequenceDuration / dataSize : 0;

                            // No delay between datasets - they all start at time 0
                            const datasetStartDelay = 0;

                            // Delay only depends on position in the sequence (left-to-right)
                            const barDelay = dataIndex * delayPerBar;

                            delay = datasetStartDelay + barDelay;
                        }
                        return delay;
                    },
                    duration: 500, // Duration of the individual bar growth animation
                    easing: 'easeOutQuart'
                }
            };
        } else if (chartView === 'cumulative') {
            newChartData = {
                labels,
                datasets: [
                    { label: 'File at 62', data: displayYearsForData.map(year => Math.round(projections.age62.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.age62, backgroundColor: SCENARIO_COLORS.age62, fill: false },
                    { label: 'Preferred Filing Age', data: displayYearsForData.map(year => Math.round(projections.preferred.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.preferred, backgroundColor: SCENARIO_COLORS.preferred, fill: false },
                    { label: 'File at 70', data: displayYearsForData.map(year => Math.round(projections.age70.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.age70, backgroundColor: SCENARIO_COLORS.age70, fill: false },
                ]
            };
            newChartOptions = {
                plugins: {
                    title: { display: true, text: 'Cumulative View' },
                    tooltip: { callbacks: { label: tooltipLabelFormatter } }
                },
                layout: { padding: CHART_PADDING },
                scales: {
                    x: { title: { text: 'Year' }, ticks: { autoSkip: false } },
                    y: {
                        title: { text: 'Cumulative Benefits ($)' },
                        ticks: { callback: formatCurrencyTick }
                    }
                }
            };
        } else if (chartView === 'earlyLate') {
            const cashflowYears = primaryYears;
            const cashflowLabels = cashflowYears.map(year => `Age ${year - birthYearPrimary}`);

            const valueMapper = (projection) => cashflowYears.map(year => {
                const monthlyValue = projection.monthly?.[year] || 0;
                return Math.round(monthlyValue * (showMonthlyCashflow ? 1 : 12));
            });

            const yAxisLabel = showMonthlyCashflow
                ? 'Monthly Household Income ($)'
                : 'Annual Household Income ($)';

            // Create title with toggle switch
            const earlyLateTitle = {
                display: true,
                text: 'Early/Late Filing Cash Flow',
                padding: { bottom: 20 }
            };

            newChartData = {
                labels: cashflowLabels,
                datasets: [
                    {
                        label: 'Both @62',
                        data: valueMapper((isMarried && combinedProjections?.age62) ? combinedProjections.age62 : primaryProjections.age62),
                        borderColor: SCENARIO_COLORS.age62,
                        backgroundColor: withAlpha(SCENARIO_COLORS.age62, 0.12),
                        fill: false,
                        tension: 0.35,
                        pointRadius: 3
                    },
                    {
                        label: 'Lower PIA @62, Higher PIA @70',
                        data: valueMapper(earlyLateProjection),
                        borderColor: SCENARIO_COLORS.hybrid,
                        backgroundColor: withAlpha(SCENARIO_COLORS.hybrid, 0.12),
                        fill: false,
                        tension: 0.35,
                        pointRadius: 3
                    },
                    {
                        label: 'Lower PIA @67, Higher PIA @70',
                        data: valueMapper(preferredLateProjection),
                        borderColor: SCENARIO_COLORS.preferred,
                        backgroundColor: withAlpha(SCENARIO_COLORS.preferred, 0.12),
                        fill: false,
                        tension: 0.35,
                        pointRadius: 3
                    },
                    {
                        label: 'Both @70',
                        data: valueMapper(bothLateProjection),
                        borderColor: SCENARIO_COLORS.age70,
                        backgroundColor: withAlpha(SCENARIO_COLORS.age70, 0.12),
                        fill: false,
                        tension: 0.35,
                        pointRadius: 3
                    }
                ]
            };
            newChartOptions = {
                plugins: {
                    title: earlyLateTitle,
                    tooltip: { callbacks: { label: tooltipLabelFormatter } }
                },
                layout: { padding: CHART_PADDING },
                scales: {
                    x: { title: { text: 'Age' }, ticks: { autoSkip: false } },
                    y: {
                        title: { text: yAxisLabel },
                        ticks: { callback: formatCurrencyTick }
                    }
                }
            };
        } else if (chartView === 'post70') {
            const post70Years = primaryYears.filter(year => (year - birthYearPrimary) >= 70);
            const yearsToUse = post70Years.length > 0 ? post70Years : primaryYears;
            const labelsPost70 = yearsToUse.map(year => `Age ${year - birthYearPrimary}`);

            const baselineYear = yearsToUse[0] - 1;

            const monthlyValues = (projection) => yearsToUse.map(year => projection.monthly?.[year] || 0);

            const cumulativeAfter70 = (projection) => yearsToUse.map(year => {
                const total = projection.cumulative?.[year] || 0;
                const baseline = projection.cumulative?.[baselineYear] || 0;
                return Math.max(0, total - baseline);
            });

            const monthlyDatasets = [
                {
                    label: 'File at 62',
                    data: monthlyValues(combinedProjections.age62),
                    borderColor: SCENARIO_COLORS.age62,
                    backgroundColor: withAlpha(SCENARIO_COLORS.age62, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                },
                {
                    label: 'Preferred Filing Age',
                    data: monthlyValues(combinedProjections.preferred),
                    borderColor: SCENARIO_COLORS.preferred,
                    backgroundColor: withAlpha(SCENARIO_COLORS.preferred, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                },
                {
                    label: 'File at 70',
                    data: monthlyValues(combinedProjections.age70),
                    borderColor: SCENARIO_COLORS.age70,
                    backgroundColor: withAlpha(SCENARIO_COLORS.age70, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                }
            ];

            const cumulativeDatasets = [
                {
                    label: 'File at 62',
                    data: cumulativeAfter70(combinedProjections.age62),
                    borderColor: SCENARIO_COLORS.age62,
                    backgroundColor: withAlpha(SCENARIO_COLORS.age62, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                },
                {
                    label: 'Preferred Filing Age',
                    data: cumulativeAfter70(combinedProjections.preferred),
                    borderColor: SCENARIO_COLORS.preferred,
                    backgroundColor: withAlpha(SCENARIO_COLORS.preferred, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                },
                {
                    label: 'File at 70',
                    data: cumulativeAfter70(combinedProjections.age70),
                    borderColor: SCENARIO_COLORS.age70,
                    backgroundColor: withAlpha(SCENARIO_COLORS.age70, 0.12),
                    fill: false,
                    tension: 0.25,
                    pointRadius: 3
                }
            ];

            if (post70View === 'monthly') {
                newChartData = {
                    labels: labelsPost70,
                    datasets: monthlyDatasets
                };
                newChartOptions = {
                    plugins: {
                        title: { display: true, text: 'Post-70 Monthly Income' },
                        tooltip: { callbacks: { label: tooltipLabelFormatter } }
                    },
                    layout: { padding: CHART_PADDING },
                    scales: {
                        x: { title: { text: 'Age' }, ticks: { autoSkip: false } },
                        y: { title: { text: 'Monthly Income ($)' }, ticks: { callback: formatCurrencyTick } }
                    }
                };
            } else if (post70View === 'cumulative') {
                // Calculate key milestone differences
                const annotations = {};
                const milestoneAges = [75, 80, 85, 90, 95];

                milestoneAges.forEach(age => {
                    const labelIndex = labelsPost70.findIndex(label => label === `Age ${age}`);
                    if (labelIndex !== -1) {
                        const age62Value = cumulativeAfter70(combinedProjections.age62)[labelIndex] || 0;
                        const age70Value = cumulativeAfter70(combinedProjections.age70)[labelIndex] || 0;
                        const diff = age70Value - age62Value;

                        if (Math.abs(diff) > 1000) {
                            // Create a flag label positioned above the line
                            const boxHeight = age === 75 ? 0 : age === 80 ? 85 : age === 85 ? 170 : age === 90 ? 255 : 340;
                            annotations[`box${age}`] = {
                                type: 'label',
                                xValue: labelIndex,
                                yValue: 'max',
                                yAdjust: -(boxHeight + 75),
                                xAdjust: -75,
                                content: [
                                    `💡 Age ${age}`,
                                    `Filing at 70: ${currencyFormatter.format(age70Value)}`,
                                    `Filing at 62: ${currencyFormatter.format(age62Value)}`,
                                    `Advantage: ${currencyFormatter.format(Math.abs(diff))}`
                                ],
                                backgroundColor: SIGNAL_COLORS.gain,
                                color: 'white',
                                font: {
                                    size: 11,
                                    weight: 'bold'
                                },
                                padding: 8,
                                borderRadius: 6,
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                                borderWidth: 1,
                                textAlign: 'center',
                                position: 'center'
                            };

                            // Vertical line starting from bottom of flag
                            annotations[`line${age}`] = {
                                type: 'line',
                                xMin: labelIndex,
                                xMax: labelIndex,
                                yMin: 0,
                                yMax: 'max',
                                yScaleID: 'y',
                                adjustScaleRange: false,
                                borderColor: withAlpha(REFERENCE_COLORS.marker, 0.5),
                                borderWidth: 2,
                                borderDash: [6, 4],
                                display: true
                            };
                        }
                    }
                });

                newChartData = {
                    labels: labelsPost70,
                    datasets: cumulativeDatasets
                };
                newChartOptions = {
                    plugins: {
                        title: { display: true, text: 'Post-70 Cumulative Income - Filing Strategy Impact' },
                        tooltip: {
                            callbacks: {
                                label: tooltipLabelFormatter
                            }
                        },
                        annotation: {
                            annotations
                        }
                    },
                    layout: { padding: CHART_PADDING },
                    scales: {
                        x: { title: { text: 'Age' }, ticks: { autoSkip: false } },
                        y: { title: { text: 'Cumulative Income Since Age 70 ($)' }, ticks: { callback: formatCurrencyTick } }
                    }
                };
            } else {
                newChartData = {
                    labels: labelsPost70,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'File at 62',
                            data: monthlyValues(combinedProjections.age62),
                            backgroundColor: SCENARIO_COLORS.age62,
                            yAxisID: 'y_monthly',
                            barPercentage: 0.65,
                            categoryPercentage: 0.8
                        },
                        {
                            type: 'bar',
                            label: 'Preferred Filing Age',
                            data: monthlyValues(combinedProjections.preferred),
                            backgroundColor: SCENARIO_COLORS.preferred,
                            yAxisID: 'y_monthly',
                            barPercentage: 0.65,
                            categoryPercentage: 0.8
                        },
                        {
                            type: 'bar',
                            label: 'File at 70',
                            data: monthlyValues(combinedProjections.age70),
                            backgroundColor: SCENARIO_COLORS.age70,
                            yAxisID: 'y_monthly',
                            barPercentage: 0.65,
                            categoryPercentage: 0.8
                        },
                        {
                            type: 'line',
                            label: 'Cumulative File at 62',
                            data: cumulativeAfter70(combinedProjections.age62),
                            borderColor: SCENARIO_COLORS.age62,
                            backgroundColor: 'transparent',
                            yAxisID: 'y_cumulative',
                            tension: 0.25,
                            fill: false,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Cumulative Preferred Filing Age',
                            data: cumulativeAfter70(combinedProjections.preferred),
                            borderColor: SCENARIO_COLORS.preferred,
                            backgroundColor: 'transparent',
                            yAxisID: 'y_cumulative',
                            tension: 0.25,
                            fill: false,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Cumulative File at 70',
                            data: cumulativeAfter70(combinedProjections.age70),
                            borderColor: SCENARIO_COLORS.age70,
                            backgroundColor: 'transparent',
                            yAxisID: 'y_cumulative',
                            tension: 0.25,
                            fill: false,
                            order: 2
                        }
                    ]
                };
                newChartOptions = {
                    plugins: {
                        title: { display: true, text: 'Post-70 Combined View' },
                        tooltip: { callbacks: { label: tooltipLabelFormatter } }
                    },
                    layout: { padding: CHART_PADDING },
                    scales: {
                        x: { title: { text: 'Age' }, ticks: { autoSkip: false } },
                        y_monthly: {
                            type: 'linear',
                            position: 'left',
                            title: { text: 'Monthly Income ($)', display: true },
                            ticks: { callback: formatCurrencyTick }
                        },
                        y_cumulative: {
                            type: 'linear',
                            position: 'right',
                            title: { text: 'Cumulative Income Since Age 70 ($)', display: true },
                            grid: { drawOnChartArea: false },
                            ticks: { callback: formatCurrencyTick }
                        }
                    }
                };
            }
        } else {
            newChartData = {
                labels,
                datasets: [
                    { type: 'bar', label: 'Monthly File at 62', data: displayYearsForData.map(year => Math.round(projections.age62.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.age62, yAxisID: 'y_monthly', barPercentage: 0.65, categoryPercentage: 0.8, maxBarThickness: 70, borderRadius: 4 },
                    { type: 'bar', label: 'Monthly Preferred Filing Age', data: displayYearsForData.map(year => Math.round(projections.preferred.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.preferred, yAxisID: 'y_monthly', barPercentage: 0.65, categoryPercentage: 0.8, maxBarThickness: 70, borderRadius: 4 },
                    { type: 'bar', label: 'Monthly File at 70', data: displayYearsForData.map(year => Math.round(projections.age70.monthly[year] || 0)), backgroundColor: SCENARIO_COLORS.age70, yAxisID: 'y_monthly', barPercentage: 0.65, categoryPercentage: 0.8, maxBarThickness: 70, borderRadius: 4 },
                    { type: 'line', label: 'Cumulative File at 62', data: displayYearsForData.map(year => Math.round(projections.age62.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.age62, yAxisID: 'y_cumulative', fill: false, order: 2, borderWidth: 2 },
                    { type: 'line', label: 'Cumulative Preferred Filing Age', data: displayYearsForData.map(year => Math.round(projections.preferred.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.preferred, yAxisID: 'y_cumulative', fill: false, order: 2, borderWidth: 2 },
                    { type: 'line', label: 'Cumulative File at 70', data: displayYearsForData.map(year => Math.round(projections.age70.cumulative[year] || 0)), borderColor: SCENARIO_COLORS.age70, yAxisID: 'y_cumulative', fill: false, order: 2, borderWidth: 2 },
                ]
            };
            newChartOptions = {
                plugins: {
                    title: { display: true, text: 'Combined View' },
                    tooltip: { callbacks: { label: tooltipLabelFormatter } }
                },
                layout: { padding: CHART_PADDING },
                scales: {
                    x: { title: { text: 'Year' }, ticks: { autoSkip: false } },
                    y_monthly: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { text: 'Monthly Benefit ($)', display: true },
                        ticks: { callback: formatCurrencyTick }
                    },
                    y_cumulative: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { text: 'Cumulative Benefits ($)', display: true },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: formatCurrencyTick }
                    }
                }
            };
        }

        setChartData(newChartData);
        setChartOptions(newChartOptions);

    }, [scenarioData, chartView, activeRecordView, showMonthlyCashflow, post70View, ssCutsChartData, ssCutsActive, isMarried, ssCutsAxisRanges]);

    useEffect(() => {
        setSsCutsChartData(null);
        setSsCutsSummary([]);
        setSsCutsPayload(null);
        setSsCutsActive(false);
        setSsCutsAxisRanges(null);
    }, [scenarioData, activeRecordView]);

    // Auto-calculate and show baseline when switching to SS Cuts tab
    useEffect(() => {
        if (chartView === 'sscuts' && !ssCutsPayload && scenarioData) {
            // Automatically calculate the baseline when tab is opened
            const calculateSsCuts = () => {
                const {
                    primaryProjections,
                    spouseProjections,
                    combinedProjections,
                    birthYearPrimary,
                    birthYearSpouse,
                    primaryYears,
                    spouseYears
                } = scenarioData;

                const baseProjections =
                    activeRecordView === 'primary'
                        ? primaryProjections
                        : activeRecordView === 'spouse' && spouseProjections
                            ? spouseProjections
                            : combinedProjections;

                let displayYearsForData = primaryYears;
                let labels = primaryYears.map(year => `Age ${year - birthYearPrimary}`);

                if (activeRecordView === 'spouse' && spouseYears) {
                    displayYearsForData = spouseYears;
                    labels = spouseYears.map(year => `Age ${year - birthYearSpouse}`);
                } else if (activeRecordView === 'combined' && isMarried && birthYearSpouse !== null) {
                    displayYearsForData = primaryYears;
                    labels = primaryYears.map(year => {
                        const age1 = year - birthYearPrimary;
                        const age2 = year - birthYearSpouse;
                        return `Ages ${age1}/${age2}`;
                    });
                }

                const scenarioConfigs = [
                    { key: 'age62', label: 'File at 62', barColor: SCENARIO_COLORS.age62, lineColor: SCENARIO_COLORS.age62 },
                    { key: 'preferred', label: 'Preferred Filing Age', barColor: SCENARIO_COLORS.preferred, lineColor: SCENARIO_COLORS.preferred },
                    { key: 'age70', label: 'File at 70', barColor: SCENARIO_COLORS.age70, lineColor: SCENARIO_COLORS.age70 },
                ];

                const scenarios = [];

                scenarioConfigs.forEach((config) => {
                    const baseProjection = baseProjections?.[config.key];
                    if (!baseProjection) return;

                    const cutProjection = applyBenefitCut({
                        projection: baseProjection,
                        cutYear: ssCutYear,
                        cutPercentage: ssCutPercentage
                    });

                    const baselineMonthly = displayYearsForData.map(year => Number((baseProjection.monthly?.[year] || 0).toFixed(2)));
                    const baselineCumulative = displayYearsForData.map(year => Number((baseProjection.cumulative?.[year] || 0).toFixed(2)));
                    const cutMonthly = displayYearsForData.map(year => Number((cutProjection.monthly?.[year] || 0).toFixed(2)));
                    const cutCumulative = displayYearsForData.map(year => Number((cutProjection.cumulative?.[year] || 0).toFixed(2)));

                    const baselineTotal = baselineCumulative[baselineCumulative.length - 1] || 0;
                    const cutTotal = cutCumulative[cutCumulative.length - 1] || 0;

                    scenarios.push({
                        label: config.label,
                        barColor: config.barColor,
                        lineColor: config.lineColor,
                        baselineMonthly,
                        baselineCumulative,
                        cutMonthly,
                        cutCumulative,
                        baselineTotal,
                        cutTotal
                    });
                });

                if (!scenarios.length) return;

                const summary = scenarios.map((scenario) => ({
                    label: scenario.label,
                    baseline: Math.round(scenario.baselineTotal),
                    projected: Math.round(scenario.cutTotal),
                    delta: Math.round(scenario.cutTotal - scenario.baselineTotal)
                }));

                const yAxisRanges = calculateAxisRanges(scenarios);

                const payload = {
                    labels,
                    scenarios,
                    summary,
                    yAxisRanges
                };

                setSsCutsAxisRanges(yAxisRanges);
                setSsCutsPayload(payload);
                applySsCutsMode(false, payload); // Show baseline initially
            };

            calculateSsCuts();
        }
    }, [chartView, ssCutsPayload, scenarioData, activeRecordView, isMarried, ssCutYear, ssCutPercentage]);

    const handlePrimaryOnlyToggle = (event) => {
        setActiveRecordView(event.target.checked ? 'primary' : 'combined');
    };

    const handleSpouseOnlyToggle = (event) => {
        setActiveRecordView(event.target.checked ? 'spouse' : 'combined');
    };

    const applySsCutsMode = (projected, payload) => {
        if (!payload || !payload.scenarios.length) {
            setSsCutsChartData(null);
            setSsCutsActive(false);
            setSsCutsSummary([]);
            return;
        }

        console.log('applySsCutsMode called with projected:', projected);
        console.log('Payload yAxisRanges:', payload.yAxisRanges);

        const datasets = [];

        payload.scenarios.forEach((scenario) => {
            if (!scenario) {
                return;
            }
            const monthlyValues = projected ? scenario.cutMonthly : scenario.baselineMonthly;

            datasets.push({
                type: 'bar',
                label: scenario.label,
                data: monthlyValues.map(value => Math.round(value)),
                backgroundColor: scenario.barColor,
                borderColor: scenario.lineColor,
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.55,
                categoryPercentage: 0.72,
                order: 1
            });
        });

        setSsCutsChartData({
            labels: payload.labels,
            datasets,
            yAxisRanges: payload.yAxisRanges // Use the ranges from the payload
        });
        setSsCutsSummary(payload.summary);
        setSsCutsActive(projected);
    };

    const handleProjectCuts = () => {
        if (!scenarioData) {
            return;
        }

        const {
            primaryProjections,
            spouseProjections,
            combinedProjections,
            birthYearPrimary,
            birthYearSpouse,
            primaryYears,
            spouseYears
        } = scenarioData;

        const baseProjections =
            activeRecordView === 'primary'
                ? primaryProjections
                : activeRecordView === 'spouse' && spouseProjections
                    ? spouseProjections
                    : combinedProjections;

        let displayYearsForData = primaryYears;
        let labels = primaryYears.map(year => `Age ${year - birthYearPrimary}`);

        if (activeRecordView === 'spouse' && spouseYears) {
            displayYearsForData = spouseYears;
            labels = spouseYears.map(year => `Age ${year - birthYearSpouse}`);
        } else if (activeRecordView === 'combined' && isMarried && birthYearSpouse !== null) {
            displayYearsForData = primaryYears;
            labels = primaryYears.map(year => {
                const age1 = year - birthYearPrimary;
                const age2 = year - birthYearSpouse;
                return `Ages ${age1}/${age2}`;
            });
        }

        const scenarioConfigs = [
            { key: 'age62', label: 'File at 62', barColor: SCENARIO_COLORS.age62, lineColor: SCENARIO_COLORS.age62 },
            { key: 'preferred', label: 'Preferred Filing Age', barColor: SCENARIO_COLORS.preferred, lineColor: SCENARIO_COLORS.preferred },
            { key: 'age70', label: 'File at 70', barColor: SCENARIO_COLORS.age70, lineColor: SCENARIO_COLORS.age70 },
        ];

        const scenarios = [];

        scenarioConfigs.forEach((config) => {
            const baseProjection = baseProjections?.[config.key];
            if (!baseProjection) {
                return;
            }

            const cutProjection = applyBenefitCut({
                projection: baseProjection,
                cutYear: ssCutYear,
                cutPercentage: ssCutPercentage
            });

            const baselineMonthly = displayYearsForData.map(year => Number((baseProjection.monthly?.[year] || 0).toFixed(2)));
            const baselineCumulative = displayYearsForData.map(year => Number((baseProjection.cumulative?.[year] || 0).toFixed(2)));
            const cutMonthly = displayYearsForData.map(year => Number((cutProjection.monthly?.[year] || 0).toFixed(2)));
            const cutCumulative = displayYearsForData.map(year => Number((cutProjection.cumulative?.[year] || 0).toFixed(2)));

            const baselineTotal = baselineCumulative[baselineCumulative.length - 1] || 0;
            const cutTotal = cutCumulative[cutCumulative.length - 1] || 0;

            scenarios.push({
                label: config.label,
                barColor: config.barColor,
                lineColor: config.lineColor,
                baselineMonthly,
                baselineCumulative,
                cutMonthly,
                cutCumulative,
                baselineTotal,
                cutTotal
            });
        });

        if (!scenarios.length) {
            setSsCutsPayload(null);
            applySsCutsMode(false, null);
            setChartView('sscuts');
            return;
        }

        const summary = scenarios.map((scenario) => ({
            label: scenario.label,
            baseline: Math.round(scenario.baselineTotal),
            projected: Math.round(scenario.cutTotal),
            delta: Math.round(scenario.cutTotal - scenario.baselineTotal)
        }));

        const yAxisRanges = calculateAxisRanges(scenarios);

        console.log('Calculated Y-axis ranges for SS Cuts:', yAxisRanges);

        const payload = {
            labels,
            scenarios,
            summary,
            yAxisRanges
        };

        // Store axis ranges in persistent state
        setSsCutsAxisRanges(yAxisRanges);
        setSsCutsPayload(payload);
        applySsCutsMode(true, payload);
        setChartView('sscuts');
    };

    const handleShowBaseline = () => {
        if (!ssCutsPayload) {
            return;
        }
        applySsCutsMode(false, ssCutsPayload);
        setChartView('sscuts');
    };

    const handlePiaBlur = () => {
        if (spouse1PiaField.readOnly) return;
        const val = Number(spouse1Pia) || 0;
        if (isDevMode) {
            updateDevProfile({ own_pia: val });
        } else {
            // Backend expects piaAtFra
            updateProfile({ piaAtFra: val });
        }
    };

    const handleSpousePiaBlur = () => {
        if (spouse2PiaField.readOnly) return;
        if (!partners?.[0]?.id) return;
        const val = Number(spouse2Pia) || 0;
        if (isDevMode) {
            updateDevPartner(0, { pia: val });
        } else {
            // Backend expects piaAtFra
            updatePartner(partners[0].id, { piaAtFra: val });
        }
    };

    const handleSpouse1AgeBlur = () => {
        if (isDevMode) return;
        updateProfile({
            preferredClaimingAgeYears: Number(spouse1PreferredYear),
            preferredClaimingAgeMonths: Number(spouse1PreferredMonth)
        });
    };

    const handleSpouse2AgeBlur = () => {
        if (isDevMode) return;
        updatePreferences({
            spousePreferredClaimingAgeYears: Number(spouse2PreferredYear),
            spousePreferredClaimingAgeMonths: Number(spouse2PreferredMonth)
        });
    };

    const chartTabs = [
        { key: 'monthly', label: 'Monthly Benefit' },
        { key: 'cumulative', label: 'Cumulative Benefit' },
        { key: 'combined', label: 'Combined' },
        { key: 'earlyLate', label: 'Early/Late' },
        { key: 'post70', label: 'Post-70' },
        { key: 'sscuts', label: 'SS Cuts' },
        { key: 'flow', label: 'Flow' },
        { key: 'race', label: 'Race' },
    ];

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
            {/* Compact Sidebar */}
            <div className={`relative bg-white border-r border-gray-200 transition-all duration-300 ${sidebarCollapsed ? 'w-0 lg:w-12' : 'lg:w-80 xl:w-96'
                }`}>
                <div className={`h-full ${sidebarCollapsed ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                    {!sidebarCollapsed && (
                        <div>
                            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-blue-50 flex justify-between items-start">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Controls</h2>
                                    <p className="text-xs text-gray-600">Adjust your inputs</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => navigate('/settings')}
                                        className="p-1.5 bg-gray-600 text-white rounded-lg shadow-md hover:bg-gray-700 transition-all hover:scale-110"
                                        title="Settings"
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => setSidebarCollapsed(true)}
                                        className="hidden lg:flex p-1.5 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 transition-all hover:scale-110"
                                        title="Collapse controls"
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Primary Filer - Compact */}
                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <div className="mb-2">
                                        <h3 className="text-sm font-semibold text-gray-900">{(() => {
                                            const name = (profile?.firstName && profile?.lastName)
                                                ? `${profile.firstName} ${profile.lastName}`
                                                : (profile?.first_name && profile?.last_name)
                                                    ? `${profile.first_name} ${profile.last_name}`
                                                    : 'Primary Filer';
                                            return name;
                                        })()}</h3>
                                        <p className="text-xs text-gray-600">DOB: {spouse1Dob} • Age: {formatAge(spouse1Dob)}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div>
                                            <div className="mb-1 flex items-center gap-1 text-xs text-gray-600">
                                                <label htmlFor="spouse1-pia">Enter Your PIA ($)</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPiaFraModal(true)}
                                                    className="text-primary-600 hover:text-primary-700 underline text-xs"
                                                >
                                                    What's This?
                                                </button>
                                            </div>
                                            <input
                                                id="spouse1-pia"
                                                type="number"
                                                value={spouse1PiaField.value}
                                                onChange={e => setSpouse1Pia(e.target.value ? Number(e.target.value) : '')}
                                                onBlur={handlePiaBlur}
                                                readOnly={spouse1PiaField.readOnly}
                                                aria-describedby={spouse1PiaField.readOnly ? 'spouse1-pia-source' : undefined}
                                                className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                                                    spouse1PiaField.readOnly
                                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                                        : 'border-gray-300'
                                                }`}
                                                placeholder="Insert PIA here"
                                            />
                                            {spouse1PiaField.readOnly && (
                                                <p id="spouse1-pia-source" className="mt-1 text-xs text-emerald-700">
                                                    {scenario.piaSource.spouse1 === 'workshop'
                                                        ? 'PIA Calculator value currently driving the chart.'
                                                        : 'Earnings-record value currently driving the chart.'}
                                                </p>
                                            )}
                                        </div>

                                        <div className="bg-primary-100 rounded p-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                                                Preferred Filing Age
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPreferredFilingModal(true)}
                                                    className="text-primary-600 hover:text-primary-700 underline text-xs"
                                                >
                                                    What's This?
                                                </button>
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <input
                                                        type="number"
                                                        value={spouse1PreferredYear}
                                                        onChange={e => setSpouse1PreferredYear(Number(e.target.value))}
                                                        onBlur={handleSpouse1AgeBlur}
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                        placeholder="Yr"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="number"
                                                        value={spouse1PreferredMonth}
                                                        onChange={e => setSpouse1PreferredMonth(Number(e.target.value))}
                                                        onBlur={handleSpouse1AgeBlur}
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                        placeholder="Mo"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* View Only Checkbox - At Bottom */}
                                        <div className="pt-3 mt-3 border-t border-gray-200">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 hover:text-gray-800">
                                                <input
                                                    type="checkbox"
                                                    checked={activeRecordView === 'primary'}
                                                    onChange={handlePrimaryOnlyToggle}
                                                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                />
                                                <span title="This setting can also be changed in the Settings section">Show only this person</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Spouse - Compact - Always visible when married */}
                                {isMarried && (
                                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                        <div className="mb-2">
                                            <h3 className="text-sm font-semibold text-gray-900">{(() => {
                                                const sp = partners && partners.length > 0 ? partners[0] : null;
                                                const name = sp && (sp.firstName && sp.lastName)
                                                    ? `${sp.firstName} ${sp.lastName}`
                                                    : sp && (sp.first_name && sp.last_name)
                                                        ? `${sp.first_name} ${sp.last_name}`
                                                        : 'Spouse Filer';
                                                return name;
                                            })()}</h3>
                                            <p className="text-xs text-gray-600">DOB: {spouse2Dob} • Age: {formatAge(spouse2Dob)}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div>
                                                <div className="mb-1 flex items-center gap-1 text-xs text-gray-600">
                                                    <label htmlFor="spouse2-pia">Enter Your PIA ($)</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPiaFraModal(true)}
                                                        className="text-primary-600 hover:text-primary-700 underline text-xs"
                                                    >
                                                        What's This?
                                                    </button>
                                                </div>
                                                <input
                                                    id="spouse2-pia"
                                                    type="number"
                                                    value={spouse2PiaField.value}
                                                    onChange={e => setSpouse2Pia(e.target.value ? Number(e.target.value) : '')}
                                                    onBlur={handleSpousePiaBlur}
                                                    readOnly={spouse2PiaField.readOnly}
                                                    aria-describedby={spouse2PiaField.readOnly ? 'spouse2-pia-source' : undefined}
                                                    className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                                                        spouse2PiaField.readOnly
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                                            : 'border-gray-300'
                                                    }`}
                                                    placeholder="Insert PIA here"
                                                />
                                                {spouse2PiaField.readOnly && (
                                                    <p id="spouse2-pia-source" className="mt-1 text-xs text-emerald-700">
                                                        {scenario.piaSource.spouse2 === 'workshop'
                                                            ? 'PIA Calculator value currently driving the chart.'
                                                            : 'Earnings-record value currently driving the chart.'}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="bg-primary-100 rounded p-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                                                    Preferred Filing Age
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPreferredFilingModal(true)}
                                                        className="text-primary-600 hover:text-primary-700 underline text-xs"
                                                    >
                                                        What's This?
                                                    </button>
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <input
                                                            type="number"
                                                            value={spouse2PreferredYear}
                                                            onChange={e => setSpouse2PreferredYear(Number(e.target.value))}
                                                            onBlur={handleSpouse2AgeBlur}
                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                            placeholder="Yr"
                                                        />
                                                    </div>
                                                    <div>
                                                        <input
                                                            type="number"
                                                            value={spouse2PreferredMonth}
                                                            onChange={e => setSpouse2PreferredMonth(Number(e.target.value))}
                                                            onBlur={handleSpouse2AgeBlur}
                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                            placeholder="Mo"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* View Only Checkbox - At Bottom */}
                                        <div className="pt-3 mt-3 border-t border-gray-200">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 hover:text-gray-800">
                                                <input
                                                    type="checkbox"
                                                    checked={activeRecordView === 'spouse'}
                                                    onChange={handleSpouseOnlyToggle}
                                                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                />
                                                <span title="This setting can also be changed in the Settings section">Show only this person</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Inflation - Moved Here */}
                                <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm mb-4">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Inflation Assumption</h3>
                                    <div className="space-y-2">
                                        <div className="pt-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-1">
                                                    <label className="text-xs font-medium text-gray-700">Annual COLA</label>
                                                    <div className="group relative">
                                                        <svg className="w-3.5 h-3.5 text-gray-400 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                        </svg>
                                                        <div className="hidden group-hover:block absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                                                            <div className="font-semibold mb-1">How COLA is Applied:</div>
                                                            <ul className="space-y-1 text-xs">
                                                                <li>• <span className="font-medium">Before age 60:</span> Applied annually</li>
                                                                <li>• <span className="font-medium">Ages 60-61:</span> Frozen at 0%</li>
                                                                <li>• <span className="font-medium">Age 62 onward:</span> Your rate applies annually</li>
                                                                <li>• <span className="font-medium">After claiming:</span> Continues annually</li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-semibold text-primary-600">
                                                    {(inflation * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                value={inflation}
                                                onChange={e => setInflation(Number(e.target.value))}
                                                min="0"
                                                max="0.1"
                                                step="0.001"
                                                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Show Me Just This Single Year - Between Spouse and Options */}
                                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Show Me Just This Single Year</h3>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={showYearView}
                                                onChange={(e) => {
                                                    const isChecked = e.target.checked;
                                                    setShowYearView(isChecked);
                                                    if (isChecked) {
                                                        setShowYearModal(true);
                                                    }
                                                }}
                                                className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                            />
                                            <span>Enable year view</span>
                                        </label>

                                        {showYearView && (
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Select age:</label>
                                                <select
                                                    value={selectedYearAge}
                                                    onChange={(e) => {
                                                        setSelectedYearAge(Number(e.target.value));
                                                        setShowYearModal(true);
                                                    }}
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                >
                                                    {Array.from({ length: 95 - 62 + 1 }, (_, i) => 62 + i).map(age => {
                                                        // Calculate ages for both spouses if married
                                                        const primaryAge = age;
                                                        const spouseBirthYear = isMarried ? new Date(spouse2Dob).getFullYear() : null;
                                                        const primaryBirthYear = new Date(spouse1Dob).getFullYear();

                                                        let label;
                                                        if (isMarried && spouseBirthYear) {
                                                            const spouseAge = age + (primaryBirthYear - spouseBirthYear);
                                                            label = formatCoupleAges(primaryAge, spouseAge);
                                                        } else {
                                                            label = `${primaryAge}`;
                                                        }

                                                        return (
                                                            <option key={age} value={age}>{label}</option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Options - Compact (Only if Married for Premature Death) */}
                                {isMarried && (
                                    <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm mt-4">
                                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Options</h3>
                                        <div className="space-y-2">
                                            <div className="space-y-2">
                                                <Checkbox
                                                    label={<span className="text-xs">Potential Premature Death</span>}
                                                    checked={prematureDeath}
                                                    onChange={e => setPrematureDeath(e.target.checked)}
                                                />
                                                {prematureDeath && (
                                                    <div>
                                                        <label className="block text-xs text-gray-600 mb-1">
                                                            {isMarried ? 'Death at ages:' : 'Death at age:'}
                                                        </label>
                                                        <select
                                                            value={deathAge}
                                                            onChange={e => setDeathAge(Number(e.target.value))}
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                        >
                                                            {Array.from({ length: 100 - 62 + 1 }, (_, idx) => 62 + idx).map(age => {
                                                                const primaryAge = age;
                                                                const spouseBirthYear = isMarried ? new Date(spouse2Dob).getFullYear() : null;
                                                                const primaryBirthYear = new Date(spouse1Dob).getFullYear();

                                                                let label;
                                                                if (isMarried && spouseBirthYear) {
                                                                    const spouseAge = age + (primaryBirthYear - spouseBirthYear);
                                                                    label = formatCoupleAges(primaryAge, spouseAge);
                                                                } else {
                                                                    label = `${primaryAge}`;
                                                                }

                                                                return (
                                                                    <option key={age} value={age}>{label}</option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Separator */}
                                <div className="relative py-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t-2 border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center">
                                        <span className="px-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            Tools & Resources
                                        </span>
                                    </div>
                                </div>

                                {/* Quick Access Tools */}
                                <div className="border border-gray-200 rounded-lg p-3 bg-gradient-to-br from-white to-gray-50 shadow-sm">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Core Features</h3>
                                    <div className="space-y-2">
                                        {/* Featured: PIA Calculator - UPGRADED */}
                                        <div className="p-4 bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 border-2 border-teal-300 rounded-xl shadow-lg">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
                                                        <span className="text-white text-xl">🧮</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-teal-900 mb-1">PIA Calculator</h4>
                                                    <p className="text-xs text-teal-700">Calculate your Primary Insurance Amount from your earnings record</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => navigate('/pia-calculator')}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                                            >
                                                Refine your PIA
                                            </button>
                                            <p className="text-xs text-teal-600 mt-2 text-center italic">
                                                ⚡ Essential: Get your exact benefit amount
                                            </p>
                                        </div>

                                        {/* Featured: One Month at a Time - MOVED UP */}
                                        <div className="p-4 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-300 rounded-xl shadow-lg">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                                                        <span className="text-white text-xl">🎯</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-indigo-900 mb-1">One Month at a Time</h4>
                                                    <p className="text-xs text-indigo-700">See how each month of waiting builds guaranteed retirement income</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setShowOneMonthModal(true)}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                                            >
                                                📊 Explore Month-by-Month Value
                                            </button>
                                            <p className="text-xs text-indigo-600 mt-2 text-center italic">
                                                ✨ NEW: Interactive bridge-building tool
                                            </p>
                                        </div>

                                        {/* Start-Stop-Start Strategy */}
                                        <div className="p-4 bg-gradient-to-br from-purple-50 via-fuchsia-50 to-rose-50 border-2 border-purple-300 rounded-xl shadow-lg">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                                                        <span className="text-white text-xl">🔄</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-purple-900 mb-1">Start-Stop-Start Strategy</h4>
                                                    <p className="text-xs text-purple-700">File early, suspend at FRA, restart at 70 to maximize credits</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => navigate('/start-stop-start')}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                                            >
                                                🔄 Explore Start-Stop-Start
                                            </button>
                                            <p className="text-xs text-purple-600 mt-2 text-center italic">
                                                Compare early vs delayed claiming with suspension
                                            </p>
                                        </div>

                                        {/* Early/Late */}
                                        <div className="p-4 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl shadow-lg">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                                                        <span className="text-white text-xl">⏳</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-amber-900 mb-1">Early/Late</h4>
                                                    <p className="text-xs text-amber-700">Compare claiming at 62, FRA, and 70</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setChartView('earlyLate')}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                                            >
                                                ⏳ Open Early/Late View
                                            </button>
                                            <p className="text-xs text-amber-700 mt-2 text-center italic">
                                                Quick visual comparison inside the main chart
                                            </p>
                                        </div>

                                        {/* Life Expectancy Reality Check */}
                                        <div className="p-4 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border-2 border-emerald-300 rounded-xl shadow-lg">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="flex-shrink-0">
                                                    <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                                                        <span className="text-white text-xl">📊</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-emerald-900 mb-1">Life Expectancy</h4>
                                                    <p className="text-xs text-emerald-700">Survival probability curves for planning</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => navigate('/life-expectancy')}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-lg shadow-md hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                                            >
                                                📊 Check Life Expectancy
                                            </button>
                                            <p className="text-xs text-emerald-600 mt-2 text-center italic">
                                                The longer you live, the longer you're expected to live
                                            </p>
                                        </div>

                                    </div>

                                    <h3 className="text-sm font-semibold text-gray-900 mb-3 mt-4">Helper Apps</h3>
                                    <div className="space-y-2">
                                        {/* Bubbles (4% Rule Equivalent) */}
                                        <button
                                            onClick={() => setChartView('bubble')}
                                            className="w-full text-left px-3 py-2 bg-gradient-to-r from-cyan-50 to-sky-100 hover:from-cyan-100 hover:to-sky-200 border border-cyan-200 rounded-lg transition-all hover:shadow-md group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-cyan-900">Bubbles</div>
                                                    <div className="text-xs text-cyan-700 mt-0.5">4% Rule Equivalent</div>
                                                </div>
                                                <svg className="w-4 h-4 text-cyan-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </button>
                                        {/* Sequence of Returns */}
                                        <button
                                            onClick={() => navigate('/sequence-risk')}
                                            className="w-full text-left px-3 py-2 bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 border border-purple-200 rounded-lg transition-all hover:shadow-md group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-purple-900">Sequence of Returns</div>
                                                    <div className="text-xs text-purple-700 mt-0.5">Market timing impact</div>
                                                </div>
                                                <svg className="w-4 h-4 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Longevity Spending */}
                                        <button
                                            onClick={() => navigate('/longevity-spending')}
                                            className="w-full text-left px-3 py-2 bg-gradient-to-r from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 border border-green-200 rounded-lg transition-all hover:shadow-md group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-green-900">Longevity Spending</div>
                                                    <div className="text-xs text-green-700 mt-0.5">Plan retirement phases</div>
                                                </div>
                                                <svg className="w-4 h-4 text-green-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Income Target */}
                                        <button
                                            onClick={() => navigate('/income-target')}
                                            className="w-full text-left px-3 py-2 bg-gradient-to-r from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 border border-orange-200 rounded-lg transition-all hover:shadow-md group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-orange-900">Income Target</div>
                                                    <div className="text-xs text-orange-700 mt-0.5">Set retirement goals</div>
                                                </div>
                                                <svg className="w-4 h-4 text-orange-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Budget Worksheet */}
                                        <button
                                            onClick={() => navigate('/budget-worksheet')}
                                            className="w-full text-left px-3 py-2 bg-gradient-to-r from-pink-50 to-pink-100 hover:from-pink-100 hover:to-pink-200 border border-pink-200 rounded-lg transition-all hover:shadow-md group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-pink-900">Budget Worksheet</div>
                                                    <div className="text-xs text-pink-700 mt-0.5">Track monthly expenses</div>
                                                </div>
                                                <svg className="w-4 h-4 text-pink-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Expand Button - Only shown when collapsed */}
                {sidebarCollapsed && (
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        className="hidden lg:flex absolute top-4 left-1 p-1.5 bg-primary-600 text-white rounded-lg shadow-lg hover:bg-primary-700 transition-all hover:scale-110 z-10"
                        title="Expand controls"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                        <PillTabs className="flex-wrap">
                            {chartTabs.filter(tab => tab.key !== 'combined' && tab.key !== 'earlyLate').map(tab => (
                                <PillTab
                                    key={tab.key}
                                    active={chartView === tab.key}
                                    onClick={() => setChartView(tab.key)}
                                    title={tab.tooltip || ''}
                                >
                                    <span className="text-xs">{tab.label}</span>
                                </PillTab>
                            ))}
                        </PillTabs>

                    </div>

                    {chartView === 'sscuts' && (
                        <div className="mt-3 flex flex-wrap gap-3 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Insolvency Year</label>
                                <select
                                    value={ssCutYear}
                                    onChange={e => setSsCutYear(Number(e.target.value))}
                                    className="px-3 py-2 text-sm font-medium border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white hover:border-gray-400 transition-colors"
                                >
                                    {Array.from({ length: 21 }, (_, idx) => 2030 + idx).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Benefit Cut</label>
                                <select
                                    value={ssCutPercentage}
                                    onChange={e => setSsCutPercentage(Number(e.target.value))}
                                    className="px-3 py-2 text-sm font-medium border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white hover:border-gray-400 transition-colors"
                                >
                                    {Array.from({ length: 26 }, (_, idx) => 10 + idx).map(percent => (
                                        <option key={percent} value={percent}>{percent}%</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={ssCutsActive ? handleShowBaseline : handleProjectCuts}
                                className={`px-6 py-2 text-sm font-bold rounded-lg transition-all shadow-md hover:shadow-lg transform hover:scale-105 ${ssCutsActive
                                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                                    : 'bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-700 hover:to-primary-800'
                                    }`}
                            >
                                {ssCutsActive ? 'Show Baseline' : 'Project Cuts'}
                            </button>
                            <button
                                onClick={() => setShowSsCutInfo(true)}
                                className="w-8 h-8 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-all shadow-md hover:shadow-lg transform hover:scale-110"
                                title="Learn more about SS cuts"
                            >
                                <span className="text-sm font-bold">i</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Earnings Provenance Banner */}
                <div className="px-4 pt-4">
                    <HouseholdWorkStopPanel
                        primaryName={primaryFirstName}
                        spouseName={spouseFirstName}
                        rungs={householdWorkStopRungs}
                    />

                    {!showPiaSourceBanner ? null : (
                        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 mb-4">
                            <div className="font-semibold text-emerald-900">
                                {usingWorkshopForChart ? 'Calculated PIA On The Chart' : 'Earnings Record On File'}
                            </div>
                            <p className="text-sm text-emerald-800 mt-1">
                                {scenario.provenance !== PROVENANCE.ESTIMATED && (
                                    <>
                                        We have {earningsRecordPhrase} saved
                                        {(workStopLadders.spouse1 || workStopLadders.spouse2)
                                            ? ', and the work-stop comparison below is calculated from it'
                                            : ''}.
                                    </>
                                )}
                                {usingWorkshopForChart ? (
                                    <>
                                        {' '}The benefit amounts in {planLabel(scenario)} use the PIA you
                                        calculated in the PIA Calculator, including the future years you set
                                        {workshopThroughYear != null ? ` (through ${workshopThroughYear})` : ''}.
                                    </>
                                ) : usingEarningsForChart ? (
                                    <>
                                        {' '}The benefit amounts in {planLabel(scenario)} come from that
                                        record, using only years already on file (not assumed future earnings).
                                    </>
                                ) : (
                                    <>
                                        {' '}The benefit amounts in {planLabel(scenario)} currently use the
                                        PIA you entered.
                                    </>
                                )}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {(hasSpouse1Earnings || scenario.piaSource.spouse1 === 'workshop') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (scenario.piaSource.spouse1 === 'profile') {
                                                dispatch({ type: 'SET_PIA_SOURCE', person: 'spouse1', source: 'earnings' });
                                            } else {
                                                disableWorkshopPia('spouse1');
                                                dispatch({ type: 'SET_PIA_SOURCE', person: 'spouse1', source: 'profile' });
                                            }
                                        }}
                                        className="px-3 py-1 text-xs font-semibold rounded-full bg-white border border-emerald-400 text-emerald-800 hover:bg-emerald-100"
                                    >
                                        {scenario.piaSource.spouse1 === 'profile'
                                            ? `Use ${primaryFirstName}'s earnings-based PIA`
                                            : `Use ${primaryFirstName}'s entered PIA`}
                                    </button>
                                )}
                                {(hasSpouse2Earnings || scenario.piaSource.spouse2 === 'workshop') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (scenario.piaSource.spouse2 === 'profile') {
                                                dispatch({ type: 'SET_PIA_SOURCE', person: 'spouse2', source: 'earnings' });
                                            } else {
                                                disableWorkshopPia('spouse2');
                                                dispatch({ type: 'SET_PIA_SOURCE', person: 'spouse2', source: 'profile' });
                                            }
                                        }}
                                        className="px-3 py-1 text-xs font-semibold rounded-full bg-white border border-emerald-400 text-emerald-800 hover:bg-emerald-100"
                                    >
                                        {scenario.piaSource.spouse2 === 'profile'
                                            ? `Use ${spouseFirstName}'s earnings-based PIA`
                                            : `Use ${spouseFirstName}'s entered PIA`}
                                    </button>
                                )}
                            </div>
                            {vintageNotes.map((note) => (
                                <p key={note.kind + note.person} className="text-sm text-amber-800 mt-2">
                                    {note.message}
                                </p>
                            ))}
                            {birthYearConflicts.map((note) => (
                                <p key={note.person} className="text-sm text-amber-800 mt-2">
                                    {note.message}
                                </p>
                            ))}
                        </div>
                    )}

                    {ladderPeople.map(({ person, label, rungs, record }) => (
                        <div key={person} className="rounded-lg border border-slate-200 bg-white px-4 py-3 mb-4">
                            <div className="font-semibold text-slate-900 mb-1">
                                What if {label} stop working at…
                            </div>
                            <p className="text-xs text-slate-500 mb-2">
                                These figures are the PIA if work stops at that age — not the benefit if you file then.
                            </p>
                            <div className="grid grid-cols-4 gap-3">
                                {rungs.map((rung) => (
                                    <div key={rung.stopAge} className="text-center">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Stop at {rung.stopAge}</div>
                                        <div className="text-lg font-semibold text-slate-900">
                                            ${Math.round(rung.pia).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-slate-500">PIA at FRA</div>
                                    </div>
                                ))}
                            </div>
                            {rungs.length > 1 &&
                                rungs[0].pia === rungs[rungs.length - 1].pia &&
                                hasThirtyFiveNonZeroYears(record) && (
                                <p className="text-sm text-emerald-700 mt-3">
                                    Good news — {label} already has 35 strong earnings years. Working longer
                                    has very little effect on this Social Security calculation.
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Chart Container */}
                <div className="flex-1 p-4 overflow-auto">

                    {/* Early/Late Toggle Switch */}
                    {chartView === 'earlyLate' && (
                        <div className="mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center justify-center gap-2">
                                <span className={`text-sm font-medium transition-colors ${!showMonthlyCashflow ? 'text-primary-600' : 'text-gray-500'}`}>
                                    Annual
                                </span>
                                <button
                                    onClick={() => setShowMonthlyCashflow(!showMonthlyCashflow)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${showMonthlyCashflow ? 'bg-primary-600' : 'bg-gray-300'
                                        }`}
                                    role="switch"
                                    aria-checked={showMonthlyCashflow}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showMonthlyCashflow ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                                <span className={`text-sm font-medium transition-colors ${showMonthlyCashflow ? 'text-primary-600' : 'text-gray-500'}`}>
                                    Monthly
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Flow View Controls */}
                    {chartView === 'flow' && (
                        <div className="mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Age: <span className="text-primary-600 font-bold">{flowAge}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="8"
                                        value={[62, 67, 70, 75, 80, 85, 90, 95, 100].indexOf(flowAge)}
                                        onChange={(e) => setFlowAge([62, 67, 70, 75, 80, 85, 90, 95, 100][parseInt(e.target.value)])}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                                        step="1"
                                    />
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>62</span>
                                        <span>67</span>
                                        <span>70</span>
                                        <span>75</span>
                                        <span>80</span>
                                        <span>85</span>
                                        <span>90</span>
                                        <span>95</span>
                                        <span>100</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="text-sm font-medium text-gray-700">Monthly Expense Needs This Year:</label>
                                    <input
                                        type="number"
                                        value={monthlyNeeds}
                                        onChange={(e) => setMonthlyNeeds(Number(e.target.value))}
                                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-32"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 relative" style={{ height: ['monthly', 'cumulative', 'combined', 'earlyLate', 'post70'].includes(chartView) ? 'calc(100% - 80px)' : '100%' }}>
                        {/* Animation Replay Button */}
                        {chartView === 'monthly' && (
                            <button
                                onClick={() => setAnimationKey(prev => prev + 1)}
                                className="absolute top-2 left-2 z-10 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-full transition-all duration-200 border border-transparent hover:border-gray-200 shadow-sm hover:shadow"
                                title="Replay Animation"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                            </button>
                        )}
                        {
                            chartView === 'flow' ? (
                                <FlowVisualization
                                    scenarioData={scenarioData}
                                    age={flowAge}
                                    monthlyNeeds={monthlyNeeds}
                                    activeRecordView={activeRecordView}
                                    isMarried={isMarried}
                                    inflationRate={inflation}
                                    piaStrategy={piaStrategy}
                                    setPiaStrategy={setPiaStrategy}
                                    preferredFilingYear={spouse1PreferredYear}
                                    preferredFilingMonth={spouse1PreferredMonth}
                                    currentAge={(() => {
                                        const dob = new Date(spouse1Dob);
                                        const today = new Date();
                                        let age = today.getFullYear() - dob.getFullYear();
                                        const monthDiff = today.getMonth() - dob.getMonth();
                                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                                            age--;
                                        }
                                        return age;
                                    })()}
                                    selectedStrategy={selectedStrategy}
                                    setSelectedStrategy={setSelectedStrategy}
                                />
                            ) : chartView === 'race' ? (
                                <RaceTrackVisualization
                                    scenarioData={scenarioData}
                                    activeRecordView={activeRecordView}
                                    isMarried={isMarried}
                                    inflationRate={inflation}
                                    currentAge={(() => {
                                        const dob = new Date(spouse1Dob);
                                        const today = new Date();
                                        let age = today.getFullYear() - dob.getFullYear();
                                        const monthDiff = today.getMonth() - dob.getMonth();
                                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                                            age--;
                                        }
                                        return age;
                                    })()}
                                />
                            ) : chartView === 'sscuts'
                                ? (ssCutsChartData && ssCutsChartData.labels && ssCutsChartData.labels.length > 0
                                    ? <Bar key="sscuts-chart" data={chartData} options={chartOptions} />
                                    : (
                                        <div className="h-full flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                                            <p className="text-center px-8 text-sm">
                                                Adjust the year or percentage and press "Project" to see the impact of a trust-fund cut.<br />
                                                Then toggle to the baseline to compare.
                                            </p>
                                        </div>
                                    ))
                                : chartView === 'monthly' ? <Bar key={`monthly-${animationKey}`} data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} /> :
                                    chartView === 'cumulative' ? <Line data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} /> :
                                        chartView === 'combined' ? <Bar data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} /> :
                                            chartView === 'earlyLate' ? <Line data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} /> :
                                                chartView === 'bubble' ? (
                                                    <div className="h-full flex flex-col p-6 bg-white overflow-auto">
                                                        {/* Age Slider */}
                                                        <div className="mb-8">
                                                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Age to View</h3>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex-1 relative">
                                                                    {(() => {
                                                                        const keyAges = [62, 67, 70, 75, 80, 85, 90, 95, 100];
                                                                        const currentIndex = keyAges.indexOf(bubbleAge);
                                                                        const sliderIndex = currentIndex !== -1 ? currentIndex : keyAges.indexOf(70);

                                                                        return (
                                                                            <>
                                                                                <input
                                                                                    type="range"
                                                                                    min="0"
                                                                                    max="8"
                                                                                    step="1"
                                                                                    value={sliderIndex}
                                                                                    onChange={(e) => setBubbleAge(keyAges[Number(e.target.value)])}
                                                                                    className="w-full"
                                                                                />
                                                                                {/* Age markers */}
                                                                                <div className="flex justify-between text-xs text-gray-500 mt-2">
                                                                                    {keyAges.map(age => (
                                                                                        <button
                                                                                            key={age}
                                                                                            onClick={() => setBubbleAge(age)}
                                                                                            className={`hover:text-primary-600 hover:font-semibold transition-colors ${bubbleAge === age ? 'text-primary-600 font-semibold' : ''}`}
                                                                                        >
                                                                                            {age}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className="text-2xl font-bold text-primary-600 min-w-[80px] text-center">
                                                                    Age {bubbleAge}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Bubble Visualization - Stacked Vertically */}
                                                        <div className="flex-1 flex flex-col justify-center gap-16 py-8">
                                                            {bubbleChartData && (() => {
                                                                // Dramatic bubble sizes - Moon → Earth → Sun effect
                                                                const monthlySize = 80;   // Moon
                                                                const annualSize = 200;   // Earth (2.5x)
                                                                const assetSize = 400;    // Sun (5x)

                                                                // Filing at 70 sizes
                                                                const size70Monthly = monthlySize;
                                                                const size70Annual = annualSize;
                                                                const size70Asset = assetSize;

                                                                // Filing at 62 sizes
                                                                const size62Monthly = monthlySize;
                                                                const size62Annual = annualSize;
                                                                const size62Asset = assetSize;

                                                                return (
                                                                    <>
                                                                        {/* Filing at 70 - Top */}
                                                                        <div className="flex flex-col items-center">
                                                                            <h4 className="text-xl font-semibold mb-6" style={{ color: SCENARIO_INK.age70 }}>Filing at Age 70</h4>
                                                                            <div className="relative w-full h-80 flex items-center justify-center">
                                                                                {/* Monthly bubble - Left */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size70Monthly}px`,
                                                                                        height: `${size70Monthly}px`,
                                                                                        left: '20%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age70, 0.55),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age70, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-1">
                                                                                        <div className="text-xs">Monthly</div>
                                                                                        <div className="text-sm font-bold">{currencyFormatter.format(bubbleChartData.age70.monthly)}</div>
                                                                                    </div>
                                                                                </div>
                                                                                {/* Annual bubble - Center */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size70Annual}px`,
                                                                                        height: `${size70Annual}px`,
                                                                                        left: '50%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age70, 0.35),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age70, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-1">
                                                                                        <div className="text-xs">Annual</div>
                                                                                        <div className="text-lg font-bold">{currencyFormatter.format(bubbleChartData.age70.annual)}</div>
                                                                                    </div>
                                                                                </div>
                                                                                {/* Asset equivalent bubble - Right */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size70Asset}px`,
                                                                                        height: `${size70Asset}px`,
                                                                                        left: '80%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age70, 0.18),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age70, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-2">
                                                                                        <div className="text-xs">4% Asset</div>
                                                                                        <div className="text-base font-bold">{currencyFormatter.format(bubbleChartData.age70.assetEquiv)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-xs text-gray-600 mt-4 text-center space-y-1">
                                                                                <p>Monthly: {currencyFormatter.format(bubbleChartData.age70.monthly)}</p>
                                                                                <p>Annual: {currencyFormatter.format(bubbleChartData.age70.annual)}</p>
                                                                                <p>Asset Equivalent: {currencyFormatter.format(bubbleChartData.age70.assetEquiv)}</p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Filing at 62 - Bottom */}
                                                                        <div className="flex flex-col items-center">
                                                                            <h4 className="text-xl font-semibold mb-6" style={{ color: SCENARIO_INK.age62 }}>Filing at Age 62</h4>
                                                                            <div className="relative w-full h-80 flex items-center justify-center">
                                                                                {/* Monthly bubble - Left */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size62Monthly}px`,
                                                                                        height: `${size62Monthly}px`,
                                                                                        left: '20%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age62, 0.55),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age62, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-1">
                                                                                        <div className="text-xs">Monthly</div>
                                                                                        <div className="text-sm font-bold">{currencyFormatter.format(bubbleChartData.age62.monthly)}</div>
                                                                                    </div>
                                                                                </div>
                                                                                {/* Annual bubble - Center */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size62Annual}px`,
                                                                                        height: `${size62Annual}px`,
                                                                                        left: '50%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age62, 0.35),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age62, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-1">
                                                                                        <div className="text-xs">Annual</div>
                                                                                        <div className="text-lg font-bold">{currencyFormatter.format(bubbleChartData.age62.annual)}</div>
                                                                                    </div>
                                                                                </div>
                                                                                {/* Asset equivalent bubble - Right */}
                                                                                <div
                                                                                    className="absolute rounded-full flex items-center justify-center text-gray-900 font-bold transition-all duration-500 ease-in-out"
                                                                                    style={{
                                                                                        width: `${size62Asset}px`,
                                                                                        height: `${size62Asset}px`,
                                                                                        left: '80%',
                                                                                        top: '50%',
                                                                                        transform: 'translate(-50%, -50%)',
                                                                                        background: withAlpha(SCENARIO_COLORS.age62, 0.18),
                                                                                        border: `1px solid ${withAlpha(SCENARIO_COLORS.age62, 0.6)}`,
                                                                                        opacity: 0.9
                                                                                    }}
                                                                                >
                                                                                    <div className="text-center px-2">
                                                                                        <div className="text-xs">4% Asset</div>
                                                                                        <div className="text-base font-bold">{currencyFormatter.format(bubbleChartData.age62.assetEquiv)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-xs text-gray-600 mt-4 text-center space-y-1">
                                                                                <p>Monthly: {currencyFormatter.format(bubbleChartData.age62.monthly)}</p>
                                                                                <p>Annual: {currencyFormatter.format(bubbleChartData.age62.annual)}</p>
                                                                                <p>Asset Equivalent: {currencyFormatter.format(bubbleChartData.age62.assetEquiv)}</p>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                ) :
                                                    post70View === 'combined' ? <Bar data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} /> :
                                                        <Line data={chartData} options={{ ...chartOptions, maintainAspectRatio: false }} />
                        }
                    </div>

                    {/* Retirement Stages Slider - Below chart */}
                    {['monthly', 'cumulative', 'combined', 'earlyLate', 'post70', 'sscuts'].includes(chartView) && (
                        <div className="space-y-3 mt-4">
                            {isTimelineExpanded && isTimelineReachable({ isMarried, spouse1Dob, spouse2Dob }) ? (
                                <div>
                                    <button
                                        onClick={() => setIsTimelineExpanded(false)}
                                        className="text-xs font-semibold text-primary-600 hover:text-primary-700 mb-2"
                                    >
                                        &uarr; Collapse to Go-Go/Slow-Go/No-Go sliders
                                    </button>
                                    <OurLifelongTimeline
                                        primaryLabel={primaryFirstName}
                                        spouseLabel={spouseFirstName}
                                        spouse1Dob={spouse1Dob}
                                        spouse2Dob={spouse2Dob}
                                        spouse1Pia={chartSpouse1Pia}
                                        spouse2Pia={chartSpouse2Pia}
                                        spouse1PreferredYear={spouse1PreferredYear}
                                        spouse2PreferredYear={spouse2PreferredYear}
                                        inflation={inflation}
                                        prematureDeath={prematureDeath}
                                        deathAge={deathAge}
                                        combinedProjections={scenarioData.combinedProjections}
                                        goGoEndAge={goGoEndAge}
                                        setGoGoEndAge={setGoGoEndAge}
                                        slowGoEndAge={slowGoEndAge}
                                        setSlowGoEndAge={setSlowGoEndAge}
                                        isDraggingGoGo={isDraggingGoGo}
                                        setIsDraggingGoGo={setIsDraggingGoGo}
                                        isDraggingSlowGo={isDraggingSlowGo}
                                        setIsDraggingSlowGo={setIsDraggingSlowGo}
                                        spouseGoGoEndAge={spouseGoGoEndAge}
                                        setSpouseGoGoEndAge={setSpouseGoGoEndAge}
                                        spouseSlowGoEndAge={spouseSlowGoEndAge}
                                        setSpouseSlowGoEndAge={setSpouseSlowGoEndAge}
                                        isDraggingSpouseGoGo={isDraggingSpouseGoGo}
                                        setIsDraggingSpouseGoGo={setIsDraggingSpouseGoGo}
                                        isDraggingSpouseSlowGo={isDraggingSpouseSlowGo}
                                        setIsDraggingSpouseSlowGo={setIsDraggingSpouseSlowGo}
                                        onDeeperDive={(year) => {
                                            const primaryBirthYear = new Date(spouse1Dob).getFullYear();
                                            setSelectedYearAge(year - primaryBirthYear);
                                            setShowYearModal(true);
                                        }}
                                        longevitySummary={longevitySummary}
                                        onPersonalizeClick={() => navigate('/life-expectancy')}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <RetirementStagesSlider
                                        label={isMarried ? primaryFirstName : undefined}
                                        goGoEndAge={goGoEndAge}
                                        setGoGoEndAge={setGoGoEndAge}
                                        slowGoEndAge={slowGoEndAge}
                                        setSlowGoEndAge={setSlowGoEndAge}
                                        isDraggingGoGo={isDraggingGoGo}
                                        setIsDraggingGoGo={setIsDraggingGoGo}
                                        isDraggingSlowGo={isDraggingSlowGo}
                                        setIsDraggingSlowGo={setIsDraggingSlowGo}
                                    />
                                    {isMarried && (
                                        <RetirementStagesSlider
                                            label={spouseFirstName}
                                            goGoEndAge={spouseGoGoEndAge}
                                            setGoGoEndAge={setSpouseGoGoEndAge}
                                            slowGoEndAge={spouseSlowGoEndAge}
                                            setSlowGoEndAge={setSpouseSlowGoEndAge}
                                            isDraggingGoGo={isDraggingSpouseGoGo}
                                            setIsDraggingGoGo={setIsDraggingSpouseGoGo}
                                            isDraggingSlowGo={isDraggingSpouseSlowGo}
                                            setIsDraggingSlowGo={setIsDraggingSpouseSlowGo}
                                        />
                                    )}
                                    {isTimelineReachable({ isMarried, spouse1Dob, spouse2Dob }) && (
                                        <button
                                            onClick={() => setIsTimelineExpanded(true)}
                                            className="mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700"
                                        >
                                            &darr; See Our Lifelong Timeline
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SS Cuts Summary */}
                    {chartView === 'sscuts' && ssCutsSummary.length > 0 && (
                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">Summary</h4>
                            <p className="text-xs text-gray-600 mb-2">
                                {ssCutsActive ? 'Cuts Applied' : 'Baseline (No Cuts)'}
                            </p>
                            <ul className="space-y-1">
                                {ssCutsSummary.map(item => {
                                    const diff = item.delta;
                                    return (
                                        <li key={item.label} className="text-xs">
                                            <span className="font-medium">{item.label}:</span>{' '}
                                            {currencyFormatter.format(Math.round(item.baseline))} ➝{' '}
                                            {currencyFormatter.format(Math.round(item.projected))}
                                            <span className={`ml-1 font-semibold ${diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                ({currencyFormatter.format(Math.round(diff))})
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* SS Cuts Info Modal */}
            {showSsCutInfo && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl p-6 animate-slide-in">
                        <h3 className="text-2xl font-bold text-primary-700 mb-4">About the SS Cuts Scenario</h3>
                        <div className="space-y-3 text-gray-700 leading-relaxed">
                            <p>
                                <strong>The default values (2034, 21% cut)</strong> represent the most recent consensus projection from the Social Security Board of Trustees regarding when the trust fund reserves may be depleted and the expected benefit reduction if no legislative action is taken.
                            </p>
                            <p>
                                When trust fund reserves are exhausted, incoming payroll taxes would only cover a portion of scheduled benefits, resulting in an automatic across-the-board reduction unless Congress intervenes. This tool lets you model different scenarios by adjusting the year and percentage to stress-test your claiming strategy.
                            </p>
                            <p>
                                Use this projection to explore how delaying benefits, coordinating with a spouse, or using bridge income may help offset a potential future cut. The calculation maintains your inflation assumption and applies the reduction to both monthly payments and lifetime totals from the selected year forward.
                            </p>
                        </div>
                        <div className="flex justify-end mt-6">
                            <Button onClick={() => setShowSsCutInfo(false)} variant="primary">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIA & FRA Information Modal */}
            {showPiaFraModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h2 className="text-2xl font-bold text-gray-900">Understanding PIA & FRA</h2>
                                <button
                                    onClick={() => setShowPiaFraModal(false)}
                                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>

                            {/* What is PIA? - MOVED TO TOP */}
                            <div className="mb-6">
                                <h3 className="text-xl font-semibold text-primary-600 mb-3">What is PIA?</h3>
                                <p className="text-gray-700 mb-3">
                                    <strong>PIA (Primary Insurance Amount)</strong> is your monthly benefit amount at Full Retirement Age. It's calculated based on your 35 highest-earning years.
                                </p>
                                <p className="text-gray-700 mb-4">
                                    If you claim before FRA, your benefit is reduced. If you wait until after FRA, your benefit is increased.
                                </p>
                            </div>

                            {/* How to Find Your PIA */}
                            <div className="mb-6">
                                <h3 className="text-xl font-semibold text-primary-600 mb-3">How to Find Your PIA</h3>
                                <p className="text-gray-700 mb-3">
                                    You can get your specific benefit estimate at{' '}
                                    <a
                                        href="https://www.ssa.gov"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary-600 hover:text-primary-700 underline font-medium"
                                    >
                                        SSA.gov
                                    </a>{' '}
                                    by creating a "my Social Security" account.
                                </p>

                                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm font-semibold text-gray-900">Don't know your number?</p>
                                            <p className="text-sm text-gray-700 mt-1">
                                                The average individual Social Security benefit in 2025 is $2,006/month. Use this as a starting point, then get your actual estimate from SSA.gov for more accurate planning.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* What is FRA? - MOVED TO BOTTOM */}
                            <div className="mb-6">
                                <h3 className="text-xl font-semibold text-primary-600 mb-3">What is FRA?</h3>
                                <p className="text-gray-700 mb-4">
                                    <strong>FRA (Full Retirement Age)</strong> is the age at which you're entitled to receive 100% of your Social Security benefit.
                                </p>

                                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm font-semibold text-gray-900">We calculate your FRA automatically</p>
                                            <p className="text-sm text-gray-700 mt-1">
                                                Based on your date of birth, we automatically determine your Full Retirement Age and use it in all calculations.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                    <h4 className="font-semibold text-gray-900 mb-3">Your FRA by Birth Year:</h4>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead>
                                                <tr className="bg-primary-600 text-white">
                                                    <th className="px-4 py-2 text-left text-sm font-semibold">Year of Birth</th>
                                                    <th className="px-4 py-2 text-left text-sm font-semibold">Full Retirement Age</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                <tr>
                                                    <td className="px-4 py-2 text-sm text-gray-900">1955</td>
                                                    <td className="px-4 py-2 text-sm text-gray-700">66 and 2 months</td>
                                                </tr>
                                                <tr className="bg-gray-50">
                                                    <td className="px-4 py-2 text-sm text-gray-900">1956</td>
                                                    <td className="px-4 py-2 text-sm text-gray-700">66 and 4 months</td>
                                                </tr>
                                                <tr>
                                                    <td className="px-4 py-2 text-sm text-gray-900">1957</td>
                                                    <td className="px-4 py-2 text-sm text-gray-700">66 and 6 months</td>
                                                </tr>
                                                <tr className="bg-gray-50">
                                                    <td className="px-4 py-2 text-sm text-gray-900">1958</td>
                                                    <td className="px-4 py-2 text-sm text-gray-700">66 and 8 months</td>
                                                </tr>
                                                <tr>
                                                    <td className="px-4 py-2 text-sm text-gray-900">1959</td>
                                                    <td className="px-4 py-2 text-sm text-gray-700">66 and 10 months</td>
                                                </tr>
                                                <tr className="bg-primary-50">
                                                    <td className="px-4 py-2 text-sm font-semibold text-primary-700">1960 or later</td>
                                                    <td className="px-4 py-2 text-sm font-semibold text-primary-700">67</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-sm italic text-gray-600 mt-3">
                                        For 95% of people planning today, FRA is age 67.
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end mt-6">
                                <Button onClick={() => setShowPiaFraModal(false)} variant="primary">
                                    Got It
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Year Detail Modal */}
            {showYearModal && scenarioData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900">
                                        Benefits at Age {(() => {
                                            const primaryAge = selectedYearAge;
                                            const spouseBirthYear = isMarried ? new Date(spouse2Dob).getFullYear() : null;
                                            const primaryBirthYear = new Date(spouse1Dob).getFullYear();

                                            if (isMarried && spouseBirthYear) {
                                                const spouseAge = selectedYearAge + (primaryBirthYear - spouseBirthYear);
                                                if (primaryAge === spouseAge) {
                                                    return `${primaryAge}`;
                                                } else {
                                                    return `${primaryAge}/${spouseAge}`;
                                                }
                                            }
                                            return `${primaryAge}`;
                                        })()}
                                    </h2>
                                    <p className="text-sm text-gray-600 mt-1">Comparing three filing strategies</p>
                                </div>
                                <button
                                    onClick={() => setShowYearModal(false)}
                                    className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Three columns for three strategies */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {(() => {
                                    const primaryBirthYear = new Date(spouse1Dob).getFullYear();
                                    const calendarYear = primaryBirthYear + selectedYearAge;

                                    const projections = activeRecordView === 'primary'
                                        ? scenarioData.primaryProjections
                                        : activeRecordView === 'spouse' && scenarioData.spouseProjections
                                            ? scenarioData.spouseProjections
                                            : scenarioData.combinedProjections;

                                    // Cumulative income since each strategy's own start -- not a fixed age-70
                                    // landmark (the old logic subtracted the primary person's own age-70
                                    // cumulative from every column, including File at 62, which produced a
                                    // number with no coherent meaning for that strategy and didn't even match
                                    // File at 70's own start when the spouse is the later-born one). This
                                    // matches Our Lifelong Timeline's convention so the two views always agree.
                                    // - File at 62/70 (combined view): reuse getHouseholdBucket, the exact
                                    //   function the Timeline itself uses -- it masks to zero until the
                                    //   later-born spouse also reaches that filing age.
                                    // - File at 67 (combined view): this column is actually each spouse's own
                                    //   preferred/chosen filing age (see `preferred` below), not a uniform
                                    //   "both file at 67" hypothesis, so getHouseholdBucket's single-filingAge
                                    //   shape doesn't apply -- use the raw preferred-scenario cumulative
                                    //   directly, same as the Timeline's own "Your Plan" box.
                                    // - Any single-person view (primary/spouse only): there's no "later
                                    //   spouse" concept, and calculateProjection's own cumulative dict already
                                    //   starts at zero before that person's filing year -- use it directly.
                                    const deathYearNumber = primaryBirthYear + Number(deathAge);

                                    // Shared by both cumulative metrics below: the same cumulative-bearing
                                    // source (household bucket for 62/70, raw preferred/single-person
                                    // projection otherwise) that cumulativeSinceFiling already used, so
                                    // "Cumulative Since 70" reads from the exact same numbers rather than a
                                    // second, possibly-inconsistent source.
                                    const getCumulativeSource = (filingAge, projection) => {
                                        if (activeRecordView === 'primary' || activeRecordView === 'spouse') {
                                            return projection;
                                        }
                                        if (filingAge === 'preferred') {
                                            return projection;
                                        }
                                        return getHouseholdBucket({
                                            filingAge,
                                            spouse1Pia: chartSpouse1Pia,
                                            spouse1Dob,
                                            spouse2Pia: chartSpouse2Pia,
                                            spouse2Dob,
                                            inflation,
                                            prematureDeath,
                                            deathYear: deathYearNumber
                                        });
                                    };

                                    const cumulativeSinceFiling = (filingAge, projection) =>
                                        getCumulativeSource(filingAge, projection).cumulative[calendarYear] || 0;

                                    // "Cumulative Since 70" -- a second, deliberately different comparison
                                    // basis from "Cumulative Since Filing" above. Age 70 is the first point
                                    // every strategy is actually on the same footing: the File at 62/67
                                    // strategies already had years of a head start the File at 70 strategy
                                    // never had a chance to match, and once everyone is collecting, that
                                    // earlier head start stops being the interesting question -- this metric
                                    // deliberately excludes those years so all three are compared over the
                                    // same stretch of time. Matches the "Since 70" calculation the Race tab
                                    // already ships (RaceTrackVisualization's calculateRaceData, same
                                    // effectiveBirthYear + age-69-baseline convention) rather than inventing a
                                    // second definition of "since 70" that could disagree with it.
                                    const effectiveBirthYear = (activeRecordView === 'spouse' && scenarioData.birthYearSpouse)
                                        ? scenarioData.birthYearSpouse
                                        : primaryBirthYear;
                                    const age69CalendarYear = effectiveBirthYear + 69;

                                    const cumulativeSince70 = (projection) => {
                                        if (selectedYearAge < 70) return null;
                                        const atCursor = projection.cumulative[calendarYear] || 0;
                                        const atBaseline = projection.cumulative[age69CalendarYear] || 0;
                                        return Math.max(0, atCursor - atBaseline);
                                    };

                                    const strategies = [
                                        {
                                            name: 'File at 70',
                                            color: SCENARIO_INK.age70,
                                            monthly: projections.age70.monthly[calendarYear] || 0,
                                            cumulative: cumulativeSinceFiling(70, projections.age70),
                                            cumulativeSince70: cumulativeSince70(projections.age70),
                                            projection: projections.age70,
                                            filingAge: 70,
                                            started: false
                                        },
                                        {
                                            name: 'File at 67',
                                            color: SCENARIO_INK.preferred,
                                            monthly: projections.preferred.monthly[calendarYear] || 0,
                                            cumulative: cumulativeSinceFiling('preferred', projections.preferred),
                                            cumulativeSince70: cumulativeSince70(projections.preferred),
                                            projection: projections.preferred,
                                            filingAge: 67,
                                            started: false
                                        },
                                        {
                                            name: 'File at 62',
                                            color: SCENARIO_INK.age62,
                                            monthly: projections.age62.monthly[calendarYear] || 0,
                                            cumulative: cumulativeSinceFiling(62, projections.age62),
                                            cumulativeSince70: cumulativeSince70(projections.age62),
                                            projection: projections.age62,
                                            filingAge: 62,
                                            started: false
                                        }
                                    ];

                                    // Find the best strategy
                                    const bestStrategy = strategies.reduce((best, current) =>
                                        current.monthly > best.monthly ? current : best
                                        , strategies[0]);

                                    return strategies.map((strategy, idx) => {
                                        // Annual received in this calendar year = delta of cumulative between this year and prior year
                                        const prevYear = calendarYear - 1;
                                        const cumulativeThis = strategy.projection?.cumulative?.[calendarYear] || 0;
                                        const cumulativePrev = strategy.projection?.cumulative?.[prevYear] || 0;
                                        const annual = Math.max(0, cumulativeThis - cumulativePrev);
                                        // Started if any income is paid in this calendar year (or monthly shown)
                                        strategy.started = (strategy.monthly > 0) || (annual > 0);
                                        // Estimate months paid in this year from annual divided by monthly amount
                                        const monthsPaid = (strategy.monthly > 0)
                                            ? Math.min(12, Math.max(0, Math.round(annual / strategy.monthly)))
                                            : 0;
                                        const isBest = strategy === bestStrategy && strategy.monthly > 0;

                                        return (
                                            <div
                                                key={idx}
                                                className={`relative border-2 rounded-xl p-6 transition-all ${isBest
                                                    ? 'border-green-500 bg-green-50 shadow-lg ring-2 ring-green-200'
                                                    : strategy.started
                                                        ? 'border-gray-200 bg-white hover:shadow-md'
                                                        : 'border-gray-200 bg-gray-50 opacity-75'
                                                    }`}
                                            >
                                                {/* Best badge */}
                                                {isBest && (
                                                    <div className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                                                        🏆 Best
                                                    </div>
                                                )}

                                                {/* Header */}
                                                <div className="text-center mb-4">
                                                    <div className="text-lg font-bold" style={{ color: strategy.color }}>
                                                        {strategy.name}
                                                    </div>
                                                </div>

                                                {/* Status indicator */}
                                                {!strategy.started ? (
                                                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                        <p className="text-sm font-semibold text-yellow-800 text-center">
                                                            ⏳ Not yet eligible
                                                        </p>
                                                        <p className="text-xs text-yellow-700 text-center mt-1">
                                                            Benefits start at age {strategy.filingAge}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                                        <p className="text-sm font-semibold text-green-800 text-center">
                                                            ✓ Receiving benefits
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Monthly benefit */}
                                                <div className="space-y-3">
                                                    <div className="bg-gray-50 rounded-lg p-4">
                                                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                                            Monthly
                                                        </p>
                                                        <p className={`text-2xl font-bold ${strategy.started ? '' : 'text-gray-400'}`} style={strategy.started ? { color: strategy.color } : undefined}>
                                                            {strategy.started ? currencyFormatter.format(Math.round(strategy.monthly)) : '$0'}
                                                        </p>
                                                    </div>

                                                    {/* Annual benefit */}
                                                    <div className="bg-gray-50 rounded-lg p-4">
                                                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                                            Annual
                                                        </p>
                                                        <p className={`text-xl font-bold ${strategy.started ? '' : 'text-gray-400'}`} style={strategy.started ? { color: strategy.color } : undefined}>
                                                            {strategy.started ? currencyFormatter.format(Math.round(annual)) : '$0'}
                                                        </p>
                                                        {strategy.started && monthsPaid > 0 && (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {monthsPaid === 12 ? '12 months paid this year' : `${monthsPaid} months paid this year`}
                                                            </p>
                                                        )}
                                                        {strategy.started && monthsPaid > 0 && monthsPaid < 12 && (
                                                            <p className="text-[11px] text-gray-500 mt-1 italic">
                                                                Includes partial-year payments due to mid-year filing.
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Cumulative Since Age 70 */}
                                                    {selectedYearAge >= 70 && (
                                                        <div className="bg-gray-50 rounded-lg p-4">
                                                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                                                Cumulative Since Filing
                                                            </p>
                                                            <p className={`text-lg font-bold ${strategy.started ? '' : 'text-gray-400'}`} style={strategy.started ? { color: strategy.color } : undefined}>
                                                                {currencyFormatter.format(Math.round(strategy.cumulative))}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Cumulative Since 70 -- the point every strategy is on the same
                                                        footing; matches the Race tab's own "Since 70" calculation. */}
                                                    {selectedYearAge >= 70 && (
                                                        <div className="bg-gray-50 rounded-lg p-4">
                                                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                                                Cumulative Since 70
                                                            </p>
                                                            <p className={`text-lg font-bold ${strategy.started ? '' : 'text-gray-400'}`} style={strategy.started ? { color: strategy.color } : undefined}>
                                                                {currencyFormatter.format(Math.round(strategy.cumulativeSince70))}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Years receiving (if applicable) */}
                                                    {strategy.started && (
                                                        <div className="pt-3 border-t border-gray-200">
                                                            <p className="text-xs text-gray-600">
                                                                <span className="font-semibold">Receiving for:</span> {(() => {
                                                                    // Find first calendar year with income in this projection
                                                                    const years = Object.keys(strategy.projection?.monthly || {}).map(Number).sort((a, b) => a - b);
                                                                    const firstPaidYear = years.find(y => (strategy.projection?.monthly?.[y] || 0) > 0);
                                                                    if (!firstPaidYear) return 0;
                                                                    return Math.max(0, calendarYear - firstPaidYear);
                                                                })()} years
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>


                            {/* Summary comparison */}
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm font-semibold text-blue-900 mb-2">
                                    💡 Key Insight
                                </p>
                                <div className="text-sm text-blue-800">
                                    {(() => {
                                        const primaryBirthYear = new Date(spouse1Dob).getFullYear();
                                        const calendarYear = primaryBirthYear + selectedYearAge;

                                        const projections = activeRecordView === 'primary'
                                            ? scenarioData.primaryProjections
                                            : activeRecordView === 'spouse' && scenarioData.spouseProjections
                                                ? scenarioData.spouseProjections
                                                : scenarioData.combinedProjections;

                                        // Monthly Calculation
                                        const monthly62 = projections.age62.monthly[calendarYear] || 0;
                                        const monthly70 = projections.age70.monthly[calendarYear] || 0;

                                        // Annual Calculation
                                        // Annual received in this calendar year = delta of cumulative between this year and prior year
                                        const prevYear = calendarYear - 1;

                                        const cumThis70 = projections.age70.cumulative[calendarYear] || 0;
                                        const cumPrev70 = projections.age70.cumulative[prevYear] || 0;
                                        const annual70 = Math.max(0, cumThis70 - cumPrev70);

                                        const cumThis62 = projections.age62.cumulative[calendarYear] || 0;
                                        const cumPrev62 = projections.age62.cumulative[prevYear] || 0;
                                        const annual62 = Math.max(0, cumThis62 - cumPrev62);

                                        // "Cumulative Since 70" -- reads the exact same raw projection dictionaries,
                                        // via the exact same formula, as the strategy cards' own "Cumulative Since 70"
                                        // figures above (not routed through getHouseholdBucket, unlike "Cumulative
                                        // Since Filing" -- see the cards' IIFE for that convention). Deliberately not
                                        // "cumulative since each strategy's own filing" either: that basis gives File
                                        // at 62 several extra years of head start File at 70 never had a chance to
                                        // match, so it reports a smaller gap than this fair, same-footing comparison.
                                        // Matching the cards' own data path (not just the same concept) is what keeps
                                        // this box from ever disagreeing with the numbers printed a few inches above it.
                                        const effectiveBirthYear = (activeRecordView === 'spouse' && scenarioData.birthYearSpouse)
                                            ? scenarioData.birthYearSpouse
                                            : primaryBirthYear;
                                        const age69CalendarYear = effectiveBirthYear + 69;
                                        const cumulativeSince70 = (projection) => {
                                            const atCursor = projection.cumulative[calendarYear] || 0;
                                            const atBaseline = projection.cumulative[age69CalendarYear] || 0;
                                            return Math.max(0, atCursor - atBaseline);
                                        };
                                        const cumTotal70 = cumulativeSince70(projections.age70);
                                        const cumTotal62 = cumulativeSince70(projections.age62);


                                        if (selectedYearAge < 62) {
                                            return <p>No benefits are available before age 62.</p>;
                                        } else if (selectedYearAge < 67) {
                                            return <p>Only early filing (age 62) provides income at this age. Later filing strategies require waiting longer.</p>;
                                        } else if (monthly70 > monthly62) {
                                            const monthlyDiff = monthly70 - monthly62;
                                            const annualDiff = annual70 - annual62;
                                            const cumTotalDiff = cumTotal70 - cumTotal62;
                                            const percentIncrease = ((monthlyDiff / monthly62) * 100).toFixed(0);

                                            return (
                                                <>
                                                    <p className="mb-1">Filing at 70 provides:</p>
                                                    <ul className="list-disc pl-5 space-y-1">
                                                        <li>{currencyFormatter.format(Math.round(monthlyDiff))} more per month ({percentIncrease}% increase) compared to filing at 62.</li>
                                                        <li>{currencyFormatter.format(Math.round(annualDiff))} more per year compared to filing at 62.</li>
                                                        <li>{currencyFormatter.format(Math.round(cumTotalDiff))} more cumulative since age 70, compared to filing at 62.</li>
                                                    </ul>
                                                </>
                                            );
                                        } else {
                                            // Fallback for cases where 70 isn't higher yet (e.g. before age 70)
                                            return <p>File at 70 strategy hasn't started full payments yet.</p>;
                                        }
                                    })()}
                                </div>
                            </div>

                            <div className="flex justify-end mt-6">
                                <Button onClick={() => setShowYearModal(false)} variant="primary">
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                </div >
            )}

            {/* Already Filed Modal */}
            {
                showAlreadyFiledModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <h2 className="text-2xl font-bold text-gray-900">Already Receiving Benefits?</h2>
                                    <button
                                        onClick={() => setShowAlreadyFiledModal(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* What We Do */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">How This Works</h3>
                                    <p className="text-gray-700 mb-4">
                                        When you're already receiving Social Security benefits, we use a different calculation approach:
                                    </p>

                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-1">
                                                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">We use your actual current monthly amount</p>
                                                <p className="text-sm text-gray-600">No need to calculate from PIA - we start with what you're receiving now</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-1">
                                                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">We adjust it forward for COLA/inflation</p>
                                                <p className="text-sm text-gray-600">Your benefit grows with cost-of-living adjustments over time</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-1">
                                                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">Filing age helps us calculate survivor benefits</p>
                                                <p className="text-sm text-gray-600">If married/widowed, we need to know when you filed for accurate planning</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Where to Find Current Benefit */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">Where to Find Your Current Benefit</h3>
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                        <p className="text-sm text-gray-700"><strong>1. Check your bank statement</strong> - Look for the monthly direct deposit from Social Security</p>
                                        <p className="text-sm text-gray-700"><strong>2. Log in to{' '}
                                            <a
                                                href="https://www.ssa.gov"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary-600 hover:text-primary-700 underline"
                                            >
                                                SSA.gov
                                            </a>
                                        </strong> - Your benefit details are in your "my Social Security" account</p>
                                        <p className="text-sm text-gray-700"><strong>3. Review your Social Security statement</strong> - The mailed or online statement shows your current benefit</p>
                                    </div>
                                </div>

                                {/* Important Note */}
                                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm font-semibold text-gray-900">Important: Use Gross Amount</p>
                                            <p className="text-sm text-gray-700 mt-1">
                                                Enter the gross amount BEFORE any deductions (Medicare premiums, taxes, etc.). We want your full Social Security benefit amount.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end mt-6">
                                    <Button onClick={() => setShowAlreadyFiledModal(false)} variant="primary">
                                        Got It
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Preferred Filing Age Modal */}
            {
                showPreferredFilingModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <h2 className="text-2xl font-bold text-gray-900">About Preferred Filing Age</h2>
                                    <button
                                        onClick={() => setShowPreferredFilingModal(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* What is it? */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">What is Preferred Filing Age?</h3>
                                    <p className="text-gray-700 mb-3">
                                        This is when you plan to start claiming your Social Security benefits. You can choose <strong>any age from 62 to 70</strong>, and even specify a particular month.
                                    </p>
                                    <p className="text-gray-700 mb-4">
                                        This choice directly affects how much you'll receive each month - the longer you wait, the higher your monthly benefit.
                                    </p>
                                </div>

                                {/* Flexibility */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">Complete Flexibility</h3>
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-1">
                                                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">Change it anytime</p>
                                                <p className="text-sm text-gray-600">Explore different scenarios by adjusting these values whenever you want</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 mt-1">
                                                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">Choose any year AND month</p>
                                                <p className="text-sm text-gray-600">You have precise control - file at 65 years 3 months, 68 years 7 months, or any combination</p>
                                            </div>
                                        </div>

                                        {isMarried && (
                                            <div className="flex items-start gap-3">
                                                <div className="flex-shrink-0 mt-1">
                                                    <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">Each spouse files independently</p>
                                                    <p className="text-sm text-gray-600">You don't have to file at the same time - each person can choose their own optimal timing</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* How it affects the chart */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">How This Impacts the Charts</h3>
                                    <p className="text-gray-700 mb-3">
                                        The <strong className="text-blue-600">blue bar</strong> in the charts shows what happens with your chosen filing age(s).
                                    </p>
                                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                                        <p className="text-sm text-gray-700 mb-2">
                                            <strong>The calculation considers:</strong>
                                        </p>
                                        <ul className="space-y-1 text-sm text-gray-700">
                                            <li>• Your PIA (monthly benefit at FRA)</li>
                                            <li>• Your chosen filing age (year and month)</li>
                                            <li>• Your current age and birth date</li>
                                            {isMarried && <li>• Both spouses' individual choices (when married)</li>}
                                            <li>• Inflation/COLA adjustments over time</li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Why it matters */}
                                <div className="mb-6">
                                    <h3 className="text-xl font-semibold text-primary-600 mb-3">Why This Matters</h3>
                                    <p className="text-gray-700">
                                        Every month you delay filing (up to age 70) permanently increases your monthly benefit. The blue bar helps you see the long-term impact of your timing choice compared to filing at 62 (red) or 70 (green).
                                    </p>
                                </div>

                                <div className="flex justify-end mt-6">
                                    <Button onClick={() => setShowPreferredFilingModal(false)} variant="primary">
                                        Got It
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* One Month at a Time Modal */}
            <OneMonthAtATimeModal
                isOpen={showOneMonthModal}
                onClose={() => setShowOneMonthModal(false)}
                pia={chartSpouse1Pia || 3571}
                dob={spouse1Dob}
                inflationRate={inflation}
                isMarried={isMarried}
                spousePia={(isMarried && chartSpouse2Pia) || 2857}
                spouseDob={spouse2Dob}
            />
        </div >
    );
};

export default ShowMeTheMoneyCalculator;
