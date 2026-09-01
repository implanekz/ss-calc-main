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

let mockNhisArtifact = null;
jest.mock('../calculators/longevity/nhisArtifact', () => ({
  getProductionNhisArtifact: () => mockNhisArtifact
}));

const LifeExpectancyCalculator = require('./LifeExpectancyCalculator').default;
const { buildTestNhissArtifact } = require('../calculators/longevity/testNhissArtifact');

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
    mockNhisArtifact = null;
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

  it('labels gender rather than sex', () => {
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    renderCalculator();

    expect(container.textContent).toContain("Ted's gender");
    expect(container.textContent).toContain("Mary's gender");
    expect(container.textContent).not.toContain("Ted's sex");
    expect(container.textContent).not.toContain("Mary's sex");
    expect(container.textContent).not.toContain('Your sex');
    expect(container.textContent).not.toContain('Spouse sex');
  });

  it('uses slider ages in household copy instead of onboarding DOB ages', () => {
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'couple',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: null, education: null, health: null },
          'mary-id': { sex: 'female', smoking: null, education: null, health: null }
        }
      }
    };
    renderCalculator();

    const sliders = Array.from(container.querySelectorAll('input[type="range"]'));
    const nativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      nativeValue.call(sliders[0], '73');
      sliders[0].dispatchEvent(new Event('input', { bubbles: true }));
      sliders[0].dispatchEvent(new Event('change', { bubbles: true }));
      nativeValue.call(sliders[1], '70');
      sliders[1].dispatchEvent(new Event('input', { bubbles: true }));
      sliders[1].dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toMatch(/Ted age 73/);
    expect(container.textContent).toMatch(/Mary age 70/);
    expect(container.textContent).not.toMatch(/Ted age 61/);
    expect(container.textContent).not.toMatch(/Mary age 58/);
    expect(mockUser.profile.date_of_birth).toBe('1965-06-15');
    expect(mockUser.partners[0].date_of_birth).toBe('1968-02-10');

    const year50 = Number(container.querySelector('[data-longevity-card="50"] [data-card-secondary]').textContent);
    expect(container.textContent).toContain(
      `Ted would be ${73 + (year50 - asOfDate.getFullYear())}, and Mary would be ${70 + (year50 - asOfDate.getFullYear())}.`
    );
  });

  it('uses 55–100 age sliders defaulting to DOB age and does not write profile DOB', () => {
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    mockUser.updateProfile = jest.fn(() => Promise.resolve());
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'couple',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: null, education: null, health: null },
          'mary-id': { sex: 'female', smoking: null, education: null, health: null }
        }
      }
    };
    renderCalculator();

    expect(container.textContent).not.toContain('Change date of birth in your profile');
    const sliders = Array.from(container.querySelectorAll('input[type="range"]'));
    expect(sliders).toHaveLength(2);
    expect(sliders.map((slider) => slider.min)).toEqual(['55', '55']);
    expect(sliders.map((slider) => slider.max)).toEqual(['100', '100']);
    expect(sliders.map((slider) => slider.value)).toEqual(['61', '58']);

    const nativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      nativeValue.call(sliders[0], '70');
      sliders[0].dispatchEvent(new Event('input', { bubbles: true }));
      sliders[0].dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(mockUser.updateProfile).not.toHaveBeenCalled();
    expect(mockUser.profile.date_of_birth).toBe('1965-06-15');
    expect(mockUser.partners[0].date_of_birth).toBe('1968-02-10');
    expect(sliders[0].value).toBe('70');
  });

  it('names unanswered health questions instead of looking personalized', () => {
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'couple',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: 'current', education: 'college', health: null },
          'mary-id': { sex: 'female', smoking: 'current', education: null, health: null }
        }
      }
    };
    renderCalculator();

    expect(container.textContent).toContain('SSA population estimate');
    expect(container.textContent).not.toContain('Personalized estimate');
    expect(container.textContent).toMatch(/current health/i);
    expect(container.textContent).toMatch(/education/i);
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
    const firstCard = container.querySelector('[data-longevity-card="75"]');
    expect(firstCard.querySelector('[data-card-primary]').textContent).toBe('75%');
    expect(firstCard.querySelector('[data-card-secondary]').textContent).toMatch(/^age \d+/);
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

  it('moves couple cards when health extremes change and the production artifact is loaded', () => {
    mockNhisArtifact = jest.requireActual('../calculators/longevity/nhisArtifact').getProductionNhisArtifact();
    mockUser.profile = tedProfile;
    mockUser.partners = [maryPartner];
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'couple',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: 'never', education: 'college', health: 'excellent' },
          'mary-id': { sex: 'female', smoking: 'never', education: 'college', health: 'excellent' }
        }
      }
    };
    renderCalculator();

    const favorableYear = container.querySelector('[data-longevity-card="50"] [data-card-secondary]').textContent;
    expect(container.textContent).toMatch(/Development personalization|Personalized estimate/);
    expect(container.textContent).toMatch(/missed the calibration-slope/);

    const currentButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Current');
    const highSchoolButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'High School−');
    const fairButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Fair or Poor');
    act(() => {
      currentButtons.forEach((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      highSchoolButtons.forEach((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      fairButtons.forEach((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    });

    const adverseYear = container.querySelector('[data-longevity-card="50"] [data-card-secondary]').textContent;
    expect(adverseYear).not.toBe(favorableYear);
  });

  it('recomputes cards when the last health answer is filled and a model artifact is present', () => {
    mockNhisArtifact = buildTestNhissArtifact();
    mockUser.profile = tedProfile;
    mockUser.preferences = {
      lifeExpectancy: {
        schemaVersion: 2,
        calcType: 'individual',
        profilesByPersonId: {
          'ted-id': { sex: 'male', smoking: 'never', education: 'college', health: null }
        }
      }
    };
    renderCalculator();

    const incompleteAge = container.querySelector('[data-longevity-card="50"] [data-card-secondary]').textContent;
    expect(container.textContent).toContain('SSA population estimate');
    expect(container.textContent).toMatch(/current health/i);

    const excellent = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Excellent');
    act(() => {
      excellent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Personalized estimate');
    const completeAge = container.querySelector('[data-longevity-card="50"] [data-card-secondary]').textContent;
    expect(completeAge).not.toBe(incompleteAge);
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
