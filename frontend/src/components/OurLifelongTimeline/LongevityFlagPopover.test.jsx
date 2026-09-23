import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LongevityFlagPopover from './LongevityFlagPopover';

describe('LongevityFlagPopover', () => {
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

  test('opens on focus and closes with Escape while restoring trigger focus', async () => {
    const marker = {
      id: 'ted-survival50',
      kind: 'survival50',
      year: 2050,
      positionYear: 2050,
      chip: '50%',
      displayYear: 2050,
      tooltip: 'There is a 50% chance Ted will live to at least age 85.',
      pinned: null,
      emphasis: 'strong'
    };
    await act(async () => root.render(<LongevityFlagPopover marker={marker} leftPercent={50} />));
    const trigger = container.querySelector('button');
    await act(async () => {
      trigger.focus();
    });
    expect(container.querySelector('[role="tooltip"]').textContent).toContain(marker.tooltip);
    await act(async () => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
