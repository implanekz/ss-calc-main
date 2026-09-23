import React from 'react';

export const Tabs = ({ children, className = '' }) => {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
};

export const TabList = ({ children, className = '' }) => {
  return (
    <div className={`flex gap-2 border-b border-gray-200 mb-4 overflow-x-auto scrollbar-hide ${className}`}>
      {children}
    </div>
  );
};

export const Tab = ({ active = false, children, className = '', ...props }) => {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`
        px-4 py-2 font-semibold text-sm whitespace-nowrap
        border-b-2 transition-all duration-200
        ${active
          ? 'border-primary-600 text-primary-600'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
        }
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

export const TabPanel = ({ active = false, children, className = '' }) => {
  if (!active) return null;

  return (
    <div role="tabpanel" className={`animate-fade-in ${className}`}>
      {children}
    </div>
  );
};

// Editorial underline tabs (Ret1re brand): navy label with a red underline when active.
export const PillTabs = ({ children, className = '' }) => {
  return (
    <div role="tablist" className={`flex gap-x-7 gap-y-1 ${className}`}>
      {children}
    </div>
  );
};

export const PillTab = ({ active = false, children, className = '', ...props }) => {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`
        py-3 font-bold text-[15px] whitespace-nowrap
        transition-colors duration-200
        ${active
          ? 'text-ret1re-navy shadow-[inset_0_-3px_0_0_#D50024]'
          : 'text-ret1re-warmGray hover:text-ret1re-charcoal'
        }
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};
