import React from 'react';
import LongevityFlagPopover from './LongevityFlagPopover';

const HouseholdLongevityRow = ({
  label = 'At least one alive',
  markers = [],
  axisStartYear,
  axisEndYear,
  pxPerYear,
  onMarkerActivate
}) => {
  const totalYears = axisEndYear - axisStartYear;
  const yearToPercent = (year) => ((year - axisStartYear) / totalYears) * 100;

  return (
    <div className="relative" style={{ width: `${totalYears * pxPerYear}px`, height: '40px' }}>
      <div className="absolute -top-5 left-0 text-xs font-extrabold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="absolute top-4 h-2 w-full rounded-full bg-gray-200" />
      {markers.map((marker, index) => (
        <LongevityFlagPopover
          key={marker.id}
          marker={marker}
          leftPercent={yearToPercent(marker.positionYear)}
          stackIndex={index}
          onActivate={onMarkerActivate}
        />
      ))}
    </div>
  );
};

export default HouseholdLongevityRow;
