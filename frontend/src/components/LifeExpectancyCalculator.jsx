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
import { useDevMode } from '../contexts/DevModeContext';
import { buildLongevitySummary } from '../calculators/longevity/summary';
import { buildLifeExpectancyPresentation } from '../calculators/longevity/presentation';
import { attainedWholeAge } from '../calculators/longevity/dateMath';
import { getProductionNhisArtifact } from '../calculators/longevity/nhisArtifact';
import {
    hasPartnerBirthDate,
    resolveBirthDate,
    resolveFirstName,
    resolvePersonId
} from '../calculators/longevity/identity';
import {
    emptyLongevityProfile,
    migrateLifeExpectancyPreferences
} from '../calculators/longevity/preferences';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const startOfLocalDay = (value) => {
    const source = value instanceof Date ? value : new Date();
    return new Date(source.getFullYear(), source.getMonth(), source.getDate());
};

const isSupportedSex = (sex) => sex === 'male' || sex === 'female';
const AGE_SLIDER_MIN = 55;
const AGE_SLIDER_MAX = 100;

const clampSliderAge = (age) => Math.min(AGE_SLIDER_MAX, Math.max(AGE_SLIDER_MIN, age));

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

const AgeSlider = ({ name, age, onChange, possessiveLabel }) => (
    <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
            {name ? `${name}'s current age` : possessiveLabel}
        </label>
        {age == null ? (
            <div className="text-center mt-2">
                <a href="/settings" className="text-lg font-semibold text-primary-600 underline">
                    Add a date of birth in your profile.
                </a>
            </div>
        ) : (
            <div className="text-center mt-2">
                <input
                    type="range"
                    min={AGE_SLIDER_MIN}
                    max={AGE_SLIDER_MAX}
                    value={age}
                    aria-label={name ? `${name}'s current age` : possessiveLabel}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className="w-full h-2 bg-gradient-to-r from-primary-400 to-purple-400 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-4xl font-bold text-primary-600 mt-2">{age}</div>
            </div>
        )}
    </div>
);

