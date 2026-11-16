import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DevModeProvider, useDevMode } from './DevModeContext.jsx';

const originalLocation = window.location;

const setHost = (hostname) => {
  delete window.location;
  window.location = new URL(`https://${hostname}/`);
};

const mountProvider = () => {
  const captured = {};
  const Probe = () => {
    Object.assign(captured, useDevMode());
    return null;
  };
  const container = document.createElement('div');
  act(() => {
    createRoot(container).render(
      <DevModeProvider>
        <Probe />
      </DevModeProvider>
    );
  });
  return captured;
};

describe('DevModeContext demo host', () => {
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
  });
  afterEach(() => {
    window.location = originalLocation;
  });

  it('on test.ret1re.com, starts signed in with a completed demo profile', () => {
    setHost('test.ret1re.com');
    const ctx = mountProvider();
    expect(ctx.isDemo).toBe(true);
    expect(ctx.isDevMode).toBe(true);
    expect(ctx.devUser).toBeTruthy();
    expect(ctx.devProfile.onboarding_completed_at).toBeTruthy();
  });

  it('on test.ret1re.com, restores the last-saved profile instead of the default', () => {
    setHost('test.ret1re.com');
    localStorage.setItem('devUser', JSON.stringify({ id: 'dev-user-id', email: 'x@y.z' }));
    localStorage.setItem('devProfile', JSON.stringify({ id: 'dev-user-id', date_of_birth: '1962-04-02', onboarding_completed_at: '2026-01-01' }));
    const ctx = mountProvider();
    expect(ctx.devProfile.date_of_birth).toBe('1962-04-02');
  });

  it('on test.ret1re.com, logout and exit cannot drop back to the login screen', () => {
    setHost('test.ret1re.com');
    const ctx = mountProvider();
    act(() => ctx.devLogout());
    act(() => ctx.toggleDevMode());
    act(() => ctx.devClearAll());
    expect(ctx.isDevMode).toBe(true);
    expect(ctx.devUser).toBeTruthy();
    expect(ctx.devProfile.onboarding_completed_at).toBeTruthy();
  });

  it('creates the spouse when Settings saves partner 0 and none exists', () => {
    setHost('test.ret1re.com');
    const ctx = mountProvider();
    act(() => ctx.updateDevPartner(0, { dateOfBirth: '1960-03-10' }));
    expect(ctx.devPartners).toHaveLength(1);
    expect(ctx.devPartners[0].dateOfBirth).toBe('1960-03-10');
  });

  it('a Settings DOB edit reaches calculators that read snake_case', () => {
    setHost('test.ret1re.com');
    const ctx = mountProvider();
    act(() => ctx.updateDevProfile({ dateOfBirth: '1963-04-02' }));
    act(() => ctx.updateDevPartner(0, { dateOfBirth: '1961-08-20', piaAtFra: 2100 }));
    expect(ctx.devProfile.date_of_birth).toBe('1963-04-02');
    expect(ctx.devPartners[0].date_of_birth).toBe('1961-08-20');
    expect(ctx.devPartners[0].pia).toBe(2100);
  });

  it('demo mode never exposes dev tooling', () => {
    ['test.ret1re.com', 'demo.localhost'].forEach((host) => {
      setHost(host);
      const ctx = mountProvider();
      expect(ctx.isDemo).toBe(true);
      expect(ctx.isDevTools).toBe(false);
    });
  });

  it('on the production host, stays on real auth', () => {
    setHost('ret1re.com');
    const ctx = mountProvider();
    expect(ctx.isDemo).toBe(false);
    expect(ctx.isDevMode).toBe(false);
    expect(ctx.devUser).toBeNull();
  });
});
