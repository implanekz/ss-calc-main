import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import ShowMeTheMoneyCalculator from './ShowMeTheMoneyCalculator.jsx';
import NavigatorHeader, { headerButtonClass } from './NavigatorHeader.jsx';
import DivorcedCalculator from './DivorcedCalculator.jsx';
import SSDICalculator from './SSDICalculator.jsx';
import WidowCalculator from './WidowCalculator.jsx';
import PIACalculator from './PIACalculator.jsx';
import Settings from './Settings.jsx';
import RetirementSpendingApp from './helperApps/RetirementSpendingApp.jsx';
import RetirementIncomeNeedsApp from './helperApps/RetirementIncomeNeedsApp.jsx';
import SequenceOfReturnsApp from './helperApps/SequenceOfReturnsApp.jsx';
import RetirementBudgetWorksheet from './helperApps/RetirementBudgetWorksheet.jsx';
import StartStopStartCalculator from './StartStopStartCalculator.jsx';
import LifeExpectancyCalculator from './LifeExpectancyCalculator.jsx';

function CalculatorApp() {
  const [activeApp, setActiveApp] = useState('ss');
  const [calculatorType, setCalculatorType] = useState('married');
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);

  const calculatorTypes = [
    { id: 'married', label: 'Married/Single', icon: '👫' },
    { id: 'divorced', label: 'Divorced', icon: '💔' },
    { id: 'widowed', label: 'Widowed', icon: '🕊️' },
    { id: 'ssdi', label: 'Disability', icon: '♿' },
  ];

  const navItems = [
    { id: 'ss', label: 'Social Security Planner', icon: '💰' },
  ];

  return (
    <Routes>
      <Route path="/settings" element={<Settings />} />
      <Route path="/pia-calculator" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <PIACalculator />
          </main>
        </div>
      } />
      <Route path="/sequence-risk" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <SequenceOfReturnsApp />
          </main>
        </div>
      } />
      <Route path="/longevity-spending" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <RetirementSpendingApp />
          </main>
        </div>
      } />
      <Route path="/income-target" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <RetirementIncomeNeedsApp />
          </main>
        </div>
      } />
      <Route path="/budget-worksheet" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <RetirementBudgetWorksheet />
          </main>
        </div>
      } />
      <Route path="/start-stop-start" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <StartStopStartCalculator />
          </main>
        </div>
      } />
      <Route path="/life-expectancy" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            <Link to="/" className={headerButtonClass}>
              Social Security Calculator
            </Link>
          </NavigatorHeader>
          <main className="animate-fade-in">
            <LifeExpectancyCalculator />
          </main>
        </div>
      } />
      <Route path="/*" element={
        <div className="min-h-screen bg-ret1re-cream">
          <NavigatorHeader>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveApp(item.id)}
                className={`px-3 sm:px-4 py-2 rounded-md font-semibold text-sm whitespace-nowrap transition-colors ${activeApp === item.id
                  ? 'bg-ret1re-navy text-white hover:bg-ret1re-navyLight'
                  : 'border border-ret1re-navy text-ret1re-navy bg-white hover:bg-ret1re-navyTint'
                  }`}
                aria-label={item.label}
                aria-current={activeApp === item.id ? 'page' : undefined}
              >
                <span className="sm:hidden">SS</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}

            {/* Calculator Type Dropdown - Only show when SS is active */}
            {activeApp === 'ss' && (
              <>
                <select
                  value={calculatorType}
                  onChange={(e) => setCalculatorType(e.target.value)}
                  className="px-3 py-2 bg-white text-ret1re-charcoal rounded-md font-semibold text-sm border border-ret1re-sand hover:border-ret1re-sandDark focus:outline-none focus:ring-2 focus:ring-ret1re-navy/20 focus:border-ret1re-navy"
                >
                  {calculatorTypes.map((type) => (
                    <option key={type.id} value={type.id} disabled={type.disabled}>
                      {type.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setShowHelpDropdown(!showHelpDropdown)}
                  className="text-sm text-ret1re-navy font-semibold underline decoration-ret1re-sandDark underline-offset-4 hover:decoration-ret1re-navy px-2 py-1 cursor-pointer transition-colors"
                >
                  Need help choosing?
                </button>
              </>
            )}
          </NavigatorHeader>

          {/* Help Modal - Centered floating modal */}
          {showHelpDropdown && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setShowHelpDropdown(false)}
              />
              {/* Modal Content */}
              <div className="relative bg-slate-800 rounded-xl shadow-2xl border border-slate-600 p-6 w-full max-w-md animate-fade-in">
                <button
                  onClick={() => setShowHelpDropdown(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
                >
                  ✕
                </button>
                <h3 className="text-xl font-bold text-slate-200 mb-4">💡 Calculator Selection Guide</h3>
                <div className="space-y-3">
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-300 font-semibold mb-1">Married or single?</p>
                    <p className="text-slate-400 text-sm">→ Use <strong className="text-white">Married/Single</strong> calculator</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-300 font-semibold mb-1">Divorced (ex-spouse alive)?</p>
                    <p className="text-slate-400 text-sm">→ Use <strong className="text-white">Divorced</strong> calculator</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-300 font-semibold mb-1">Divorced (ex-spouse deceased)?</p>
                    <p className="text-slate-400 text-sm">→ Use <strong className="text-white">Widowed</strong> calculator</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-300 font-semibold mb-1">Widowed?</p>
                    <p className="text-slate-400 text-sm">→ Use <strong className="text-white">Widowed</strong> calculator</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-slate-300 font-semibold mb-1">Considering Disability (SSDI)?</p>
                    <p className="text-slate-400 text-sm">→ Use <strong className="text-white">Disability</strong> calculator</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                  <p className="text-xs text-blue-200 italic">
                    💡 Tip: If your ex-spouse is deceased, you may qualify for survivor benefits (not ex-spouse benefits)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <main className="animate-fade-in">
            {activeApp === 'ss' && (
              <>
                {calculatorType === 'married' && <ShowMeTheMoneyCalculator />}
                {calculatorType === 'divorced' && <DivorcedCalculator onSwitchToMarried={() => setCalculatorType('married')} />}
                {calculatorType === 'widowed' && <WidowCalculator />}
                {calculatorType === 'ssdi' && <SSDICalculator />}
              </>
            )}
            {activeApp === 'start-stop-start' && <StartStopStartCalculator />}
            {activeApp === 'pia' && <PIACalculator />}
            {activeApp === 'helper-spending' && <RetirementSpendingApp />}
            {activeApp === 'helper-income' && <RetirementIncomeNeedsApp />}
            {activeApp === 'sequence' && <SequenceOfReturnsApp />}
            {activeApp === 'budget' && <RetirementBudgetWorksheet />}
          </main>
        </div>
      } />
    </Routes>
  );
}

export default CalculatorApp;
