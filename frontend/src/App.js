import React, { useState } from 'react';
import { BrowserRouter as Router, Link, useLocation } from 'react-router-dom';
import { UserProvider, useUser } from './contexts/UserContext.jsx';
import { DevModeProvider, useDevMode } from './contexts/DevModeContext.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import CalculatorApp from './components/CalculatorApp.jsx';

// Root App with Providers
function App() {
  return (
    <Router>
      <DevModeProvider>
        <UserProvider>
          <AppWithDevMode />
        </UserProvider>
      </DevModeProvider>
    </Router>
  );
}

// Wrapper to handle Dev Mode vs Real Mode
function AppWithDevMode() {
  const { isDevMode, isDemo, devUser, devProfile, toggleDevMode, devResetOnboarding, devClearAll } = useDevMode();
  const { user: realUser, profile: realProfile, loading: realLoading } = useUser();
  const location = useLocation();

  // Use dev or real data based on mode
  const user = isDevMode ? devUser : realUser;
  const profile = isDevMode ? devProfile : realProfile;
  const loading = isDevMode ? false : realLoading;

  // Helper app routes that should bypass onboarding (but still require auth)
  const helperAppRoutes = [
    '/sequence-risk',
    '/longevity-spending',
    '/income-target',
    '/budget-worksheet',
    '/pia-calculator',
    '/start-stop-start'
  ];
  const isHelperRoute = helperAppRoutes.some(route => location.pathname.startsWith(route));

  // Demo host banner: no login, edit everything in Settings, data persists here
  const DemoBanner = () => (
    <div className="bg-slate-900 text-slate-100 px-4 py-1.5 text-xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-bold tracking-wide">DEMO MODE</span>
          <span className="text-slate-400"> · Saved in this browser only</span>
        </p>
        <div className="flex items-center gap-3">
          <Link to="/settings" className="font-semibold underline underline-offset-2 hover:text-white">
            Edit profile &amp; DOBs
          </Link>
          <button
            onClick={() => {
              if (window.confirm('Reset the demo profile to its defaults? Your edited DOBs, PIAs and partner will be cleared.')) {
                devClearAll();
              }
            }}
            className="text-slate-400 hover:text-white"
          >
            Reset demo
          </button>
        </div>
      </div>
    </div>
  );

  // Dev Mode Banner and Controls
  const DevModeBanner = () => (
    <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-900 px-4 py-2 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔧</span>
          <div>
            <p className="font-bold text-sm">DEV MODE ACTIVE</p>
            <p className="text-xs">Using local test data - No Supabase required</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile && (
            <>
              <button
                onClick={devResetOnboarding}
                className="px-3 py-1 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-xs font-semibold transition"
              >
                Reset Onboarding
              </button>
              <button
                onClick={devClearAll}
                className="px-3 py-1 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-xs font-semibold transition"
              >
                Clear All Data
              </button>
            </>
          )}
          <button
            onClick={toggleDevMode}
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
          >
            Exit Dev Mode
          </button>
        </div>
      </div>
    </div>
  );

  // Dev Mode Toggle (when not in dev mode) - only show on localhost
  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0'
  );

  const DevModeToggle = () => isLocalhost ? (
    <button
      onClick={toggleDevMode}
      className="fixed top-4 right-4 z-50 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-slate-900 rounded-lg text-sm font-semibold shadow-lg transition"
    >
      🔧 Enable Dev Mode
    </button>
  ) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-white text-lg">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // If not logged in, show login (regardless of route)
  if (!user) {
    return (
      <>
        {!isDevMode && <DevModeToggle />}
        <LoginScreenWithDevMode />
      </>
    );
  }

  // If on a helper route, skip onboarding check and go directly to CalculatorApp (which handles routing)
  if (isHelperRoute) {
    return (
      <>
        {isDemo ? <DemoBanner /> : isDevMode && <DevModeBanner />}
        <CalculatorApp />
      </>
    );
  }

  // For main app routes, require onboarding completion
  return (
    <>
      {isDemo ? <DemoBanner /> : isDevMode && <DevModeBanner />}
      {!isDevMode && !user && <DevModeToggle />}

      {!profile?.onboarding_completed_at ? (
        <OnboardingScreenWithDevMode />
      ) : (
        <CalculatorApp />
      )}
    </>
  );
}

// Login Screen with Dev Mode support
function LoginScreenWithDevMode() {
  const { isDevMode, devLogin, devSignup, loadTestScenario, testScenarios } = useDevMode();
  const [showScenarios, setShowScenarios] = useState(false);

  if (isDevMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">💼 Lifelong Navigator</h1>
            <p className="text-slate-600">Social Security Optimization Platform</p>
            <p className="text-sm text-yellow-600 mt-2 font-semibold">🔧 Development Mode</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                devLogin('test@test.com');
                devSignup({
                  email: 'test@test.com',
                  firstName: 'Test',
                  lastName: 'User',
                  dateOfBirth: '1965-01-15',
                  relationshipStatus: 'single'
                });
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Quick Start (Skip to Onboarding)
            </button>

            <button
              onClick={() => setShowScenarios(!showScenarios)}
              className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {showScenarios ? 'Hide' : 'Load'} Test Scenarios
            </button>

            {showScenarios && (
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-semibold text-slate-700 mb-2">Pre-filled Test Scenarios:</p>
                {Object.entries(testScenarios).map(([key, scenario]) => (
                  <button
                    key={key}
                    onClick={() => {
                      loadTestScenario(key);
                    }}
                    className="w-full text-left px-3 py-2 bg-white hover:bg-blue-50 border border-slate-200 rounded text-sm transition"
                  >
                    <span className="font-semibold capitalize">{key}</span>
                    <span className="text-slate-600 ml-2">
                      ({scenario.firstName} {scenario.lastName})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">
            Dev Mode: Test unlimited scenarios without Supabase
          </p>
        </div>
      </div>
    );
  }

  return <LoginScreen />;
}

// Onboarding Screen with Dev Mode support  
function OnboardingScreenWithDevMode() {
  const { isDevMode, devProfile, devPartners, updateDevProfile, devCompleteOnboarding, devAddPartner, devAddChild } = useDevMode();

  if (isDevMode) {
    // Use local state version for dev mode
    return <OnboardingScreen devMode={{
      profile: devProfile,
      partners: devPartners,
      updateProfile: updateDevProfile,
      completeOnboarding: devCompleteOnboarding,
      addPartner: devAddPartner,
      addChild: devAddChild
    }} />;
  }

  return <OnboardingScreen />;
}

export default App;
