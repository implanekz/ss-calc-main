import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { buildLongevitySummary } from '../../calculators/longevity/summary';
import { fixedAsOfDate, tedAndMary } from '../../calculators/longevity/fixtures';
import { getHouseholdLongevityMarkers } from './longevityTimelineMath';
import HouseholdLongevityRow from './HouseholdLongevityRow';

describe('HouseholdLongevityRow', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('household row renders probability flags without retirement phases', async () => {
    const markers = getHouseholdLongevityMarkers(buildLongevitySummary({
      people: tedAndMary,
      asOfDate: fixedAsOfDate
    }));
    await act(async () => root.render(
      <HouseholdLongevityRow
        label="At least one alive"
        markers={markers}
        axisStartYear={2026}
        axisEndYear={2075}
        pxPerYear={50}
      />
    ));
    expect(container.textContent).toContain('At least one alive');
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.textContent).not.toContain('Go-Go');
    expect(container.textContent).not.toContain('Slow-Go');
    expect(container.textContent).not.toContain('No-Go');
  });
});
