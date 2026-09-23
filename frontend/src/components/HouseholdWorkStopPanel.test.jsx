import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

let HouseholdWorkStopPanel;
try {
  HouseholdWorkStopPanel = require('./HouseholdWorkStopPanel').default;
} catch {
  HouseholdWorkStopPanel = undefined;
}

describe('HouseholdWorkStopPanel', () => {
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

  it('starts collapsed and toggles the combined household view with its chevron button', () => {
    expect(HouseholdWorkStopPanel).toEqual(expect.any(Function));
    if (!HouseholdWorkStopPanel) return;

    act(() => {
      root.render(
        <HouseholdWorkStopPanel
          primaryName="Alex"
          spouseName="Riley"
          rungs={[
            {
              stopAge: 62,
              spouse1Pia: 3000,
              spouse2Pia: 1800,
              householdPia: 4800
            }
          ]}
        />
      );
    });

    const button = container.querySelector('button');
    const panel = container.querySelector('#household-work-stop-panel');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.textContent).toContain('not a household benefit');
    expect(panel.textContent).toContain("each person's own PIA year");
    expect(panel.textContent).toContain('$4,800');
    expect(panel.textContent).toContain('Alex $3,000 + Riley $1,800');
  });
});
