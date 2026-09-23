// frontend/src/components/OurLifelongTimeline/TimelineCursor.jsx
import React, { useRef, useState, useEffect } from 'react';
import { buildNarrative, buildFilingComparisonBoxes } from './timelineMath';
import { REFERENCE_COLORS, SCENARIO_INK } from '../../theme/navigatorColors';

// buildFilingComparisonBoxes returns [age 70, age 62, Your Plan] in that order.
const FILING_BOX_INK = [SCENARIO_INK.age70, SCENARIO_INK.age62, SCENARIO_INK.preferred];

const TimelineCursor = ({
  axisStartYear,
  axisEndYear,
  pxPerYear,
  year,
  setYear,
  primaryLabel,
  primaryAge,
  spouseLabel,
  spouseAge,
  monthlyIncome,
  cumulativeIncome,
  buckets,
  primaryMilestones,
  spouseMilestones,
  prematureDeath,
  deathYear,
  flipLeft,
  tooltipTopOffset,
  onDeeperDive,
  couple = true
}) => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const totalYears = axisEndYear - axisStartYear;

  const yearToPercent = (y) => ((y - axisStartYear) / totalYears) * 100;

  const xToYear = (clientX) => {
    if (!trackRef.current) return year;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const rawYear = axisStartYear + (percent / 100) * totalYears;
    return Math.round(Math.max(axisStartYear, Math.min(axisEndYear, rawYear)));
  };

  useEffect(() => {
    if (!isDragging) return undefined;
    const handleMouseMove = (e) => setYear(xToYear(e.clientX));
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // setYear is a useState setter (stable) and xToYear/axisStartYear/axisEndYear are read via
    // closure from props that only change on scenario updates -- same mount-while-dragging
    // pattern as CalendarPhaseBar and the existing RetirementStagesSlider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const narrative = buildNarrative({
    year,
    primaryLabel,
    primaryAge,
    spouseLabel,
    spouseAge,
    primaryMilestones,
    spouseMilestones,
    monthlyIncome,
    prematureDeath,
    deathYear
  });

  const filingBoxes = buildFilingComparisonBoxes({
    buckets,
    year,
    think: narrative.think,
    cumulativeIncome,
    couple
  });

  return (
    <div
      ref={trackRef}
      className="absolute top-0 bottom-0 left-0"
      style={{ width: `${totalYears * pxPerYear}px` }}
    >
      <div
        className="absolute top-0 bottom-0 w-1.5 rounded-full shadow cursor-ew-resize z-20"
        style={{ left: `calc(${yearToPercent(year)}% - 3px)`, backgroundColor: REFERENCE_COLORS.cursor }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
      >
        <div className="absolute -top-2.5 -left-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: REFERENCE_COLORS.cursor }} />

        <div
          className={`absolute w-[600px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-sm ${flipLeft ? 'right-2' : 'left-2'}`}
          style={{ top: `${tooltipTopOffset}px` }}
        >
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="font-bold text-gray-800">{narrative.feel}</div>
            <button
              type="button"
              onClick={() => onDeeperDive(year)}
              className="shrink-0 text-[10px] font-semibold text-primary-700 hover:text-primary-800 underline whitespace-nowrap"
            >
              Deeper Dive Into Just This Year
            </button>
          </div>

          {narrative.milestoneNotes.length > 0 && (
            <div className="mb-2 space-y-1">
              {narrative.milestoneNotes.map((note) => (
                <div key={note} className="text-xs font-semibold text-amber-800 bg-amber-50 rounded px-2 py-1">
                  {note}
                </div>
              ))}
            </div>
          )}

          {narrative.doLine && (
            <div className="text-xs italic text-gray-600 mb-2">{narrative.doLine}</div>
          )}

          {narrative.survivorNote && (
            <div className="text-xs text-gray-500 bg-gray-50 border-l-2 border-gray-300 rounded px-2 py-1 mb-2">
              {narrative.survivorNote}
            </div>
          )}

          {/* Monthly/yearly is the large, primary-emphasis text in every box -- that's the
              number people compare at a glance -- with the lifetime running total present but
              visually secondary underneath it, per Kurt's visual-hierarchy guidance. */}
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-2">
            {filingBoxes.map((box, index) => (
              <div key={box.label} className="text-center">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{box.label}</div>
                <div
                  className={`text-lg font-extrabold ${box.muted ? 'text-gray-400' : ''}`}
                  style={box.muted ? undefined : { color: FILING_BOX_INK[index] }}
                >
                  {box.bigText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineCursor;
