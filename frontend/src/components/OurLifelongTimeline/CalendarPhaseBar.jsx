// frontend/src/components/OurLifelongTimeline/CalendarPhaseBar.jsx
import React, { useRef, useEffect } from 'react';
import LongevityFlagPopover from './LongevityFlagPopover';

const MIN_AGE = 62;
const MAX_AGE = 95;

const MILESTONE_STYLES = {
  age62: { color: '#3B82F6', chip: '62' },
  fra: { color: '#8B5CF6', chip: 'FRA' },
  chosenFilingAge: { color: '#10B981', chip: 'Filed' },
  age70: { color: '#F59E0B', chip: '70' }
};

const MARKER_LEVEL_HEIGHT = 48;

const CalendarPhaseBar = ({
  label,
  birthYear,
  axisStartYear,
  axisEndYear,
  pxPerYear,
  goGoEndAge,
  setGoGoEndAge,
  slowGoEndAge,
  setSlowGoEndAge,
  isDraggingGoGo,
  setIsDraggingGoGo,
  isDraggingSlowGo,
  setIsDraggingSlowGo,
  milestones,
  longevityMarkers = [],
  onMilestoneClick
}) => {
  const trackRef = useRef(null);
  const totalYears = axisEndYear - axisStartYear;

  const yearToPercent = (year) => ((year - axisStartYear) / totalYears) * 100;
  const ageToPercent = (age) => yearToPercent(birthYear + age);

  const xToAge = (clientX) => {
    if (!trackRef.current) return MIN_AGE;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    // trackRef's rendered pixel width is the CLAMPED bar (see barWidthPercent below), which
    // spans [MIN_AGE, MAX_AGE] only when the bar isn't clipped. When someone is already older
    // than MIN_AGE today, the visible left edge sits at today's age for them, not MIN_AGE --
    // interpolating against a hardcoded MIN_AGE here would desync the handle from the cursor.
    const leftAge = Math.max(MIN_AGE, axisStartYear - birthYear);
    return Math.round(leftAge + (percent / 100) * (MAX_AGE - leftAge));
  };

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
        if (newAge < slowGoEndAge) {
          setGoGoEndAge(newAge);
        }
      } else if (isDraggingSlowGo) {
        const newAge = xToAge(e.clientX);
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
    // xToAge closes over axisStartYear/birthYear (read fresh via closure from props that only
    // change on scenario updates, not mid-drag) and the setters are stable useState setters --
    // same mount-while-dragging pattern as TimelineCursor and the existing RetirementStagesSlider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingGoGo, isDraggingSlowGo, goGoEndAge, slowGoEndAge, setGoGoEndAge, setSlowGoEndAge, setIsDraggingGoGo, setIsDraggingSlowGo]);

  // The full [MIN_AGE, MAX_AGE] span can start left of the visible track (negative percent)
  // for anyone already older than MIN_AGE today -- this app's target users are 58+, so that's
  // common, not an edge case. Clamp the rendered bar to the visible [0%, 100%] track so it (and
  // its drag handles) never sit off-canvas to the left.
  const barLeftPercentUnclamped = ageToPercent(MIN_AGE);
  const barRightPercent = ageToPercent(MAX_AGE);
  const barLeftPercent = Math.max(0, barLeftPercentUnclamped);
  const barWidthPercent = Math.max(0, barRightPercent - barLeftPercent);

  // Segment boundaries expressed in the same full-axis percent space as barLeftPercent/barRightPercent,
  // then clamped into the *visible* [barLeftPercent, barRightPercent] range before being turned into
  // percentages of the (possibly narrower, clamped) rendered bar. Using the fixed 33-year span here
  // instead would make the colored segments overflow whenever the bar itself has been clamped.
  const clampToVisible = (percent) => Math.min(barRightPercent, Math.max(barLeftPercent, percent));
  const goGoBoundaryPercent = clampToVisible(ageToPercent(goGoEndAge));
  const slowGoBoundaryPercent = clampToVisible(ageToPercent(slowGoEndAge));

  const goGoWidth = barWidthPercent > 0 ? ((goGoBoundaryPercent - barLeftPercent) / barWidthPercent) * 100 : 0;
  const slowGoWidth = barWidthPercent > 0 ? ((slowGoBoundaryPercent - goGoBoundaryPercent) / barWidthPercent) * 100 : 0;
  const noGoWidth = 100 - goGoWidth - slowGoWidth;

  return (
    <div className="relative" style={{ width: `${totalYears * pxPerYear}px`, height: '52px' }}>
      {label && (
        <div className="absolute -top-5 left-0 text-xs font-extrabold uppercase tracking-wider text-gray-500">
          {label}
        </div>
      )}

      {/* Milestone markers, positioned on the full shared track independent of the bar itself.
          Markers for already-past years (common for this app's 58+ target users) would compute
          a negative percent and sit off-canvas to the left of the overflow-x-auto track with no
          way to scroll to them -- skip rendering those rather than leave an unreachable marker.
          Clicking a marker snaps the shared inspection cursor to that year via onMilestoneClick
          -- the same cursorYear state the drag cursor already writes to, not a parallel state. */}
      {(() => {
        const visibleFiling = milestones
          .filter((m) => yearToPercent(m.year) >= 0)
          .map((m) => ({ ...m, _pos: m.year, _type: 'filing' }));
        const visibleLongevity = (longevityMarkers || []).map((m) => ({
          ...m,
          _pos: m.positionYear,
          _type: 'longevity'
        }));
        const combined = [...visibleFiling, ...visibleLongevity];
        const stackIndexByKey = {};
        const countByYear = {};
        combined.forEach((m) => {
          const yearKey = Math.round(m._pos);
          const key = `${m._type}-${m.id || m.kind}-${m._pos}`;
          stackIndexByKey[key] = countByYear[yearKey] || 0;
          countByYear[yearKey] = (countByYear[yearKey] || 0) + 1;
        });

        return combined.map((m) => {
          const key = `${m._type}-${m.id || m.kind}-${m._pos}`;
          const stackOffset = stackIndexByKey[key] * MARKER_LEVEL_HEIGHT;
          if (m._type === 'longevity') {
            return (
              <LongevityFlagPopover
                key={m.id}
                marker={m}
                leftPercent={yearToPercent(m.positionYear)}
                stackIndex={stackIndexByKey[key]}
                onActivate={onMilestoneClick}
              />
            );
          }

          const style = MILESTONE_STYLES[m.kind];
          return (
            <button
              key={`${m.kind}-${m.year}`}
              type="button"
              onClick={() => onMilestoneClick(m.year)}
              className="absolute top-0 bottom-0 w-6 z-10 flex flex-col items-center bg-transparent border-0 p-0 cursor-pointer"
              style={{ left: `calc(${yearToPercent(m.year)}% - 12px)` }}
              title={m.label}
            >
              <span
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: style.color, top: `${-16 - stackOffset}px` }}
              />
              <span className="w-1 h-full rounded-full" style={{ backgroundColor: style.color }} />
              <span
                className="absolute flex flex-col items-center whitespace-nowrap text-white font-bold rounded px-1.5 py-0.5 leading-none"
                style={{ backgroundColor: style.color, top: `${-48 - stackOffset}px` }}
              >
                <span className="text-xs">{style.chip}</span>
                <span className="text-[9px] font-semibold opacity-90">{m.year}</span>
              </span>
            </button>
          );
        });
      })()}

      {/* The 62-95 phase bar itself, absolutely positioned within the shared track */}
      <div
        ref={trackRef}
        className="absolute top-3 h-9 flex rounded-lg overflow-hidden shadow-md border-2 border-gray-300"
        style={{ left: `${barLeftPercent}%`, width: `${barWidthPercent}%` }}
      >
        <div
          className="relative flex items-center justify-center text-white font-bold text-sm"
          style={{ width: `${goGoWidth}%`, backgroundColor: '#E67E22' }}
        >
          {goGoWidth > 15 ? <span className="drop-shadow-sm">Go-Go</span> : null}
        </div>

        <div
          className="absolute top-0 bottom-0 w-6 flex items-center justify-center cursor-ew-resize z-10 group"
          style={{ left: `calc(${goGoWidth}% - 12px)` }}
          onMouseDown={handleGoGoMouseDown}
        >
          <div className={`w-1 h-full ${isDraggingGoGo ? 'bg-gray-800' : 'bg-gray-600 group-hover:bg-gray-700'}`} />
        </div>

        <div
          className="relative flex items-center justify-center text-white font-bold text-sm"
          style={{ width: `${slowGoWidth}%`, backgroundColor: '#F1C40F' }}
        >
          {slowGoWidth > 15 ? <span className="drop-shadow-sm">Slow-Go</span> : null}
        </div>

        <div
          className="absolute top-0 bottom-0 w-6 flex items-center justify-center cursor-ew-resize z-10 group"
          style={{ left: `calc(${goGoWidth + slowGoWidth}% - 12px)` }}
          onMouseDown={handleSlowGoMouseDown}
        >
          <div className={`w-1 h-full ${isDraggingSlowGo ? 'bg-gray-800' : 'bg-gray-600 group-hover:bg-gray-700'}`} />
        </div>

        <div
          className="relative flex items-center justify-center text-white font-bold text-sm"
          style={{ width: `${noGoWidth}%`, backgroundColor: '#95A5A6' }}
        >
          {noGoWidth > 15 ? <span className="drop-shadow-sm">No-Go</span> : null}
        </div>
      </div>
    </div>
  );
};

export default CalendarPhaseBar;
