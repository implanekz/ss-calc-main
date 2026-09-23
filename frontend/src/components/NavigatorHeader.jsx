import React from 'react';

// Shared top bar for every Lifelong Navigator route: logo + tagline on the left, serif title in
// the center, route-specific actions (passed as children) on the right.
const NavigatorHeader = ({ children }) => (
  <nav className="sticky top-0 z-50 bg-white border-b border-ret1re-sand">
    <div className="px-6 sm:px-10 lg:px-16">
      <div className="flex items-center py-3">
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <img
            src="/assets/logos/Ret1re Logo.png"
            alt="Ret1re Logo"
            className="h-8 sm:h-10 lg:h-12 w-auto"
          />
          <span className="hidden lg:block h-8 border-l border-ret1re-sand" aria-hidden="true" />
          <p className="hidden lg:block text-base text-ret1re-warmGray italic whitespace-nowrap">
            Income is the #1 outcome that matters.
          </p>
        </div>

        <div className="flex-1 min-w-[8px] sm:min-w-[16px]" />

        <div className="flex-shrink-0">
          <h1 className="font-display text-2xl sm:text-4xl lg:text-[44px] font-bold text-ret1re-navy whitespace-nowrap tracking-tight leading-none">
            Lifelong Navigator
          </h1>
        </div>

        <div className="flex-1 min-w-[8px] sm:min-w-[16px]" />

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {children}
        </div>
      </div>
      <div className="sm:hidden pb-2">
        <p className="text-xs text-ret1re-warmGray italic text-center">
          Income is the #1 outcome that matters.
        </p>
      </div>
    </div>
  </nav>
);

// Quiet navy link-button used in the header's right slot.
export const headerButtonClass =
  'px-4 py-2 rounded-md font-semibold text-sm whitespace-nowrap border border-ret1re-navy text-ret1re-navy bg-white hover:bg-ret1re-navyTint transition-colors';

export default NavigatorHeader;
