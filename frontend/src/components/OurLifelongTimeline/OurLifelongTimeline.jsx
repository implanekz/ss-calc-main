// frontend/src/components/OurLifelongTimeline/OurLifelongTimeline.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import CalendarPhaseBar from './CalendarPhaseBar';
import TimelineCursor from './TimelineCursor';
import DeathMarker from './DeathMarker';
import HouseholdLongevityRow from './HouseholdLongevityRow';
import { getAxisEndYear, getHouseholdBuckets, getMilestonesForPerson, calendarYearToAge } from './timelineMath';
import { buildTimelineLongevityPresentation } from './longevityTimelineMath';

const PX_PER_YEAR = 50;
const YEAR_TICK_INTERVAL = 5;
const YEAR_RULER_HEIGHT = 28;
const PERSON_ROW_HEIGHT = 52;
const PERSON_ROW_GAP = 112;
const HOUSEHOLD_ROW_HEIGHT = 40;
const HOUSEHOLD_ROW_GAP = 80;
const TOOLTIP_WIDTH = 600;
const TOOLTIP_FLIP_MARGIN = 24;

const OurLifelongTimeline = ({
  primaryLabel,
  spouseLabel,
  spouse1Dob,
  spouse2Dob,
  spouse1Pia,
  spouse2Pia,
  spouse1PreferredYear,
  spouse2PreferredYear,
  inflation,
  prematureDeath,
  deathAge,
  combinedProjections,
  goGoEndAge,
  setGoGoEndAge,
  slowGoEndAge,
  setSlowGoEndAge,
  isDraggingGoGo,
  setIsDraggingGoGo,
  isDraggingSlowGo,
  setIsDraggingSlowGo,
  spouseGoGoEndAge,
  setSpouseGoGoEndAge,
  spouseSlowGoEndAge,
  setSpouseSlowGoEndAge,
  isDraggingSpouseGoGo,
  setIsDraggingSpouseGoGo,
  isDraggingSpouseSlowGo,
  setIsDraggingSpouseSlowGo,
  onDeeperDive,
  longevitySummary,
  onPersonalizeClick
}) => {
  const currentYear = new Date().getFullYear();
  const [cursorYear, setCursorYear] = useState(currentYear);
  const hasSpouse = Boolean(spouse2Dob);
  const isCouple = hasSpouse;

  const scrollContainerRef = useRef(null);
  const [viewport, setViewport] = useState({ clientWidth: 0, scrollLeft: 0 });

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return undefined;
    const update = () => setViewport({ clientWidth: el.clientWidth, scrollLeft: el.scrollLeft });
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    el.addEventListener('scroll', update);
    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  const birthYearPrimary = new Date(spouse1Dob).getFullYear();
  const birthYearSpouse = hasSpouse ? new Date(spouse2Dob).getFullYear() : null;
  const axisStartYear = currentYear;
  const presentation = useMemo(
    () => (longevitySummary
      ? buildTimelineLongevityPresentation(longevitySummary, axisStartYear)
      : null),
    [longevitySummary, axisStartYear]
  );
  const axisEndYear = getAxisEndYear({
    birthYears: [birthYearPrimary, birthYearSpouse].filter((year) => Number.isFinite(year)),
    longevitySummary
  });

  const deathYear = birthYearPrimary + Number(deathAge);
  const showHouseholdRow = Boolean(presentation?.household);

  const rowStackHeight = isCouple
    ? PERSON_ROW_HEIGHT + PERSON_ROW_GAP + PERSON_ROW_HEIGHT
      + (showHouseholdRow ? HOUSEHOLD_ROW_GAP + HOUSEHOLD_ROW_HEIGHT : 0)
      + YEAR_RULER_HEIGHT
    : PERSON_ROW_HEIGHT + YEAR_RULER_HEIGHT;
  const tooltipTopOffset = rowStackHeight + 12;

  const buckets = useMemo(
    () => getHouseholdBuckets({
      spouse1Pia,
      spouse1Dob,
      spouse2Pia,
      spouse2Dob,
      inflation,
      prematureDeath,
      deathYear,
      endYear: axisEndYear,
      isMarried: isCouple
    }),
    [spouse1Pia, spouse1Dob, spouse2Pia, spouse2Dob, inflation, prematureDeath, deathYear, axisEndYear, isCouple]
  );

  const primaryMilestones = useMemo(
    () => getMilestonesForPerson({ label: primaryLabel, dob: spouse1Dob, preferredYear: spouse1PreferredYear }),
    [primaryLabel, spouse1Dob, spouse1PreferredYear]
  );
  const spouseMilestones = useMemo(
    () => (hasSpouse
      ? getMilestonesForPerson({ label: spouseLabel, dob: spouse2Dob, preferredYear: spouse2PreferredYear })
      : []),
    [hasSpouse, spouseLabel, spouse2Dob, spouse2PreferredYear]
  );

  const markersForDob = (dob) => {
    const person = Object.values(longevitySummary?.individuals || {})
      .find((item) => item.birthDate === dob);
    return person ? presentation?.individuals?.[person.personId]?.markers || [] : [];
  };
  const primaryLongevityMarkers = markersForDob(spouse1Dob);
  const spouseLongevityMarkers = hasSpouse ? markersForDob(spouse2Dob) : [];

  const monthlyIncome = combinedProjections?.preferred?.monthly?.[cursorYear] || 0;
  const cumulativeIncome = combinedProjections?.preferred?.cumulative?.[cursorYear] || 0;

  const cursorPixelX = (cursorYear - axisStartYear) * PX_PER_YEAR;
  const flipLeft = cursorPixelX - viewport.scrollLeft > viewport.clientWidth - TOOLTIP_WIDTH - TOOLTIP_FLIP_MARGIN;

  const yearTicks = useMemo(() => {
    const ticks = [];
    for (let y = axisStartYear; y <= axisEndYear; y += YEAR_TICK_INTERVAL) {
      ticks.push(y);
    }
    return ticks;
  }, [axisStartYear, axisEndYear]);

  const needsPersonalization = Object.values(longevitySummary?.individuals || {})
    .some((person) => person.estimateType !== 'personalized');

  return (
    <div className="space-y-3 mt-4">
      <div ref={scrollContainerRef} className="w-full overflow-x-auto pt-48 pb-96">
        <div className="relative" style={{ width: `${(axisEndYear - axisStartYear) * PX_PER_YEAR}px` }}>
          <div className={isCouple ? 'mb-28' : 'mb-6'}>
            <CalendarPhaseBar
              label={primaryLabel}
              birthYear={birthYearPrimary}
              axisStartYear={axisStartYear}
              axisEndYear={axisEndYear}
              pxPerYear={PX_PER_YEAR}
              goGoEndAge={goGoEndAge}
              setGoGoEndAge={setGoGoEndAge}
              slowGoEndAge={slowGoEndAge}
              setSlowGoEndAge={setSlowGoEndAge}
              isDraggingGoGo={isDraggingGoGo}
              setIsDraggingGoGo={setIsDraggingGoGo}
              isDraggingSlowGo={isDraggingSlowGo}
              setIsDraggingSlowGo={setIsDraggingSlowGo}
              milestones={primaryMilestones}
              longevityMarkers={primaryLongevityMarkers}
              onMilestoneClick={setCursorYear}
            />
          </div>
          {isCouple && (
            <div className={showHouseholdRow ? 'mb-20' : undefined}>
              <CalendarPhaseBar
                label={spouseLabel}
                birthYear={birthYearSpouse}
                axisStartYear={axisStartYear}
                axisEndYear={axisEndYear}
                pxPerYear={PX_PER_YEAR}
                goGoEndAge={spouseGoGoEndAge}
                setGoGoEndAge={setSpouseGoGoEndAge}
                slowGoEndAge={spouseSlowGoEndAge}
                setSlowGoEndAge={setSpouseSlowGoEndAge}
                isDraggingGoGo={isDraggingSpouseGoGo}
                setIsDraggingGoGo={setIsDraggingSpouseGoGo}
                isDraggingSlowGo={isDraggingSpouseSlowGo}
                setIsDraggingSlowGo={setIsDraggingSpouseSlowGo}
                milestones={spouseMilestones}
                longevityMarkers={spouseLongevityMarkers}
                onMilestoneClick={setCursorYear}
              />
            </div>
          )}
          {showHouseholdRow && (
            <div className="mb-6">
              <HouseholdLongevityRow
                label="At least one alive"
                markers={presentation.household.markers}
                axisStartYear={axisStartYear}
                axisEndYear={axisEndYear}
                pxPerYear={PX_PER_YEAR}
                onMarkerActivate={setCursorYear}
              />
            </div>
          )}
          {isCouple && !showHouseholdRow && presentation?.householdUnavailableMessage && (
            <p className="text-xs text-gray-500 mb-2">{presentation.householdUnavailableMessage}</p>
          )}

          <div className="relative mt-3 h-4 border-t border-gray-200">
            {yearTicks.map((y) => (
              <span
                key={y}
                className="absolute top-1 text-[10px] font-medium text-gray-500"
                style={{ left: `${((y - axisStartYear) / (axisEndYear - axisStartYear)) * 100}%` }}
              >
                {y}
              </span>
            ))}
          </div>

          {prematureDeath && (
            <DeathMarker
              axisStartYear={axisStartYear}
              axisEndYear={axisEndYear}
              deathYear={deathYear}
              pxPerYear={PX_PER_YEAR}
            />
          )}

          <TimelineCursor
            axisStartYear={axisStartYear}
            axisEndYear={axisEndYear}
            pxPerYear={PX_PER_YEAR}
            year={cursorYear}
            setYear={setCursorYear}
            primaryLabel={primaryLabel}
            primaryAge={calendarYearToAge(birthYearPrimary, cursorYear)}
            spouseLabel={isCouple ? spouseLabel : null}
            spouseAge={isCouple ? calendarYearToAge(birthYearSpouse, cursorYear) : null}
            monthlyIncome={monthlyIncome}
            cumulativeIncome={cumulativeIncome}
            buckets={buckets}
            primaryMilestones={primaryMilestones}
            spouseMilestones={spouseMilestones}
            prematureDeath={prematureDeath}
            deathYear={deathYear}
            flipLeft={flipLeft}
            tooltipTopOffset={tooltipTopOffset}
            onDeeperDive={onDeeperDive}
            couple={isCouple}
          />
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t border-gray-100 pt-2 space-y-1">
        {presentation?.sourceDisclosure && (
          <p>
            {presentation.estimateLabel}: {presentation.sourceDisclosure}{' '}
            <a className="underline" href="https://www.ssa.gov/oact/STATS/table4c6.html">SSA 2023 period life table</a>
            {' · '}
            <a className="underline" href="https://www.cdc.gov/nchs/linked-data/mortality-files/index.html">NCHS Linked Mortality Files</a>
          </p>
        )}
        {needsPersonalization && typeof onPersonalizeClick === 'function' && (
          <p>
            <button
              type="button"
              onClick={onPersonalizeClick}
              className="font-semibold text-primary-600 hover:text-primary-700 underline"
            >
              Personalize these ages
            </button>
          </p>
        )}
        <p>
          Want a different picture? Change filing ages in the panel on the left — timing is the one lever still fully in your control.
        </p>
      </div>
    </div>
  );
};

export default OurLifelongTimeline;
