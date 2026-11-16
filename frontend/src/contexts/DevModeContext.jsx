/**
 * DevModeContext - Development mode for testing without Supabase
 * Allows testing onboarding flows, different scenarios, unlimited resets
 */
import React, { createContext, useContext, useState, useEffect } from 'react';

const DevModeContext = createContext(null);

// Demo mode: on these hosts only, skip login and run on a browser-stored
// demo identity that persists between visits and is edited in Settings.
// Production (ret1re.com) never matches, so real auth is untouched there.
// demo.localhost previews demo mode locally (http://demo.localhost:3000).
//
// Demo and dev mode share this browser-data plumbing (`isDevMode` means "use
// browser data, not Supabase"), but never share data or UI: each host is its
// own storage origin, and dev tooling is gated on `isDevTools`, which is
// false in demo mode.
export const DEMO_HOSTS = ['test.ret1re.com', 'demo.localhost'];

export const isDemoHost = () =>
  typeof window !== 'undefined' && DEMO_HOSTS.includes(window.location.hostname);

const isLocalDev = () =>
  process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost';

const shouldAutoSeed = () => isDemoHost() || isLocalDev();

const readSaved = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Settings saves camelCase keys while calculators read snake_case first (the
// real API normalizes both). Mirror each edited field to its twins so a DOB or
// PIA edit in Settings reaches every calculator.
const PROFILE_KEY_TWINS = [
  ['dateOfBirth', 'date_of_birth'],
  ['firstName', 'first_name'],
  ['lastName', 'last_name'],
  ['relationshipStatus', 'relationship_status'],
  ['piaAtFra', 'pia_at_fra']
];
const PARTNER_KEY_TWINS = [
  ['dateOfBirth', 'date_of_birth'],
  ['firstName', 'first_name'],
  ['lastName', 'last_name'],
  ['piaAtFra', 'pia_at_fra', 'pia']
];

export const mirrorKeys = (updates, twins) => {
  const out = { ...updates };
  twins.forEach((group) => {
    const present = group.find((key) => Object.prototype.hasOwnProperty.call(updates, key));
    if (present) group.forEach((key) => { out[key] = updates[present]; });
  });
  return out;
};

const makeDefaultUser = () => ({
  id: 'dev-user-id',
  email: isDemoHost() ? 'demo@test.ret1re.com' : 'demo@example.com',
  created_at: new Date().toISOString()
});

const makeDefaultProfile = () => ({
  id: 'dev-user-id',
  first_name: 'Demo',
  last_name: 'User',
  date_of_birth: '1965-01-15',
  relationship_status: 'single',
  onboarding_completed: true,
  onboarding_completed_at: new Date().toISOString(),
  created_at: new Date().toISOString()
});

// Test scenarios for quick testing
export const TEST_SCENARIOS = {
  single: {
    firstName: 'Primary',
    lastName: 'Filer',
    dateOfBirth: '1965-01-15',
    relationshipStatus: 'single',
    receivingBenefits: false,
    email: 'primary.filer@test.com'
  },
  married: {
    firstName: 'Primary',
    lastName: 'Filer',
    dateOfBirth: '1960-06-20',
    relationshipStatus: 'married',
    receivingBenefits: false,
    partnerDob: '1958-03-10',
    partnerReceivingBenefits: false,
    email: 'primary.filer@test.com'
  },
  divorced: {
    firstName: 'Primary',
    lastName: 'Filer',
    dateOfBirth: '1962-09-05',
    relationshipStatus: 'divorced',
    receivingBenefits: false,
    partnerDob: '1960-12-15',
    partnerReceivingBenefits: true,
    divorceDate: '2020-03-20',
    marriageLength: '15',
    email: 'primary.filer@test.com'
  },
  widowed: {
    firstName: 'Primary',
    lastName: 'Filer',
    dateOfBirth: '1958-11-30',
    relationshipStatus: 'widowed',
    receivingBenefits: true,
    partnerDob: '1955-07-22',
    dateOfDeath: '2022-05-10',
    email: 'primary.filer@test.com'
  }
};

export const DevModeProvider = ({ children }) => {
  const isDemo = isDemoHost();

  const [isDevMode, setIsDevMode] = useState(() => {
    // Demo host and local development always run on browser-stored data
    if (shouldAutoSeed()) return true;
    return localStorage.getItem('devMode') === 'true';
  });

  const [devUser, setDevUser] = useState(() => {
    const saved = readSaved('devUser');
    if (saved) return saved;
    return shouldAutoSeed() ? makeDefaultUser() : null;
  });

  const [devProfile, setDevProfile] = useState(() => {
    const saved = readSaved('devProfile');
    if (saved) return saved;
    return shouldAutoSeed() ? makeDefaultProfile() : null;
  });

  const [devPartners, setDevPartners] = useState(() => {
    const saved = localStorage.getItem('devPartners');
    return saved ? JSON.parse(saved) : [];
  });

  const [devChildren, setDevChildren] = useState(() => {
    const saved = localStorage.getItem('devChildren');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist dev mode state
  useEffect(() => {
    localStorage.setItem('devMode', isDevMode.toString());
  }, [isDevMode]);

  // Persist dev data
  useEffect(() => {
    if (isDevMode) {
      localStorage.setItem('devUser', JSON.stringify(devUser));
      localStorage.setItem('devProfile', JSON.stringify(devProfile));
      localStorage.setItem('devPartners', JSON.stringify(devPartners));
      localStorage.setItem('devChildren', JSON.stringify(devChildren));
    }
  }, [isDevMode, devUser, devProfile, devPartners, devChildren]);

  const toggleDevMode = () => {
    // Demo host has no real login to fall back to, so demo mode stays on
    if (isDemo) return;
    setIsDevMode(!isDevMode);
  };

  const devLogin = (email = 'test@test.com') => {
    const user = {
      id: 'dev-user-id',
      email: email,
      created_at: new Date().toISOString()
    };
    setDevUser(user);
    return user;
  };

  const devSignup = (userData) => {
    const user = {
      id: 'dev-user-id',
      email: userData.email,
      created_at: new Date().toISOString()
    };

    const profile = {
      id: 'dev-user-id',
      first_name: userData.firstName,
      last_name: userData.lastName,
      date_of_birth: userData.dateOfBirth,
      relationship_status: userData.relationshipStatus,
      onboarding_completed: false,
      created_at: new Date().toISOString()
    };

    setDevUser(user);
    setDevProfile(profile);
    return { user, profile };
  };

  const devLogout = () => {
    if (isDemo) return;
    setDevUser(null);
  };

  const devUpdateProfile = (updates) => {
    setDevProfile(prev => ({ ...prev, ...mirrorKeys(updates, PROFILE_KEY_TWINS) }));
  };

  const devCompleteOnboarding = () => {
    setDevProfile(prev => ({
      ...prev,
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString()
    }));
  };

  const devResetOnboarding = () => {
    setDevProfile(prev => ({
      ...prev,
      onboarding_completed: false
    }));
    setDevPartners([]);
    setDevChildren([]);
  };

  const devClearAll = () => {
    localStorage.removeItem('devUser');
    localStorage.removeItem('devProfile');
    localStorage.removeItem('devPartners');
    localStorage.removeItem('devChildren');
    // On the demo host, "clear" means back to the default demo identity
    setDevUser(isDemo ? makeDefaultUser() : null);
    setDevProfile(isDemo ? makeDefaultProfile() : null);
    setDevPartners([]);
    setDevChildren([]);
  };

  const devAddPartner = (partnerData) => {
    const partner = {
      id: `dev-partner-${Date.now()}`,
      user_id: 'dev-user-id',
      ...partnerData,
      created_at: new Date().toISOString()
    };
    setDevPartners(prev => [...prev, partner]);
    return partner;
  };

  const updateDevPartner = (index, rawUpdates) => {
    const updates = mirrorKeys(rawUpdates, PARTNER_KEY_TWINS);
    setDevPartners(prev => {
      const newPartners = [...prev];
      if (newPartners[index]) {
        newPartners[index] = { ...newPartners[index], ...updates };
      } else {
        // Settings saves the spouse via index 0; create it if none exists yet
        newPartners[index] = {
          id: `dev-partner-${Date.now()}`,
          user_id: 'dev-user-id',
          ...updates,
          created_at: new Date().toISOString()
        };
      }
      return newPartners;
    });
  };

  const devAddChild = (childData) => {
    const child = {
      id: `dev-child-${Date.now()}`,
      user_id: 'dev-user-id',
      ...childData,
      created_at: new Date().toISOString()
    };
    setDevChildren(prev => [...prev, child]);
    return child;
  };

  const loadTestScenario = (scenarioName) => {
    const scenario = TEST_SCENARIOS[scenarioName];
    if (!scenario) return;

    devClearAll();
    devSignup(scenario);
  };

  const value = {
    // State
    isDevMode,
    isDemo,
    isDevTools: isDevMode && !isDemo,
    devUser,
    devProfile,
    devPartners,
    devChildren,

    // Controls
    toggleDevMode,
    devLogin,
    devSignup,
    devLogout,
    updateDevProfile: devUpdateProfile,
    devCompleteOnboarding,
    devResetOnboarding,
    devClearAll,
    devAddPartner,
    updateDevPartner,
    devAddChild,
    loadTestScenario,

    // Test scenarios
    testScenarios: TEST_SCENARIOS
  };

  return (
    <DevModeContext.Provider value={value}>
      {children}
    </DevModeContext.Provider>
  );
};

export const useDevMode = () => {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error('useDevMode must be used within DevModeProvider');
  }
  return context;
};

export default DevModeContext;
