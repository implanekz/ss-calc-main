import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { useUser } from '../contexts/UserContext';
import { buildLongevitySummary } from '../calculators/longevity/summary';
import { buildLifeExpectancyPresentation } from '../calculators/longevity/presentation';
import { attainedWholeAge } from '../calculators/longevity/dateMath';
import {
    emptyLongevityProfile,
    migrateLifeExpectancyPreferences
} from '../calculators/longevity/preferences';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const asOfDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const HealthSelector = ({ health, setHealth }) => (
    <div className="space-y-3">
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Smoking Status</label>
            <div className="flex gap-1">
                {[{ key: 'never', label: 'Never Smoked' }, { key: 'former', label: 'Former' }, { key: 'current', label: 'Current' }].map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => setHealth({ ...health, smoking: opt.key })}
                        className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg border transition-all ${health.smoking === opt.key ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Education</label>
            <div className="flex gap-1">
                {[{ key: 'college', label: 'College+' }, { key: 'some', label: 'Some College' }, { key: 'high_school', label: 'High School−' }].map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => setHealth({ ...health, education: opt.key })}
                        className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg border transition-all ${health.education === opt.key ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Health</label>
            <div className="flex gap-1">
                {[{ key: 'excellent', label: 'Excellent' }, { key: 'good', label: 'Good' }, { key: 'fair', label: 'Fair or Poor' }].map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => setHealth({ ...health, health: opt.key })}
                        className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg border transition-all ${health.health === opt.key ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    </div>
);

const LifeExpectancyCalculator = () => {
    const { preferences, updatePreferences, user, profile, partners } = useUser();
    const primaryPersonId = profile?.id || user?.id || null;
    const partnerPersonId = partners?.[0]?.id || null;

    const [calcType, setCalcType] = useState('individual');
    const [profilesByPersonId, setProfilesByPersonId] = useState({});
    const [currentView, setCurrentView] = useState('graph');
    const [hasLoadedPrefs, setHasLoadedPrefs] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef(null);

    useEffect(() => {
        if (hasLoadedPrefs) {
            return;
        }
        const migrated = migrateLifeExpectancyPreferences({
            saved: preferences?.lifeExpectancy,
            primaryPersonId,
            partnerPersonId
        });
        setCalcType(migrated.calcType);
        setProfilesByPersonId(migrated.profilesByPersonId);
        setHasLoadedPrefs(true);
    }, [preferences, hasLoadedPrefs, primaryPersonId, partnerPersonId]);

    const updatePersonProfile = (personId, patch) => {
        if (!personId) {
            return;
        }
        setProfilesByPersonId((current) => ({
            ...current,
            [personId]: { ...emptyLongevityProfile(), ...current[personId], ...patch }
        }));
    };

    const saveSettings = useCallback(() => {
        if (!user || !updatePreferences) {
            return;
        }
        setIsSaving(true);
        updatePreferences({
            lifeExpectancy: {
                schemaVersion: 2,
                calcType,
                profilesByPersonId
            }
        })
            .then(() => setIsSaving(false))
            .catch((err) => {
                console.error('Failed to save life expectancy settings:', err);
                setIsSaving(false);
            });
    }, [user, updatePreferences, calcType, profilesByPersonId]);

    useEffect(() => {
        if (!hasLoadedPrefs) {
            return undefined;
        }
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(saveSettings, 1000);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [calcType, profilesByPersonId, hasLoadedPrefs, saveSettings]);

    const today = asOfDate();
    const people = useMemo(() => {
        const records = [];
        if (primaryPersonId) {
            records.push({
                personId: primaryPersonId,
                name: profile?.first_name || 'You',
                birthDate: profile?.date_of_birth || null,
                sex: profilesByPersonId[primaryPersonId]?.sex || null,
                profile: profilesByPersonId[primaryPersonId] || emptyLongevityProfile()
            });
        }
        if (calcType === 'couple' && partnerPersonId) {
            records.push({
                personId: partnerPersonId,
                name: partners[0]?.first_name || 'Spouse',
                birthDate: partners[0]?.date_of_birth || null,
                sex: profilesByPersonId[partnerPersonId]?.sex || null,
                profile: profilesByPersonId[partnerPersonId] || emptyLongevityProfile()
            });
        }
        return records;
    }, [calcType, partnerPersonId, partners, primaryPersonId, profile, profilesByPersonId]);

    const summary = useMemo(
        () => buildLongevitySummary({ people, asOfDate: today }),
        [people, today]
    );
    const presentation = useMemo(() => buildLifeExpectancyPresentation(summary), [summary]);
    const primary = people[0];
    const spouse = people[1];
    const primaryAge = primary?.birthDate ? attainedWholeAge(primary.birthDate, today) : null;
    const spouseAge = spouse?.birthDate ? attainedWholeAge(spouse.birthDate, today) : null;

    const chartData = useMemo(() => {
        if (presentation.chartRows.length === 0) {
            return { labels: [], datasets: [] };
        }
        if (people.length === 1) {
            return {
                labels: presentation.chartRows.map((row) => row.age),
                datasets: [{
                    label: primary?.sex === 'female' ? 'Female' : 'Male',
                    data: presentation.chartRows.map((row) => row.survival * 100),
                    borderColor: primary?.sex === 'female' ? '#e8735a' : '#4a90d9',
                    backgroundColor: primary?.sex === 'female' ? 'rgba(232, 115, 90, 0.1)' : 'rgba(74, 144, 217, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            };
        }
        return {
            labels: presentation.chartRows.map((row) => row.year),
            datasets: [
                {
                    label: primary?.name || 'You',
                    data: presentation.chartRows.map((row) => (row[`${primary.personId}Survival`] || 0) * 100),
                    borderColor: '#4a90d9',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: spouse?.name || 'Spouse',
                    data: presentation.chartRows.map((row) => (row[`${spouse.personId}Survival`] || 0) * 100),
                    borderColor: '#e8735a',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: 'Either partner',
                    data: presentation.chartRows.map((row) => row.eitherAlive * 100),
                    borderColor: '#f5a623',
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0
                }
            ]
        };
    }, [people.length, presentation.chartRows, primary, spouse]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                }
            }
        },
        scales: {
            x: { title: { display: true, text: people.length > 1 ? 'Year' : 'Age' } },
            y: { title: { display: true, text: 'Probability of Survival (%)' }, min: 0, max: 100 }
        }
    };

    const GenderSelector = ({ personId, label }) => (
        <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
            <div className="flex gap-2">
                {['male', 'female'].map((sex) => (
                    <button
                        key={sex}
                        type="button"
                        onClick={() => updatePersonProfile(personId, { sex })}
                        className={`flex-1 py-3 px-4 font-semibold rounded-xl border-2 transition-all ${profilesByPersonId[personId]?.sex === sex ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}
                    >
                        {sex === 'male' ? 'Male' : 'Female'}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-600 to-purple-700 p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
                <div className="text-center text-white mb-6">
                    <h1 className="text-3xl md:text-4xl font-bold mb-2">Life Expectancy Reality Check</h1>
                    <p className="text-lg opacity-90">The longer you live, the longer you are expected to live</p>
                    {user && (
                        <div className="mt-2 text-sm opacity-75">
                            {isSaving ? 'Saving...' : 'Settings saved'}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Calculation Type</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setCalcType('individual')}
                                    className={`flex-1 py-3 px-4 font-semibold rounded-xl border-2 transition-all ${calcType === 'individual' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}>
                                    Individual
                                </button>
                                <button type="button" onClick={() => setCalcType('couple')}
                                    className={`flex-1 py-3 px-4 font-semibold rounded-xl border-2 transition-all ${calcType === 'couple' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}>
                                    Married Couple
                                </button>
                            </div>
                        </div>
                        {primaryPersonId ? <GenderSelector personId={primaryPersonId} label="Your sex" /> : null}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Your current age</label>
                            <div className="text-center text-4xl font-bold text-primary-600 mt-2">
                                {primaryAge == null ? 'Add a date of birth in your profile' : primaryAge}
                            </div>
                        </div>
                        {calcType === 'couple' && partnerPersonId ? (
                            <GenderSelector personId={partnerPersonId} label="Spouse sex" />
                        ) : null}
                    </div>

                    {calcType === 'couple' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pt-4 border-t border-gray-200">
                            <div></div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Spouse current age</label>
                                <div className="text-center text-4xl font-bold text-primary-600 mt-2">
                                    {spouseAge == null ? 'Add a spouse date of birth' : spouseAge}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-4 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="font-bold text-gray-800">Your Health Profile</h3>
                            <span className="text-xs font-semibold bg-gradient-to-r from-primary-600 to-purple-600 text-white px-2 py-0.5 rounded-full">{presentation.estimateLabel}</span>
                        </div>
                        <div className={`grid gap-6 ${calcType === 'couple' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
                            {primaryPersonId && (
                                <div>
                                    {calcType === 'couple' && <div className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 pb-1 border-b-2 border-primary-600">You</div>}
                                    <HealthSelector
                                        health={profilesByPersonId[primaryPersonId] || emptyLongevityProfile()}
                                        setHealth={(next) => updatePersonProfile(primaryPersonId, next)}
                                    />
                                </div>
                            )}
                            {calcType === 'couple' && partnerPersonId && (
                                <div>
                                    <div className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 pb-1 border-b-2 border-primary-600">Spouse</div>
                                    <HealthSelector
                                        health={profilesByPersonId[partnerPersonId] || emptyLongevityProfile()}
                                        setHealth={(next) => updatePersonProfile(partnerPersonId, next)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {presentation.cards.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-900">
                            Add a date of birth and choose male or female to see SSA population longevity estimates.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {presentation.cards.map((card) => (
                                <div key={card.probability} className="bg-blue-50 rounded-xl p-4 text-center" title={card.tooltip}>
                                    <div className="text-sm font-semibold text-gray-600 mb-1">{card.probability}% chance of living to at least</div>
                                    <div className="text-4xl font-bold text-gray-900">{card.age}</div>
                                    <div className="text-sm text-gray-600">years old</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Survival probability curves</h3>
                        <div className="flex bg-gray-100 rounded-lg overflow-hidden">
                            <button type="button" onClick={() => setCurrentView('graph')}
                                className={`px-4 py-2 text-sm font-semibold ${currentView === 'graph' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white' : 'text-gray-600'}`}>
                                Graph
                            </button>
                            <button type="button" onClick={() => setCurrentView('table')}
                                className={`px-4 py-2 text-sm font-semibold ${currentView === 'table' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white' : 'text-gray-600'}`}>
                                Table
                            </button>
                        </div>
                    </div>

                    {currentView === 'graph' && (
                        <div className="bg-gray-50 rounded-xl p-4" style={{ height: '400px' }}>
                            <Line data={chartData} options={chartOptions} />
                        </div>
                    )}

                    {currentView === 'table' && (
                        <div className="bg-gray-50 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gradient-to-r from-primary-600 to-purple-600 text-white sticky top-0">
                                    <tr>
                                        <th className="py-3 px-4 text-left font-semibold">{people.length > 1 ? 'Year' : 'Age'}</th>
                                        {chartData.datasets?.map((ds, i) => (
                                            <th key={i} className="py-3 px-4 text-center font-semibold">{ds.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {chartData.labels?.map((label, idx) => (
                                        <tr key={label} className="border-b border-gray-200">
                                            <td className="py-2 px-4 font-semibold">{label}</td>
                                            {chartData.datasets?.map((ds, i) => (
                                                <td key={i} className="py-2 px-4 text-center">{ds.data[idx]?.toFixed(1)}%</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className="text-xs text-gray-500 mt-4 text-center">
                        {presentation.sourceDisclosure}{' '}
                        <a className="underline" href="https://www.ssa.gov/oact/STATS/table4c6.html">SSA 2023 period life table</a>
                        {' · '}
                        <a className="underline" href="https://www.cdc.gov/nchs/linked-data/mortality-files/index.html">NCHS Linked Mortality Files</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LifeExpectancyCalculator;
