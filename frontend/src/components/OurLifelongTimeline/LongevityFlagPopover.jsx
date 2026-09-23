import React, { useEffect, useId, useRef, useState } from 'react';

const MARKER_LEVEL_HEIGHT = 48;

const placeAboveBar = (stackIndex) => !(stackIndex >= 2 && stackIndex % 2 === 0);

const stackOffsetPx = (stackIndex) => {
  if (stackIndex < 2) {
    return stackIndex * MARKER_LEVEL_HEIGHT;
  }
  if (placeAboveBar(stackIndex)) {
    return Math.floor((stackIndex + 1) / 2) * MARKER_LEVEL_HEIGHT;
  }
  return Math.floor((stackIndex - 2) / 2) * MARKER_LEVEL_HEIGHT;
};

const chipClasses = (marker) => {
  if (marker.kind === 'headline') {
    return 'border border-dashed border-gray-500 bg-gray-100 text-gray-600';
  }
  if (marker.emphasis === 'strong') {
    return 'bg-slate-800 text-white text-sm px-2 py-1';
  }
  return 'bg-slate-600 text-white';
};

const stemClasses = (marker) => {
  if (marker.kind === 'headline') {
    return 'border-l border-dashed border-gray-500';
  }
  if (marker.emphasis === 'strong') {
    return 'bg-slate-800 w-1.5';
  }
  return 'bg-slate-600 w-1';
};

const LongevityFlagPopover = ({ marker, leftPercent, stackIndex = 0, onActivate }) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const skipFocusOpen = useRef(false);
  const tooltipId = useId();
  const open = hovered || focused || pinnedOpen;
  const above = placeAboveBar(stackIndex);
  const offset = stackOffsetPx(stackIndex);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        skipFocusOpen.current = true;
        setPinnedOpen(false);
        setHovered(false);
        setFocused(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }
      setPinnedOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !tooltipRef.current) {
      return undefined;
    }
    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const pad = 8;
    let shiftX = 0;
    if (rect.right > window.innerWidth - pad) {
      shiftX = window.innerWidth - pad - rect.right;
    }
    if (rect.left + shiftX < pad) {
      shiftX = pad - rect.left;
    }
    tooltip.style.transform = `translateX(calc(-50% + ${shiftX}px))`;
    return undefined;
  }, [open, marker.id]);

  const pinLabel = marker.pinned === 'left' ? '◀' : marker.pinned === 'right' ? '▶' : null;

  return (
    <div
      className="absolute top-0 bottom-0 z-10 flex flex-col items-center"
      style={{ left: `calc(${leftPercent}% - 14px)`, width: '28px' }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={`${marker.chip}${marker.displayYear ? ` ${marker.displayYear}` : ''}`}
        className="absolute top-0 bottom-0 w-7 bg-transparent border-0 p-0 cursor-pointer flex flex-col items-center"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => {
          if (skipFocusOpen.current) {
            skipFocusOpen.current = false;
            return;
          }
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onClick={() => {
          setPinnedOpen((current) => !current);
          if (typeof onActivate === 'function') {
            onActivate(Math.round(marker.positionYear));
          }
        }}
      >
        <span
          className={`absolute ${stemClasses(marker)} h-full`}
          style={marker.kind === 'headline' ? { width: 0 } : undefined}
        />
        <span
          className={`absolute flex items-center gap-0.5 whitespace-nowrap font-bold rounded px-1.5 py-0.5 leading-none ${chipClasses(marker)}`}
          style={above
            ? { top: `${-48 - offset}px` }
            : { top: `${52 + offset}px` }}
        >
          {marker.pinned === 'left' && <span aria-hidden="true">{pinLabel}</span>}
          <span>{marker.chip}</span>
          {marker.pinned !== 'left' && marker.displayYear != null && (
            <span className="text-[9px] font-semibold opacity-90">{marker.displayYear}</span>
          )}
          {marker.pinned === 'right' && <span aria-hidden="true">{pinLabel}</span>}
        </span>
      </button>
      {open && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          data-longevity-tooltip={tooltipId}
          className="absolute z-30 w-72 rounded-md border border-gray-200 bg-white p-2 text-left text-xs text-gray-700 shadow-lg"
          style={{
            top: above ? `${-48 - offset - 8}px` : `${88 + offset}px`,
            left: '14px',
            transform: 'translateX(-50%)',
            [above ? 'marginTop' : 'marginBottom']: '-4px',
            ...(above ? { transform: 'translate(-50%, -100%)' } : {})
          }}
        >
          {marker.tooltip}
        </div>
      )}
    </div>
  );
};

export default LongevityFlagPopover;
