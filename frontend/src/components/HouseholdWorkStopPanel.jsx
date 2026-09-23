import React, { useState } from 'react';

const formatPia = (value) => `$${Math.round(value).toLocaleString()}`;

const HouseholdWorkStopPanel = ({ primaryName, spouseName, rungs }) => {
  const [expanded, setExpanded] = useState(false);

  if (!rungs?.length) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="household-work-stop-panel"
        aria-label={`${expanded ? 'Hide' : 'Show'} combined household work-stop view`}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      >
        <span>
          <span className="block text-sm font-semibold">Combined household work-stop view</span>
          <span className="block text-xs text-slate-500">
            Compare both records; not a benefit estimate
          </span>
        </span>
        <svg
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="household-work-stop-panel"
        aria-hidden={!expanded}
        className={`overflow-hidden border-t border-slate-200 transition-[max-height,opacity] duration-300 ease-out ${
          expanded ? 'max-h-[28rem] opacity-100' : 'max-h-0 border-t-transparent opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-slate-500">
            This simple sum compares each person's projected PIA if both stop at the same age.
            It is not a household benefit; each person's own PIA year applies, without spousal
            or survivor benefit rules.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {rungs.map((rung) => (
              <div key={rung.stopAge} className="text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Both stop at {rung.stopAge}
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {formatPia(rung.householdPia)}
                </div>
                <div className="text-xs text-slate-500">
                  {primaryName} {formatPia(rung.spouse1Pia)} + {spouseName} {formatPia(rung.spouse2Pia)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HouseholdWorkStopPanel;