const LifeExpectancyCalculator = ({ asOfDate: asOfDateProp } = {}) => {
    const { preferences, updatePreferences, user, profile: realProfile, partners: realPartners } = useUser();
    const { isDevMode, devProfile, devPartners } = useDevMode();
    const profile = isDevMode ? devProfile : realProfile;
    const partners = isDevMode ? (devPartners || []) : (realPartners || []);

    const primaryPersonId = resolvePersonId(profile, user?.id) || (profile || user ? 'primary' : null);
    const partnerPersonId = resolvePersonId(partners?.[0], hasPartnerBirthDate(partners) ? 'partner' : null);
    const savedCalcType = preferences?.lifeExpectancy?.calcType;

    const [calcType, setCalcType] = useState(null);
    const [profilesByPersonId, setProfilesByPersonId] = useState({});
    const [currentView, setCurrentView] = useState('graph');
    const [hasLoadedPrefs, setHasLoadedPrefs] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [sliderAgesByPersonId, setSliderAgesByPersonId] = useState({});
    const saveTimeoutRef = useRef(null);
    const sliderBirthDatesRef = useRef({});

    useEffect(() => {
        if (hasLoadedPrefs) {
            return;
        }
        const migrated = migrateLifeExpectancyPreferences({
            saved: preferences?.lifeExpectancy,
            primaryPersonId,
            partnerPersonId
        });
        setCalcType(
            savedCalcType === 'couple' || savedCalcType === 'individual'
                ? savedCalcType
                : null
        );
        setProfilesByPersonId(migrated.profilesByPersonId);
        setHasLoadedPrefs(true);
    }, [preferences, hasLoadedPrefs, primaryPersonId, partnerPersonId, savedCalcType]);

    const effectiveCalcType = calcType
        || (hasPartnerBirthDate(partners) ? 'couple' : 'individual');

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
                calcType: effectiveCalcType,
                profilesByPersonId
            }
        })
            .then(() => setIsSaving(false))
            .catch((err) => {
                console.error('Failed to save life expectancy settings:', err);
                setIsSaving(false);
            });
    }, [user, updatePreferences, effectiveCalcType, profilesByPersonId]);

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
    }, [effectiveCalcType, profilesByPersonId, hasLoadedPrefs, saveSettings]);

    const today = useMemo(() => startOfLocalDay(asOfDateProp), [asOfDateProp]);
    const modelArtifact = useMemo(() => getProductionNhisArtifact(), []);

    const sliderAgeFor = useCallback((personId, birthDate) => {
        if (!birthDate) {
            return null;
        }
        if (sliderBirthDatesRef.current[personId] === birthDate && Number.isFinite(sliderAgesByPersonId[personId])) {
            return sliderAgesByPersonId[personId];
        }
        return clampSliderAge(attainedWholeAge(birthDate, today));
    }, [sliderAgesByPersonId, today]);

    const setSliderAge = (personId, birthDate, age) => {
        sliderBirthDatesRef.current[personId] = birthDate;
        setSliderAgesByPersonId((current) => ({ ...current, [personId]: age }));
    };

    const people = useMemo(() => {
        const records = [];
        if (primaryPersonId) {
            const birthDate = resolveBirthDate(profile);
            records.push({
                personId: primaryPersonId,
                name: resolveFirstName(profile, 'You'),
                birthDate,
                currentAge: sliderAgeFor(primaryPersonId, birthDate),
                sex: profilesByPersonId[primaryPersonId]?.sex || null,
                profile: profilesByPersonId[primaryPersonId] || emptyLongevityProfile()
            });
        }
        if (effectiveCalcType === 'couple' && (partnerPersonId || partners?.[0])) {
            const spouseId = partnerPersonId || 'partner';
            const birthDate = resolveBirthDate(partners[0]);
            records.push({
                personId: spouseId,
                name: resolveFirstName(partners[0], 'Spouse'),
                birthDate,
                currentAge: sliderAgeFor(spouseId, birthDate),
                sex: profilesByPersonId[spouseId]?.sex || null,
                profile: profilesByPersonId[spouseId] || emptyLongevityProfile()
            });
        }
        return records;
    }, [effectiveCalcType, partnerPersonId, partners, primaryPersonId, profile, profilesByPersonId, sliderAgeFor]);

    const summary = useMemo(
        () => buildLongevitySummary({ people, asOfDate: today, modelArtifact }),
        [people, today, modelArtifact]
    );
    const presentation = useMemo(() => buildLifeExpectancyPresentation(summary), [summary]);
    const primary = people[0];
    const spouse = people[1];
    const primaryAge = sliderAgeFor(primaryPersonId, primary?.birthDate);
    const spouseAge = sliderAgeFor(spouse?.personId, spouse?.birthDate);

    const primarySexReady = isSupportedSex(primary?.sex);
    const spouseSexReady = effectiveCalcType !== 'couple' || isSupportedSex(spouse?.sex);
    const canEstimate = Boolean(
        primary?.birthDate
        && primarySexReady
        && (effectiveCalcType !== 'couple' || (spouse?.birthDate && spouseSexReady))
    );

    const readinessMessage = (() => {
        if (canEstimate) {
            return null;
        }
        if (!primary?.birthDate) {
            return 'Add a date of birth in your profile to see SSA population longevity estimates.';
        }
        if (!primarySexReady || (effectiveCalcType === 'couple' && spouse?.birthDate && !spouseSexReady)) {
            return 'Choose male or female to see SSA population longevity estimates.';
        }
        if (effectiveCalcType === 'couple' && !spouse?.birthDate) {
            return 'Complete both profiles to estimate how long at least one of you may live.';
        }
        return 'Choose male or female to see SSA population longevity estimates.';
    })();

    const emptyGraphMessage = (() => {
        if (presentation.chartRows.length > 0) {
            return null;
        }
        if (!primary?.birthDate) {
            return 'Add a date of birth in your profile, then choose male or female. You will see SSA 75%, 50%, and 25% ages of living to at least those birthdays. After you answer smoking, education, and health, those ages can be personalized.';
        }
        if (!primarySexReady || (effectiveCalcType === 'couple' && spouse && !spouseSexReady)) {
            return 'Choose male or female to see SSA 75%, 50%, and 25% ages of living to at least those birthdays. After you answer smoking, education, and health, those ages can be personalized.';
        }
        if (effectiveCalcType === 'couple' && !spouse?.birthDate) {
            return 'Add a spouse date of birth to see household 75%, 50%, and 25% years when at least one of you is still alive. After you answer smoking, education, and health, those ages can be personalized.';
        }
        return 'SSA 75%, 50%, and 25% ages will appear here once this profile can be calculated.';
    })();

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
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Calculation Type</label>
                        <div className="flex gap-2 max-w-md">
                            <button type="button" onClick={() => setCalcType('individual')}
                                className={`flex-1 py-3 px-4 font-semibold rounded-xl border-2 transition-all ${effectiveCalcType === 'individual' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}>
                                Individual
                            </button>
                            <button type="button" onClick={() => setCalcType('couple')}
                                className={`flex-1 py-3 px-4 font-semibold rounded-xl border-2 transition-all ${effectiveCalcType === 'couple' ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'}`}>
                                Married Couple
                            </button>
                        </div>
                    </div>

                    <div className={`grid gap-6 mb-6 ${effectiveCalcType === 'couple' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                        <div className="space-y-4">
                            {effectiveCalcType === 'couple' && primary?.name ? (
                                <div className="text-xs font-bold text-primary-600 uppercase tracking-wider pb-1 border-b-2 border-primary-600">
                                    {primary.name}
                                </div>
                            ) : null}
                            {primaryPersonId ? (
                                <GenderSelector
                                    personId={primaryPersonId}
                                    label={primary?.name && primary.name !== 'You' ? `${primary.name}'s gender` : 'Your gender'}
                                />
                            ) : null}
                            <AgeSlider
                                name={primary?.name === 'You' ? null : primary?.name}
                                age={primaryAge}
                                possessiveLabel="Your current age"
                                onChange={(age) => setSliderAge(primaryPersonId, primary?.birthDate, age)}
                            />
                        </div>
                        {effectiveCalcType === 'couple' ? (
                            <div className="space-y-4">
                                {spouse?.name ? (
                                    <div className="text-xs font-bold text-primary-600 uppercase tracking-wider pb-1 border-b-2 border-primary-600">
                                        {spouse.name}
                                    </div>
                                ) : null}
                                {partnerPersonId || partners?.[0] ? (
                                    <GenderSelector
                                        personId={partnerPersonId || 'partner'}
                                        label={spouse?.name && spouse.name !== 'Spouse' ? `${spouse.name}'s gender` : 'Spouse gender'}
                                    />
                                ) : (
                                    <p className="text-sm text-gray-600">Add a spouse in your profile to estimate how long at least one of you may live.</p>
                                )}
                                <AgeSlider
                                    name={spouse?.name === 'Spouse' ? null : spouse?.name}
                                    age={spouseAge}
                                    possessiveLabel="Spouse current age"
                                    onChange={(age) => setSliderAge(spouse?.personId, spouse?.birthDate, age)}
                                />
                            </div>
                        ) : null}
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 mb-6">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-bold text-gray-800">Your Health Profile</h3>
                            <span className="text-xs font-semibold bg-gradient-to-r from-primary-600 to-purple-600 text-white px-2 py-0.5 rounded-full">
                                {presentation.unansweredHint
                                    ? `SSA population estimate — ${presentation.unansweredHint}`
                                    : presentation.estimateLabel}
                            </span>
                        </div>
                        {presentation.modelPendingNote ? (
                            <p className="text-xs text-gray-600 mb-4">{presentation.modelPendingNote}</p>
                        ) : null}
                        <div className={`grid gap-6 mt-4 ${effectiveCalcType === 'couple' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
                            {primaryPersonId && (
                                <div>
                                    {effectiveCalcType === 'couple' && (
                                        <div className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 pb-1 border-b-2 border-primary-600">
                                            {primary?.name || 'You'}
                                        </div>
                                    )}
                                    <HealthSelector
                                        health={profilesByPersonId[primaryPersonId] || emptyLongevityProfile()}
                                        setHealth={(next) => updatePersonProfile(primaryPersonId, next)}
                                    />
                                </div>
                            )}
                            {effectiveCalcType === 'couple' && (partnerPersonId || partners?.[0]) && (
                                <div>
                                    <div className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 pb-1 border-b-2 border-primary-600">
                                        {spouse?.name || 'Spouse'}
                                    </div>
                                    <HealthSelector
                                        health={profilesByPersonId[partnerPersonId || 'partner'] || emptyLongevityProfile()}
                                        setHealth={(next) => updatePersonProfile(partnerPersonId || 'partner', next)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {presentation.cards.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-900">
                            {readinessMessage}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {presentation.cards.map((card) => (
                                <div
                                    key={card.probability}
                                    data-longevity-card={card.probability}
                                    className="bg-blue-50 rounded-xl p-4 text-center"
                                    title={card.tooltip}
                                >
                                    <div data-card-primary className="text-4xl font-extrabold text-gray-900 leading-none">
                                        {card.primaryMetric}
                                    </div>
                                    <div data-card-secondary className="text-3xl font-bold text-gray-900 mt-2 leading-tight">
                                        {card.secondaryMetric}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-2">
                                        {card.kicker}
                                    </div>
                                    {card.namesAndAges ? (
                                        <div className="text-sm text-gray-600 mt-1">
                                            {card.namesAndAges}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}

                    {presentation.householdExplanation ? (
                        <div className="rounded-xl bg-gradient-to-r from-primary-600 to-purple-600 text-white p-5 mb-6">
                            <p className="text-sm leading-relaxed">{presentation.householdExplanation}</p>
                        </div>
                    ) : null}

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
                        emptyGraphMessage ? (
                            <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-700" style={{ minHeight: '200px' }}>
                                {emptyGraphMessage}
                            </div>
                        ) : (
                            <div className="bg-gray-50 rounded-xl p-4" style={{ height: '400px' }}>
                                <Line data={chartData} options={chartOptions} />
                            </div>
                        )
                    )}

                    {currentView === 'table' && (
                        emptyGraphMessage ? (
                            <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-700">
                                {emptyGraphMessage}
                            </div>
                        ) : (
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
                        )
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
