import React, { useState, useEffect } from 'react';
import { getTaxableMaximum } from '../utils/taxableMaximum';
import { tooltips } from '../utils/piaTooltips';
import { useUser } from '../contexts/UserContext';
import { useCalculatorPersistence } from '../hooks/useCalculatorPersistence';
import { Tabs, TabList, Tab } from './ui/Tabs';
import { API_BASE_URL } from '../config/api';
import { saveEarnings, stashDevEarnings } from '../services/earningsService';
import { getAuthToken } from '../config/supabase';
import { countZerosInTop35 } from '../utils/top35Zeros';

const PIACalculator = () => {
    // Get user context for names and marital status
    const { profile, partners } = useUser();

    // Read the main calculator's persisted state to sync married/single view
    const { state: mainCalcState } = useCalculatorPersistence('showMeTheMoney', {});

    // Determine if user is married - use main calculator's state if available, otherwise fall back to profile
    const isMarried = mainCalcState?.isMarried !== undefined
        ? mainCalcState.isMarried
        : (profile?.relationship_status && ['married', 'divorced', 'widowed'].includes(profile.relationship_status));

    // Tab management
    const [activeTab, setActiveTab] = useState('primary');

    // PRIMARY State management - use profile DOB if available
    const getInitialBirthYear = () => {
        if (profile?.date_of_birth) {
            const birthYear = new Date(profile.date_of_birth).getFullYear();
            if (birthYear >= 1937 && birthYear <= 2010) {
                return birthYear;
            }
        }
        return 1964;
    };
    const [primaryBirthYear, setPrimaryBirthYear] = useState(getInitialBirthYear());
    const [primaryUseCalculatedPIA, setPrimaryUseCalculatedPIA] = useState(false);
    const [primarySsaPIA, setPrimarySsaPIA] = useState('');
    const [primaryEarningsHistory, setPrimaryEarningsHistory] = useState([]);
    const [primaryCalculatedResult, setPrimaryCalculatedResult] = useState(null);
    const [primaryIsCalculating, setPrimaryIsCalculating] = useState(false);
    const [primaryError, setPrimaryError] = useState(null);
    const [primaryIsUploadingXML, setPrimaryIsUploadingXML] = useState(false);
    const [primaryXmlUploadSuccess, setPrimaryXmlUploadSuccess] = useState(null);
    const [primaryStatementDate, setPrimaryStatementDate] = useState(null);
    const [primaryPersonInfo, setPrimaryPersonInfo] = useState(null);
    const [, setPrimaryWhatIfScenario] = useState(null);
    const [primaryWhatIfResult, setPrimaryWhatIfResult] = useState(null);
    const [primaryShowWhatIfModal, setPrimaryShowWhatIfModal] = useState(false);
    const [primaryWhatIfEarnings, setPrimaryWhatIfEarnings] = useState([]);
    const [, setPrimaryUploadedFileName] = useState(null);
    const [, setPrimaryUploadedFileHash] = useState(null);

    // SPOUSE State management - use partner DOB if available
    const getInitialSpouseBirthYear = () => {
        if (partners && partners.length > 0 && partners[0].date_of_birth) {
            const birthYear = new Date(partners[0].date_of_birth).getFullYear();
            if (birthYear >= 1937 && birthYear <= 2010) {
                return birthYear;
            }
        }
        return 1960;
    };
    const [spouseBirthYear, setSpouseBirthYear] = useState(getInitialSpouseBirthYear());
    const [spouseUseCalculatedPIA, setSpouseUseCalculatedPIA] = useState(false);
    const [spouseSsaPIA, setSpouseSsaPIA] = useState('');
    const [spouseEarningsHistory, setSpouseEarningsHistory] = useState([]);
    const [spouseCalculatedResult, setSpouseCalculatedResult] = useState(null);
    const [spouseIsCalculating, setSpouseIsCalculating] = useState(false);
    const [spouseError, setSpouseError] = useState(null);
    const [spouseIsUploadingXML, setSpouseIsUploadingXML] = useState(false);
    const [spouseXmlUploadSuccess, setSpouseXmlUploadSuccess] = useState(null);
    const [spouseStatementDate, setSpouseStatementDate] = useState(null);
    const [spousePersonInfo, setSpousePersonInfo] = useState(null);
    const [, setSpouseWhatIfScenario] = useState(null);
    const [spouseWhatIfResult, setSpouseWhatIfResult] = useState(null);
    const [spouseShowWhatIfModal, setSpouseShowWhatIfModal] = useState(false);
    const [spouseWhatIfEarnings, setSpouseWhatIfEarnings] = useState([]);
    const [, setSpouseUploadedFileName] = useState(null);
    const [, setSpouseUploadedFileHash] = useState(null);

    // Helper: Get person-specific state based on active tab
    const isPrimary = activeTab === 'primary';
    const birthYear = isPrimary ? primaryBirthYear : spouseBirthYear;
    const setBirthYear = isPrimary ? setPrimaryBirthYear : setSpouseBirthYear;
    const useCalculatedPIA = isPrimary ? primaryUseCalculatedPIA : spouseUseCalculatedPIA;
    const setUseCalculatedPIA = isPrimary ? setPrimaryUseCalculatedPIA : setSpouseUseCalculatedPIA;
    const ssaPIA = isPrimary ? primarySsaPIA : spouseSsaPIA;
    const setSsaPIA = isPrimary ? setPrimarySsaPIA : setSpouseSsaPIA;
    const earningsHistory = isPrimary ? primaryEarningsHistory : spouseEarningsHistory;
    const setEarningsHistory = isPrimary ? setPrimaryEarningsHistory : setSpouseEarningsHistory;
    const calculatedResult = isPrimary ? primaryCalculatedResult : spouseCalculatedResult;
    const setCalculatedResult = isPrimary ? setPrimaryCalculatedResult : setSpouseCalculatedResult;
    const isCalculating = isPrimary ? primaryIsCalculating : spouseIsCalculating;
    const setIsCalculating = isPrimary ? setPrimaryIsCalculating : setSpouseIsCalculating;
    const error = isPrimary ? primaryError : spouseError;
    const setError = isPrimary ? setPrimaryError : setSpouseError;
    const isUploadingXML = isPrimary ? primaryIsUploadingXML : spouseIsUploadingXML;
    const setIsUploadingXML = isPrimary ? setPrimaryIsUploadingXML : setSpouseIsUploadingXML;
    const xmlUploadSuccess = isPrimary ? primaryXmlUploadSuccess : spouseXmlUploadSuccess;
    const setXmlUploadSuccess = isPrimary ? setPrimaryXmlUploadSuccess : setSpouseXmlUploadSuccess;
    const statementDate = isPrimary ? primaryStatementDate : spouseStatementDate;
    const setStatementDate = isPrimary ? setPrimaryStatementDate : setSpouseStatementDate;
    const personInfo = isPrimary ? primaryPersonInfo : spousePersonInfo;
    const setPersonInfo = isPrimary ? setPrimaryPersonInfo : setSpousePersonInfo;
    const setWhatIfScenario = isPrimary ? setPrimaryWhatIfScenario : setSpouseWhatIfScenario;
    const whatIfResult = isPrimary ? primaryWhatIfResult : spouseWhatIfResult;
    const setWhatIfResult = isPrimary ? setPrimaryWhatIfResult : setSpouseWhatIfResult;
    const showWhatIfModal = isPrimary ? primaryShowWhatIfModal : spouseShowWhatIfModal;
    const setShowWhatIfModal = isPrimary ? setPrimaryShowWhatIfModal : setSpouseShowWhatIfModal;
    const whatIfEarnings = isPrimary ? primaryWhatIfEarnings : spouseWhatIfEarnings;
    const setWhatIfEarnings = isPrimary ? setPrimaryWhatIfEarnings : setSpouseWhatIfEarnings;
    const setUploadedFileName = isPrimary ? setPrimaryUploadedFileName : setSpouseUploadedFileName;
    const setUploadedFileHash = isPrimary ? setPrimaryUploadedFileHash : setSpouseUploadedFileHash;

    // Get tab labels from user context
    const pFirst = profile?.firstName || profile?.first_name;
    const pLast = profile?.lastName || profile?.last_name;
    const primaryLabel = pFirst && pLast ? `${pFirst} ${pLast}` : 'Primary Spouse';

    const sFirst = partners?.[0]?.firstName || partners?.[0]?.first_name;
    const sLast = partners?.[0]?.lastName || partners?.[0]?.last_name;
    const spouseLabel = sFirst && sLast ? `${sFirst} ${sLast}` : 'Spouse Filer';

    // Sync Primary Birth Year
    useEffect(() => {
        const dob = profile?.date_of_birth || profile?.dateOfBirth;
        if (dob) {
            const y = new Date(dob).getFullYear();
            if (y >= 1937 && y <= 2010 && y !== primaryBirthYear) setPrimaryBirthYear(y);
        }
    }, [profile, primaryBirthYear]);

    // Sync Spouse Birth Year
    useEffect(() => {
        if (partners?.[0]) {
            const dob = partners[0].date_of_birth || partners[0].dateOfBirth;
            if (dob) {
                const y = new Date(dob).getFullYear();
                if (y >= 1937 && y <= 2010 && y !== spouseBirthYear) setSpouseBirthYear(y);
            }
        }
    }, [partners, spouseBirthYear]);

    // Initialize earnings history with current year and future projections
    useEffect(() => {
        // Only initialize if earnings history is empty OR contains no data
        const hasData = earningsHistory.some(e => e.earnings > 0);

        if (earningsHistory.length === 0 || !hasData) {
            const currentYear = new Date().getFullYear();
            const startYear = birthYear + 18; // Assume work starts at 18
            const endYear = Math.min(currentYear + 15, birthYear + 80); // Project 15 years out or to age 80

            // If we are regenerating due to birth year change, we can preserve existing non-zero values if years match?
            // But if !hasData, there are no values to preserve.

            const initialEarnings = [];
            for (let year = startYear; year <= endYear; year++) {
                const isFuture = year > currentYear;
                const isPast = year < currentYear - 5; // Last 5 years visible by default

                initialEarnings.push({
                    year,
                    earnings: 0,
                    is_projected: isFuture,
                    editable: true,
                    visible: !isPast || year >= currentYear - 10 // Show last 10 years + future
                });
            }
            setEarningsHistory(initialEarnings);
        }
        // earningsHistory is deliberately excluded: it's read only to decide whether to
        // (re)initialize, and the initial fill is all-zero, so including it here would
        // re-trigger this effect on its own write and loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [birthYear, activeTab]); // Re-run when birthYear changes or tab switches

    // Calculate PIA from earnings
    // Accepts an optional earnings-history override so callers that just
    // replaced earningsHistory via setEarningsHistory() (async, not yet
    // reflected in this closure) can pass the fresh array directly instead
    // of racing the state update. The manual "Calculate PIA" button omits
    // it and reads current state, unchanged from before.
    const calculatePIA = async (earningsOverride) => {
        setIsCalculating(true);
        setError(null);

        try {
            // Filter to only send non-zero or recent years
            const sourceEarnings = earningsOverride ?? earningsHistory;
            const relevantEarnings = sourceEarnings
                .filter(e => e.earnings > 0 || e.year >= new Date().getFullYear() - 5)
                .map(e => ({
                    year: e.year,
                    earnings: Math.min(parseFloat(e.earnings) || 0, getTaxableMaximum(e.year)),
                    is_projected: e.is_projected
                }));

            console.log('Sending request with:', {
                birth_year: birthYear,
                earnings_count: relevantEarnings.length,
                sample_earnings: relevantEarnings.slice(0, 3)
            });

            const response = await fetch(`${API_BASE_URL}/calculate-pia-from-earnings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify({
                    birth_year: birthYear,
                    earnings_history: relevantEarnings
                })
            });

            console.log('Response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('PIA calculation result:', result);
            setCalculatedResult(result);
            setUseCalculatedPIA(true); // Auto-switch to calculated PIA
        } catch (err) {
            setError(err.message);
            console.error('PIA calculation error:', err);
        } finally {
            setIsCalculating(false);
        }
    };


    // Create What-If Scenario
    const createWhatIfScenario = () => {
        if (!calculatedResult) {
            setError('Please calculate your current PIA first');
            return;
        }

        // Clone current earnings for editing
        setWhatIfEarnings([...earningsHistory]);
        setShowWhatIfModal(true);
    };

    // Calculate What-If PIA
    const calculateWhatIfPIA = async () => {
        console.log('Calculate What-If PIA clicked');
        setIsCalculating(true);
        setError(null);

        try {
            // Include ALL years, not just non-zero ones
            const relevantEarnings = whatIfEarnings
                .filter(e => e.visible) // Only send visible earnings
                .map(e => ({
                    year: e.year,
                    earnings: Math.min(parseFloat(e.earnings) || 0, getTaxableMaximum(e.year)),
                    is_projected: e.is_projected
                }));

            console.log('Sending what-if request:', {
                birth_year: birthYear,
                earnings_count: relevantEarnings.length,
                sample: relevantEarnings.slice(0, 3)
            });

            const response = await fetch(`${API_BASE_URL}/calculate-pia-from-earnings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify({
                    birth_year: birthYear,
                    earnings_history: relevantEarnings
                })
            });

            console.log('What-if response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('What-if error response:', errorText);
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('What-if result:', result);

            setWhatIfResult(result);
            setWhatIfScenario({
                name: 'What-If Scenario',
                earnings: whatIfEarnings,
                result: result
            });
            setShowWhatIfModal(false);
        } catch (err) {
            const errorMsg = `What-If Calculation Failed: ${err.message}`;
            setError(errorMsg);
            console.error('What-If calculation error:', err);
            alert(errorMsg); // Show alert for immediate feedback
        } finally {
            setIsCalculating(false);
        }
    };

    // Update What-If earnings
    const updateWhatIfEarnings = (year, value) => {
        setWhatIfEarnings(prev =>
            prev.map(e =>
                e.year === year
                    ? { ...e, earnings: value }
                    : e
            )
        );
    };

    // Close What-If comparison
    const closeWhatIf = () => {
        setWhatIfScenario(null);
        setWhatIfResult(null);
        setWhatIfEarnings([]);
    };

    // Reset all earnings data
    const resetAllEarnings = () => {
        if (!window.confirm('Are you sure you want to clear all earnings data? This cannot be undone.')) {
            return;
        }

        // Clear all state
        setEarningsHistory([]);
        setCalculatedResult(null);
        setWhatIfScenario(null);
        setWhatIfResult(null);
        setWhatIfEarnings([]);
        setXmlUploadSuccess(null);
        setStatementDate(null);
        setPersonInfo(null);
        setUploadedFileName(null);
        setUploadedFileHash(null);
        setBirthYear(1960);
        setSsaPIA(1800);
        setUseCalculatedPIA(false);
        setError(null);

        // Clear any browser storage
        try {
            localStorage.removeItem('pia_calculator_state');
            sessionStorage.removeItem('pia_calculator_state');
        } catch (e) {
            console.warn('Could not clear storage:', e);
        }
    };

    // Handle XML file upload - REPLACE instead of MERGE
    const handleXMLUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploadingXML(true);
        setError(null);
        setXmlUploadSuccess(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE_URL}/upload-ssa-xml`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'XML upload failed');
            }

            const result = await response.json();

            // CLEAR ALL PREVIOUS STATE - Replace, don't merge
            setWhatIfScenario(null);
            setWhatIfResult(null);
            setWhatIfEarnings([]);
            setCalculatedResult(null);
            setUseCalculatedPIA(false);

            // Generate file hash for tracking
            const fileHash = `${file.name}_${file.size}_${Date.now()}`;
            setUploadedFileName(file.name);
            setUploadedFileHash(fileHash);

            // Extract person info
            setPersonInfo(result.person_info);

            // Extract statement date if available
            if (result.person_info?.statement_date) {
                setStatementDate(result.person_info.statement_date);
            }

            // Update birth year from XML (only if provided and valid)
            // Track the resolved value locally too: setBirthYear() is async, so the
            // `birthYear` closure variable won't reflect this update until the next
            // render. Anything persisted later in this function must use this value.
            let resolvedBirthYear = birthYear;
            const profileBirthYear = profile?.date_of_birth
                ? new Date(profile.date_of_birth).getFullYear()
                : null;
            if (result.person_info?.birth_date) {
                const birthDate = new Date(result.person_info.birth_date);
                const year = birthDate.getFullYear();
                if (year >= 1937 && year <= 2010) {
                    if (profileBirthYear && profileBirthYear !== year) {
                        setError(
                            `This file says birth year ${year}, but the profile uses ${profileBirthYear}. We are keeping the profile date of birth for the PIA.`
                        );
                        resolvedBirthYear = profileBirthYear;
                    } else {
                        setBirthYear(year);
                        resolvedBirthYear = year;
                    }
                }
            }
            // If no birth date in XML, try to infer from earnings years
            else if (result.spreadsheet_data && result.spreadsheet_data.length > 0) {
                const earliestYear = Math.min(...result.spreadsheet_data.map(r => r.year));
                // Assume work started at age 18
                const inferredBirthYear = earliestYear - 18;
                if (inferredBirthYear >= 1937 && inferredBirthYear <= 2010) {
                    setBirthYear(inferredBirthYear);
                    resolvedBirthYear = inferredBirthYear;
                }
            }

            // Update SSA PIA if available
            if (result.original_pia) {
                setSsaPIA(result.original_pia);
            }

            // REPLACE earnings history completely
            if (result.spreadsheet_data && result.spreadsheet_data.length > 0) {
                const currentYear = new Date().getFullYear();

                const mappedEarnings = result.spreadsheet_data.map(row => ({
                    year: row.year,
                    earnings: row.earnings || 0,
                    is_projected: row.year > currentYear,
                    editable: true,
                    visible: true
                }));

                setEarningsHistory(mappedEarnings);

                // Persist so the record survives reload and is visible to Show Me The Money.
                // A failure here must not block the upload the user just completed.
                try {
                    const recordToSave = {
                        birthYear: resolvedBirthYear,
                        statementDate: result.person_info?.statement_date || null,
                        rows: mappedEarnings.map((row) => ({
                            year: row.year,
                            earnings: row.earnings,
                            isProjected: row.is_projected
                        }))
                    };
                    stashDevEarnings(isPrimary ? 'spouse1' : 'spouse2', recordToSave);
                    const token = await getAuthToken();
                    if (token) {
                        await saveEarnings(token, isPrimary ? 'spouse1' : 'spouse2', recordToSave);
                    }
                } catch (persistError) {
                    console.error('Could not save earnings record:', persistError);
                }

                // Auto-calculate PIA after upload. Pass mappedEarnings explicitly:
                // calculatePIA() with no argument reads the `earningsHistory` state
                // variable, but setEarningsHistory() above is async, so a bare call
                // here (even delayed) still closes over the pre-upload value and
                // silently computes PIA from the empty/template earnings that were
                // on screen before this upload — same class of bug as the
                // resolvedBirthYear fix just above. Scoped inside this block since
                // there is nothing to calculate when the upload had no rows.
                setTimeout(() => {
                    calculatePIA(mappedEarnings);
                }, 500);
            }

            // Count zeros in top 35 (exclude projected/future years — they are
            // assumptions, not banked earnings, and must not be counted as either
            // earnings years or zero years in the actual record)
            const actualEarnings = result.spreadsheet_data.filter(e => !e.is_projected);
            const zeroCount = countZerosInTop35(
                actualEarnings.map((row) => ({
                    year: row.year,
                    earnings: row.earnings,
                    isProjected: Boolean(row.is_projected)
                }))
            );

            setXmlUploadSuccess(
                `✅ Loaded ${file.name} • ${result.earnings_summary?.total_years || 0} years • ${zeroCount} zeros in top-35`
            );

        } catch (err) {
            setError(`XML Upload Error: ${err.message}`);
            console.error('XML upload error:', err);
        } finally {
            setIsUploadingXML(false);
            // Reset file input
            event.target.value = '';
        }
    };

    // Update earnings for a specific year
    const updateEarnings = (year, value) => {
        const maxForYear = getTaxableMaximum(year);
        const cappedValue = Math.min(parseFloat(value) || 0, maxForYear);

        // Show warning if value was capped
        if (parseFloat(value) > maxForYear) {
            setError(`Earnings for ${year} capped at $${maxForYear.toLocaleString()} (SSA taxable maximum)`);
            setTimeout(() => setError(null), 3000);
        }

        setEarningsHistory(prev =>
            prev.map(e =>
                e.year === year
                    ? { ...e, earnings: cappedValue }
                    : e
            )
        );
    };

    // Bulk import from CSV or text — built but not yet wired to a UI trigger; kept for when that lands
    // eslint-disable-next-line no-unused-vars
    const handleBulkImport = (text) => {
        try {
            const lines = text.trim().split('\n');
            const updates = {};

            lines.forEach(line => {
                const [year, earnings] = line.split(/[,\t]/).map(s => s.trim());
                const y = parseInt(year);
                const e = parseFloat(earnings);

                if (!isNaN(y) && !isNaN(e) && y >= birthYear + 18) {
                    updates[y] = e;
                }
            });

            setEarningsHistory(prev =>
                prev.map(e => ({
                    ...e,
                    earnings: updates[e.year] !== undefined ? updates[e.year] : e.earnings
                }))
            );
        } catch (err) {
            setError('Failed to import earnings. Use format: Year,Earnings (one per line)');
        }
    };

    // Show all years (expand historical)
    const showAllYears = () => {
        setEarningsHistory(prev => prev.map(e => ({ ...e, visible: true })));
    };

    // Format currency
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Count non-zero years (exclude projected/future years — those are
    // assumptions carried forward for planning, not years the user actually
    // has earnings on record)
    const nonZeroYears = earningsHistory.filter(e => e.earnings > 0 && !e.is_projected).length;
    const visibleEarnings = earningsHistory.filter(e => e.visible);

    return (
        <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    💰 PIA Calculator
                </h2>
                <p className="text-gray-600">
                    Calculate your Primary Insurance Amount (PIA) from your earnings history.
                    See the impact of continuing to work vs retiring early.
                </p>
            </div>

            {/* Tabs for Primary and Spouse - LARGER & MORE PROMINENT - Only show spouse tab if married */}
            {isMarried ? (
                <div className="mb-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg">
                    <Tabs>
                        <TabList className="flex gap-3">
                            <Tab
                                active={activeTab === 'primary'}
                                onClick={() => setActiveTab('primary')}
                                className={`px-6 py-3 text-base font-bold rounded-lg transition-all ${activeTab === 'primary'
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <span className="text-xl">👤</span> {primaryLabel}
                                {primaryCalculatedResult && (
                                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-normal">
                                        ✓ Calculated
                                    </span>
                                )}
                            </Tab>
                            <Tab
                                active={activeTab === 'spouse'}
                                onClick={() => setActiveTab('spouse')}
                                className={`px-6 py-3 text-base font-bold rounded-lg transition-all ${activeTab === 'spouse'
                                        ? 'bg-purple-600 text-white shadow-lg'
                                        : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <span className="text-xl">💑</span> {spouseLabel}
                                {spouseCalculatedResult && (
                                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-normal">
                                        ✓ Calculated
                                    </span>
                                )}
                            </Tab>
                        </TabList>
                    </Tabs>
                </div>
            ) : (
                <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">👤</span>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">{primaryLabel}</h3>
                            {primaryCalculatedResult && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                                    ✓ PIA Calculated
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Calculator Content - Renders for BOTH tabs based on activeTab state */}
            {/* Birth Year Input */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Your Birth Year {birthYear < 1937 && <span className="text-red-600 font-bold">(⚠️ Too Early - Must be 1937+)</span>}
                </label>
                <input
                    type="number"
                    min="1937"
                    max="2010"
                    value={birthYear}
                    onChange={(e) => {
                        const year = parseInt(e.target.value) || 1964;
                        // Only allow valid years to be set
                        if (year >= 1937 && year <= 2010) {
                            setBirthYear(year);
                            setError(null);
                        } else {
                            // Show error but don't update state with invalid value
                            setError(`Birth year must be between 1937 and 2010. You entered: ${year}`);
                        }
                    }}
                    onBlur={(e) => {
                        // On blur, if invalid, reset to 1964
                        const year = parseInt(e.target.value);
                        if (!year || year < 1937 || year > 2010) {
                            setBirthYear(1964);
                            setError('Birth year reset to 1964. Please enter a valid year between 1937-2010.');
                            e.target.value = 1964;
                        }
                    }}
                    className={`w-32 px-3 py-2 border-2 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${birthYear < 1937 ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                />
                <p className="mt-2 text-xs text-gray-600">
                    Used to calculate wage indexing (at age 60) and bend points (at age 62). <strong className="text-blue-700">Current: {birthYear}</strong>
                </p>
            </div>

            {/* XML Upload Section */}
            <div className="mb-6 p-6 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                            📄 Upload SSA Earnings Statement (XML)
                        </h3>
                        <p className="text-sm text-gray-600">
                            Upload your XML file from SSA.gov to automatically populate your earnings history
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex-1">
                        <input
                            type="file"
                            accept=".xml"
                            onChange={handleXMLUpload}
                            disabled={isUploadingXML}
                            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </label>
                    <button
                        onClick={resetAllEarnings}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-md transition-colors whitespace-nowrap"
                        title="Clear all earnings data and start fresh"
                    >
                        🗑️ Reset
                    </button>
                </div>

                {isUploadingXML && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                            Processing XML file...
                        </div>
                    </div>
                )}

                {xmlUploadSuccess && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                        <div className="flex items-center gap-2 text-sm text-green-700">
                            <span>✓</span>
                            <span>{xmlUploadSuccess}</span>
                        </div>
                        {statementDate && (
                            <div className="mt-2 text-xs text-green-600">
                                Statement Date: {new Date(statementDate).toLocaleDateString()}
                            </div>
                        )}
                        {personInfo?.name && (
                            <div className="mt-1 text-xs text-green-600">
                                Name: {personInfo.name}
                            </div>
                        )}
                    </div>
                )}

                {/* Detailed XML Download Instructions */}
                <div className="mt-4 p-4 bg-white border border-purple-300 rounded-lg">
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="text-lg">ℹ️</span>
                        How to Download Your XML File from SSA.gov
                    </h4>

                    <div className="text-xs text-gray-700 space-y-3">
                        <p>
                            To find your personal XML file from SSA.gov, you must log in to your "my Social Security" account.
                            This file, which contains your earnings record and benefit estimates, can be downloaded securely through your account.
                        </p>

                        <div className="bg-purple-50 p-3 rounded-md">
                            <p className="font-semibold text-gray-900 mb-2">How to download your XML file:</p>
                            <ol className="list-decimal list-inside space-y-1.5 ml-2">
                                <li>
                                    <strong>Access your account:</strong> Go to the official Social Security Administration website,{' '}
                                    <a href="https://www.ssa.gov/myaccount/" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline font-semibold">
                                        ssa.gov
                                    </a>, and click "Sign In" to your my Social Security account. If you do not have an account, you will need to create one first.
                                </li>
                                <li>
                                    <strong>Find your statement:</strong> Once logged in, navigate to the section that contains your Social Security Statement.
                                </li>
                                <li>
                                    <strong>Download the data:</strong> Look for a link to download your statement data as an XML file. The SSA converts your personal data into the XML format for download.
                                </li>
                                <li>
                                    <strong>Save the file:</strong> The XML file will be downloaded to your device. Be sure to save it in a secure place, as it contains sensitive personal and financial information.
                                </li>
                            </ol>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <span className="text-purple-600">📹</span>
                            <a
                                href="https://rssa.com/videos/rssa-roadmap-client-portal-tutorial/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:text-purple-800 hover:underline font-semibold"
                            >
                                Watch Video Tutorial →
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* PIA Toggle Section */}
            <div className="mb-6 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">
                            {isPrimary ? 'Primary Insurance Amount (PIA)' : 'Second Spouse Insurance Amount (PIA)'}
                        </h3>
                        <p className="text-sm text-gray-600">
                            Toggle between SSA's estimate and your calculated PIA
                        </p>
                    </div>

                    {/* Toggle Switch */}
                    <button
                        onClick={() => setUseCalculatedPIA(!useCalculatedPIA)}
                        disabled={!calculatedResult}
                        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${useCalculatedPIA && calculatedResult
                                ? 'bg-emerald-600'
                                : 'bg-gray-300'
                            } ${!calculatedResult ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${useCalculatedPIA && calculatedResult ? 'translate-x-9' : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* SSA PIA */}
                    <div className={`p-4 bg-white rounded-lg border-2 ${!useCalculatedPIA ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                        }`}>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                            SSA Estimate
                        </div>
                        <input
                            type="number"
                            value={ssaPIA}
                            onChange={(e) => setSsaPIA(parseFloat(e.target.value))}
                            className="text-2xl font-bold text-blue-700 w-full border-b border-gray-300 focus:border-blue-500 outline-none mb-2"
                        />
                        <div className="text-xs text-gray-600">
                            From your SSA.gov account
                        </div>
                    </div>

                    {/* Calculated PIA */}
                    <div className={`p-4 bg-white rounded-lg border-2 ${useCalculatedPIA && calculatedResult ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-200'
                        }`}>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                            Calculated from Earnings
                        </div>
                        <div className="text-2xl font-bold text-emerald-700 mb-2">
                            {calculatedResult ? formatCurrency(calculatedResult.pia) : '—'}
                        </div>
                        <div className="text-xs text-gray-600">
                            {calculatedResult
                                ? `Based on ${calculatedResult.top_35_years.length} years`
                                : 'Calculate below'}
                        </div>
                        {calculatedResult && earningsHistory.some((row) => row.is_projected) && (
                            <div className="text-xs text-emerald-800 mt-2">
                                Includes assumed earnings through {Math.max(
                                    ...earningsHistory.filter((row) => row.is_projected).map((row) => row.year)
                                )}.
                            </div>
                        )}
                    </div>
                </div>

                {/* Difference indicator */}
                {calculatedResult && (
                    <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700">Difference:</span>
                            <span className={`font-bold ${calculatedResult.pia > ssaPIA ? 'text-green-600' : 'text-red-600'
                                }`}>
                                {calculatedResult.pia > ssaPIA ? '+' : ''}
                                {formatCurrency(calculatedResult.pia - ssaPIA)} per month
                            </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                            Lifetime impact (25 years): {formatCurrency((calculatedResult.pia - ssaPIA) * 12 * 25)}
                        </div>
                    </div>
                )}
            </div>

            {/* Earnings History Spreadsheet */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">
                        📊 Earnings History
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={showAllYears}
                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                        >
                            Show All Years
                        </button>
                        <button
                            onClick={calculatePIA}
                            disabled={isCalculating || nonZeroYears < 1}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-semibold rounded-md transition-colors"
                        >
                            {isCalculating ? 'Calculating...' : 'Calculate PIA'}
                        </button>
                        {calculatedResult && (
                            <button
                                onClick={createWhatIfScenario}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors"
                            >
                                🔮 Create What-If Scenario
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="flex gap-4 mb-4 text-sm">
                    <div className="px-3 py-2 bg-blue-50 rounded-md">
                        <span className="font-semibold text-blue-700">{nonZeroYears}</span> years with earnings
                    </div>
                    <div className="px-3 py-2 bg-amber-50 rounded-md">
                        <span className="font-semibold text-amber-700">{countZerosInTop35(earningsHistory)}</span> zero years in top 35
                    </div>
                </div>

                {/* Earnings Table */}
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-24">
                                        Year
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                        Earnings
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">
                                        Type
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {visibleEarnings.map((record) => (
                                    <tr
                                        key={record.year}
                                        className={`hover:bg-gray-50 ${record.is_projected ? 'bg-green-50' : ''
                                            }`}
                                    >
                                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                            {record.year}
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                min="0"
                                                step="1000"
                                                value={record.earnings}
                                                onChange={(e) => updateEarnings(record.year, e.target.value)}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                                placeholder="0"
                                                title={`SSA taxable maximum for ${record.year}: $${{
                                                    2025: 176100, 2024: 168600, 2023: 160200, 2022: 147000, 2021: 142800,
                                                    2020: 137700, 2019: 132900, 2018: 128400, 2017: 127200, 2016: 118500,
                                                    2015: 118500, 2014: 117000, 2013: 113700, 2012: 110100, 2011: 106800,
                                                    2010: 106800, 2009: 106800, 2008: 102000, 2007: 97500, 2006: 94200,
                                                    2005: 90000, 2004: 87900, 2003: 87000, 2002: 84900, 2001: 80400,
                                                    2000: 76200, 1999: 72600, 1998: 68400, 1997: 65400, 1996: 62700,
                                                    1995: 61200, 1994: 60600, 1993: 57600, 1992: 55500, 1991: 53400,
                                                    1990: 51300, 1989: 48000, 1988: 45000, 1987: 43800, 1986: 42000,
                                                    1985: 39600, 1984: 37800, 1983: 35700, 1982: 32400, 1981: 29700,
                                                    1980: 25900
                                                }[record.year] || 176100}.toLocaleString()}`}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-xs">
                                            {record.is_projected ? (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                                                    Projected
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                                                    Historical
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Help text */}
                <div className="mt-3 text-xs text-gray-600">
                    💡 <strong>Tip:</strong> Green rows are projected future earnings. Edit these to see how continuing to work affects your PIA.
                </div>
            </div>

            {/* Calculation Results */}
            {calculatedResult && (
                <div className="mb-6 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                        📈 Calculation Details
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="p-3 bg-white rounded-lg">
                            <div className="text-xs text-gray-500 uppercase mb-1">AIME</div>
                            <div className="text-lg font-bold text-emerald-700">
                                {formatCurrency(calculatedResult.aime)}
                            </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <div className="text-xs text-gray-500 uppercase mb-1">PIA</div>
                            <div className="text-lg font-bold text-emerald-700">
                                {formatCurrency(calculatedResult.pia)}
                            </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <div className="text-xs text-gray-500 uppercase mb-1">Zero Years</div>
                            <div className="text-lg font-bold text-amber-700">
                                {calculatedResult.years_of_zero_in_top_35}
                            </div>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <div className="text-xs text-gray-500 uppercase mb-1">PIA Year</div>
                            <div className="text-lg font-bold text-blue-700">
                                {calculatedResult.pia_year}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-white rounded-lg text-sm">
                        <div className="font-semibold text-gray-700 mb-2">Bend Point Calculation:</div>
                        <div className="space-y-1 text-gray-600">
                            <div>First bracket (90%): {formatCurrency(calculatedResult.calculation_details.first_bracket)}</div>
                            <div>Second bracket (32%): {formatCurrency(calculatedResult.calculation_details.second_bracket)}</div>
                            <div>Third bracket (15%): {formatCurrency(calculatedResult.calculation_details.third_bracket)}</div>
                            <div className="pt-2 border-t border-gray-200 font-semibold text-gray-900">
                                Total PIA: {formatCurrency(calculatedResult.pia)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-red-800">
                        <strong>Error:</strong> {error}
                    </div>
                </div>
            )}

            {/* What-If Comparison Section */}
            {whatIfResult && calculatedResult && (
                <div className="mt-6 p-6 bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-300 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-gray-900">🔮 What-If Scenario Comparison</h3>
                        <button
                            onClick={closeWhatIf}
                            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                        >
                            ✕ Close
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {/* Original Scenario */}
                        <div className="p-4 bg-white border-2 border-gray-300 rounded-lg">
                            <div className="text-sm font-semibold text-gray-600 mb-2">Current Plan</div>
                            <div className="text-3xl font-bold text-gray-900 mb-3">
                                {formatCurrency(calculatedResult.pia)}
                                <span className="text-sm font-normal text-gray-600">/month</span>
                            </div>
                            <div className="space-y-1 text-sm text-gray-700">
                                <div>{calculatedResult.top_35_years.length} years of earnings</div>
                                <div className="text-amber-600 font-semibold">
                                    {35 - calculatedResult.top_35_years.filter(y => y.indexed_earnings > 0).length} zeros in top 35
                                </div>
                            </div>
                        </div>

                        {/* What-If Scenario */}
                        <div className="p-4 bg-white border-2 border-blue-500 rounded-lg">
                            <div className="text-sm font-semibold text-blue-600 mb-2">What-If Scenario</div>
                            <div className="text-3xl font-bold text-blue-700 mb-3">
                                {formatCurrency(whatIfResult.pia)}
                                <span className="text-sm font-normal text-gray-600">/month</span>
                            </div>
                            <div className="space-y-1 text-sm text-gray-700">
                                <div>{whatIfResult.top_35_years.length} years of earnings</div>
                                <div className="text-amber-600 font-semibold">
                                    {35 - whatIfResult.top_35_years.filter(y => y.indexed_earnings > 0).length} zeros in top 35
                                </div>
                            </div>
                        </div>

                        {/* Difference */}
                        <div className={`p-4 rounded-lg ${whatIfResult.pia > calculatedResult.pia
                                ? 'bg-green-50 border-2 border-green-500'
                                : whatIfResult.pia < calculatedResult.pia
                                    ? 'bg-red-50 border-2 border-red-500'
                                    : 'bg-gray-50 border-2 border-gray-400'
                            }`}>
                            <div className="text-sm font-semibold text-gray-600 mb-2">Difference</div>
                            <div className={`text-3xl font-bold mb-3 ${whatIfResult.pia > calculatedResult.pia ? 'text-green-700' :
                                    whatIfResult.pia < calculatedResult.pia ? 'text-red-700' : 'text-gray-700'
                                }`}>
                                {whatIfResult.pia > calculatedResult.pia ? '+' : ''}
                                {formatCurrency(whatIfResult.pia - calculatedResult.pia)}
                                <span className="text-sm font-normal text-gray-600">/month</span>
                            </div>
                            <div className="space-y-1 text-sm text-gray-700">
                                <div className="font-semibold">Lifetime Impact (25 years):</div>
                                <div className={`text-lg font-bold ${whatIfResult.pia > calculatedResult.pia ? 'text-green-700' : 'text-red-700'
                                    }`}>
                                    {whatIfResult.pia > calculatedResult.pia ? '+' : ''}
                                    {formatCurrency((whatIfResult.pia - calculatedResult.pia) * 12 * 25)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Message */}
                    {whatIfResult.pia > calculatedResult.pia && (
                        <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
                            <p className="text-green-900 font-semibold">
                                ✅ This scenario increases your monthly benefit by {formatCurrency(whatIfResult.pia - calculatedResult.pia)},
                                adding {formatCurrency((whatIfResult.pia - calculatedResult.pia) * 12 * 25)} over 25 years of retirement!
                            </p>
                        </div>
                    )}
                    {whatIfResult.pia < calculatedResult.pia && (
                        <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
                            <p className="text-red-900 font-semibold">
                                ⚠️ This scenario decreases your monthly benefit by {formatCurrency(calculatedResult.pia - whatIfResult.pia)}.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* What-If Modal */}
            {showWhatIfModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-gray-900">🔮 Edit What-If Scenario</h3>
                                <button
                                    onClick={() => setShowWhatIfModal(false)}
                                    className="text-gray-500 hover:text-gray-700 text-2xl"
                                >
                                    ✕
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">
                                Modify earnings below to see how changes affect your PIA. Focus on future years or fill in gaps.
                            </p>
                        </div>

                        <div className="p-6">
                            {/* Earnings Edit Table */}
                            <div className="border border-gray-300 rounded-lg overflow-hidden mb-6">
                                <div className="max-h-96 overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase w-24">
                                                    Year
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                                                    Earnings
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase w-32">
                                                    Type
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {whatIfEarnings.filter(e => e.visible).map((record) => (
                                                <tr
                                                    key={record.year}
                                                    className={`${record.is_projected ? 'bg-green-50' :
                                                            record.earnings === 0 ? 'bg-red-50' : ''
                                                        } hover:bg-blue-50`}
                                                >
                                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                        {record.year}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1000"
                                                            value={record.earnings}
                                                            onChange={(e) => updateWhatIfEarnings(record.year, e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                            title={`SSA taxable maximum for ${record.year}: $${{
                                                                2025: 176100, 2024: 168600, 2023: 160200, 2022: 147000, 2021: 142800,
                                                                2020: 137700, 2019: 132900, 2018: 128400, 2017: 127200, 2016: 118500,
                                                                2015: 118500, 2014: 117000, 2013: 113700, 2012: 110100, 2011: 106800,
                                                                2010: 106800, 2009: 106800, 2008: 102000, 2007: 97500, 2006: 94200,
                                                                2005: 90000, 2004: 87900, 2003: 87000, 2002: 84900, 2001: 80400,
                                                                2000: 76200, 1999: 72600, 1998: 68400, 1997: 65400, 1996: 62700,
                                                                1995: 61200, 1994: 60600, 1993: 57600, 1992: 55500, 1991: 53400,
                                                                1990: 51300, 1989: 48000, 1988: 45000, 1987: 43800, 1986: 42000,
                                                                1985: 39600, 1984: 37800, 1983: 35700, 1982: 32400, 1981: 29700,
                                                                1980: 25900
                                                            }[record.year] || 176100}.toLocaleString()}`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">
                                                        {record.is_projected ? (
                                                            <span className="px-2 py-1 bg-green-200 text-green-800 rounded-full text-xs font-medium">
                                                                Projected
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs font-medium">
                                                                Historical
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowWhatIfModal(false)}
                                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-md"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={calculateWhatIfPIA}
                                    disabled={isCalculating}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-md"
                                >
                                    {isCalculating ? 'Calculating...' : 'Calculate What-If PIA'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Double Hit Educational Block */}
            {/*
                Three states, ordered by how much we actually know:

                1. nonZeroYears >= 35 — provably safe regardless of anything else.
                   A $0 row can never outrank a positive one for a top-35 slot, so
                   35+ real (non-projected) years guarantees no zero can enter.

                2. calculatedResult exists — we know the REAL zero-year count
                   (calculatedResult.years_of_zero_in_top_35) rather than guessing.
                   This matters because the client-side estimate below
                   (35 - nonZeroYears) assumes every "missing" year is a zero, but
                   the editable table's projected/carried-forward rows are usually
                   positive — they can fill some or all of that gap. Verified
                   live: a 30-real-year record with 5 real zero years produced
                   only 1 zero in the actual top 35, not the estimate's 5, because
                   4 carried-forward projected years filled the rest.

                3. Neither — no verified number exists yet. Say so qualitatively
                   rather than asserting an estimate that live testing showed can
                   overstate the gap by several years.
            */}
            <div className="mt-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg">
                <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    ⚠️ {tooltips.pia.doubleHit.medium.title}
                </h4>
                <div className="space-y-3 text-sm text-gray-800">
                    <p className="leading-relaxed">
                        {tooltips.pia.doubleHit.compact.text}
                    </p>
                    <div className="p-4 bg-white rounded-lg border border-yellow-200">
                        <p className="font-semibold text-gray-900 mb-2">Why Your PIA Changes When You Stop Working:</p>
                        <ol className="list-decimal list-inside space-y-2 text-gray-700">
                            <li><strong>Early Filing Penalty (~30%)</strong> – Claiming at 62 reduces your check for life.</li>
                            {(() => {
                                const provenZeroFree = nonZeroYears >= 35;
                                const calculatedZeroYears = calculatedResult ? calculatedResult.years_of_zero_in_top_35 : null;
                                const calculatedZeroFree = calculatedZeroYears === 0;

                                if (provenZeroFree || calculatedZeroFree) {
                                    return (
                                        <li>
                                            <strong className="text-green-700">Earnings Gap Penalty – doesn't apply to you.</strong>{' '}
                                            {provenZeroFree ? (
                                                <>You already have {nonZeroYears} real earning years on record, so stopping work
                                                    now can't add zero years to your 35-year average.</>
                                            ) : (
                                                <>Your calculated PIA already shows zero zero-years in your top 35 — your current
                                                    and projected earnings fill it completely.</>
                                            )}
                                        </li>
                                    );
                                }

                                if (calculatedZeroYears !== null) {
                                    return (
                                        <li>
                                            <strong>Earnings Gap Penalty</strong> – Your calculated top-35 average currently
                                            includes {calculatedZeroYears} zero or low year{calculatedZeroYears === 1 ? '' : 's'}.
                                            Replacing them with real earnings would raise your PIA.
                                        </li>
                                    );
                                }

                                return (
                                    <li>
                                        <strong>Earnings Gap Penalty</strong> – You have {nonZeroYears} real earning
                                        year{nonZeroYears === 1 ? '' : 's'} on record. Calculate your PIA to see exactly how
                                        many zero or low years currently count toward your 35-year average.
                                    </li>
                                );
                            })()}
                        </ol>
                        {(nonZeroYears >= 35 || (calculatedResult && calculatedResult.years_of_zero_in_top_35 === 0)) ? (
                            <p className="mt-3 text-green-700 font-semibold">
                                💡 You'd still take the ~30% early-filing cut if you claim at 62 — but the earnings-gap
                                penalty is already avoided. Continuing to work can still raise your PIA if you out-earn
                                your lowest counted year.
                            </p>
                        ) : (
                            <p className="mt-3 text-green-700 font-semibold">
                                💡 Keep earning (even part-time) and you replace low/zero years, raising your PIA for life.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Educational Info */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                <h4 className="font-semibold mb-2">📚 How PIA is Calculated</h4>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li>Your earnings history is indexed to wage levels at age 60</li>
                    <li>The top 35 years of indexed earnings are averaged (AIME)</li>
                    <li>PIA is calculated using bend points with 90%, 32%, and 15% factors</li>
                    <li>Years with zero earnings count against your top 35</li>
                    <li>Working longer can replace low-earning years and increase your PIA</li>
                </ul>
            </div>
        </div>
    );
};

export default PIACalculator;
