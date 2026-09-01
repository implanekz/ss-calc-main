import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockUser = {
  user: { id: 'ted-id' },
  profile: null,
  partners: [],
  preferences: {},
  updatePreferences: jest.fn(() => Promise.resolve())
};

const mockDevMode = {
  isDevMode: false,
  devProfile: null,
  devPartners: []
};

jest.mock('../contexts/UserContext', () => ({
  useUser: () => mockUser
}));

jest.mock('../contexts/DevModeContext', () => ({
  useDevMode: () => mockDevMode
}));

jest.mock('react-chartjs-2', () => ({
  Line: () => null
}));

jest.mock('chart.js', () => ({
  Chart: { register: jest.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {}
}));

const LifeExpectancyCalculator = require('./LifeExpectancyCalculator').default;

const asOfDate = new Date(2026, 7, 31);

const tedProfile = {
  id: 'ted-id',
  first_name: 'Ted',
  date_of_birth: '1965-06-15',
  relationship_status: 'married'
};

const maryPartner = {
  id: 'mary-id',
  first_name: 'Mary',
  date_of_birth: '1968-02-10'
};

describe('LifeExpectancyCalculator', () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUser.user = { id: 'ted-id' };
    mockUser.profile = null;
    mockUser.partners = [];
    mockUser.preferences = {};
    mockUser.updatePreferences = jest.fn(() => Promise.resolve());
    mockDevMode.isDevMode = false;
    mockDevMode.devProfile = null;
    mockDevMode.devPartners = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderCalculator = () => {
    act(() => {
      root.render(<LifeExpectancyCalculator asOfDate={asOfDate} />);
    });
  };

  it('shows only the sex prompt when onboarding DOB exists and sex is missing', () => {
    mockUser.profile = tedProfile;
    renderCalculator();

    expect(container.textContent).toContain('61');
    expect(container.textContent).toContain('Choose male or female');
    expect(container.textContent).not.toContain('Add a date of birth');
  });

  it('reads camelCase dateOfBirth from a normalized profile', () => {
    mockUser.profile = {
      id: 'ted-id',
      firstName: 'Ted',
      dateOfBirth: '1965-06-15'
    };
    renderCalculator();

    expect(container.textContent).toContain('61');
    expect(container.textContent).not.toContain('Add a date of birth');
  });

  it('populates SSA cards once DOB and sex exist', () => {
    mockUser.profile = tedProfile;
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'individual',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: null, education: null, health: null }
        }
      }
    };
    renderCalculator();

    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('live to at least');
    expect(container.textContent).toContain('SSA population estimate');
    expect(container.textContent).not.toContain('Add a date of birth');
    expect(container.querySelectorAll('[data-longevity-card]').length).toBe(3);
  });

  it('defaults to couple mode and uses both onboarding people', () => {
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: null, education: null, health: null },
          'mary-id': { sex: 'female', smoking: null, education: null, health: null }
        }
      }
    };
    renderCalculator();

    expect(container.textContent).toContain('Ted');
    expect(container.textContent).toContain('Mary');
    expect(container.textContent).toContain('61');
    expect(container.textContent).toContain('58');
    expect(container.textContent).toContain('at least one');
    expect(container.textContent).toMatch(/planning for the survivor/i);
  });

  it('still shows the profile-completion path when the primary DOB is missing', () => {
    mockUser.profile = { id: 'ted-id', first_name: 'Ted' };
    renderCalculator();

    expect(container.textContent).toContain('Add a date of birth');
    expect(container.textContent).not.toMatch(/\b61\b/);
  });

  it('reads the Dev Mode onboarding profile the same way Show Me the Money does', () => {
    mockUser.profile = null;
    mockDevMode.isDevMode = true;
    mockDevMode.devProfile = tedProfile;
    renderCalculator();

    expect(container.textContent).toContain('61');
    expect(container.textContent).not.toContain('Add a date of birth');
  });
});
