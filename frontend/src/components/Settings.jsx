import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useDevMode } from '../contexts/DevModeContext';

const Settings = () => {
    const { user, profile: realProfile, partners: realPartners, children: realChildren, updateProfile, updatePartner, addPartner } = useUser();
    const { isDevMode, isDevTools, devProfile, devPartners, devChildren, updateDevProfile, updateDevPartner } = useDevMode();

    const profile = isDevMode ? devProfile : realProfile;
    const partners = isDevMode ? devPartners : realPartners;
    const children = isDevMode ? devChildren : realChildren;

    // State
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [email, setEmail] = useState('');
    const [relationshipStatus, setRelationshipStatus] = useState('single');
    const [everDivorced, setEverDivorced] = useState(false);
    const [divorceCount, setDivorceCount] = useState(1);
    const [everWidowed, setEverWidowed] = useState(false);
    const [widowedCount, setWidowedCount] = useState(1);
    const [spouseName, setSpouseName] = useState('');
    const [spouseDateOfBirth, setSpouseDateOfBirth] = useState('');
    const [marriageDate, setMarriageDate] = useState('');
    const [spouseHasStartedSS, setSpouseHasStartedSS] = useState(false);
    const [spouseSSBenefit, setSpouseSSBenefit] = useState('');
    const [spousePIA, setSpousePIA] = useState('');
    const [spouseEmail, setSpouseEmail] = useState('');
    const [divorceDate, setDivorceDate] = useState('');
    const [marriageDurationYears, setMarriageDurationYears] = useState('');
    const [deathDate, setDeathDate] = useState('');
    const [remarried, setRemarried] = useState(false);
    const [remarriageDate, setRemarriageDate] = useState('');
    const [hasStartedSS, setHasStartedSS] = useState(false);
    const [ssStartDate, setSSStartDate] = useState('');
    const [currentSSBenefit, setCurrentSSBenefit] = useState('');
    const [ownPIA, setOwnPIA] = useState('');
    const [hasChildrenUnder16, setHasChildrenUnder16] = useState(false);
    const [childrenCount, setChildrenCount] = useState(1);
    const [childrenBirthDates, setChildrenBirthDates] = useState(['']);
    const [employmentStatus, setEmploymentStatus] = useState('employed');
    const [expectedRetirementDate, setExpectedRetirementDate] = useState('');
    const [longevityAge, setLongevityAge] = useState(95);
    const [inflationRate, setInflationRate] = useState(2.5);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        // Load email from user object (auth data)
        if (user) {
            setEmail(user.email || '');
        }

        if (profile) {
            setFirstName(profile.firstName || profile.first_name || '');
            setLastName(profile.lastName || profile.last_name || '');
            setDateOfBirth(profile.dateOfBirth || profile.date_of_birth || '');
            setRelationshipStatus(profile.relationshipStatus || profile.relationship_status || 'single');
            setEverDivorced(profile.everDivorced || profile.ever_divorced || false);
            setDivorceCount(profile.divorceCount || profile.divorce_count || 1);
            setEverWidowed(profile.everWidowed || profile.ever_widowed || false);
            setWidowedCount(profile.widowedCount || profile.widowed_count || 1);
            setHasStartedSS(profile.already_receiving_benefits || profile.has_started_ss || false);
            setSSStartDate(profile.ss_start_date || profile.benefit_filing_date || '');
            setCurrentSSBenefit(profile.current_monthly_benefit || profile.current_ss_benefit || '');
            setOwnPIA(profile.pia_at_fra || profile.own_pia || '');
            setEmploymentStatus(profile.employment_status || 'employed');
            setExpectedRetirementDate(profile.expected_retirement_date || '');
            setLongevityAge(profile.longevity_age || 95);
            setInflationRate(profile.inflation_rate || 2.5);
            setDivorceDate(profile.divorce_date || '');
            setMarriageDurationYears(profile.marriage_duration_years || '');
            setDeathDate(profile.death_date || '');
            setRemarried(profile.remarried || false);
            setRemarriageDate(profile.remarriage_date || '');
        }

        // Load partner data
        if (partners && partners.length > 0) {
            const p = partners[0];
            // Build full name from first_name + last_name or use name field
            const pFirstName = p.firstName || p.first_name || '';
            const pLastName = p.lastName || p.last_name || '';
            const pName = p.name || (pFirstName && pLastName ? `${pFirstName} ${pLastName}` : pFirstName) || '';
            setSpouseName(pName);
            setSpouseDateOfBirth(p.dateOfBirth || p.date_of_birth || '');
            setMarriageDate(p.marriage_date || '');
            setSpouseHasStartedSS(p.already_receiving_benefits || p.has_started_ss || false);
            setSpouseSSBenefit(p.current_monthly_benefit || p.ss_benefit || '');
            setSpousePIA(p.pia_at_fra || p.pia || '');
            setSpouseEmail(p.email || '');
        }

        // Load children data
        if (children && children.length > 0) {
            setHasChildrenUnder16(true);
            setChildrenCount(children.length);
            const birthDates = children.map(c => c.date_of_birth || c.dateOfBirth || '');
            setChildrenBirthDates(birthDates);
        } else {
            setHasChildrenUnder16(false);
            setChildrenCount(1);
            setChildrenBirthDates(['']);
        }
    }, [user, profile, partners, children]);

    const calculateAge = (dob) => {
        if (!dob) return null;
        const today = new Date();
        const birth = new Date(dob);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const calculateFRA = (dob) => {
        if (!dob) return null;
        const birthYear = new Date(dob).getFullYear();
        if (birthYear <= 1937) return 65;
        if (birthYear <= 1954) return 66;
        if (birthYear === 1955) return "66 and 2 months";
        if (birthYear === 1956) return "66 and 4 months";
        if (birthYear === 1957) return "66 and 6 months";
        if (birthYear === 1958) return "66 and 8 months";
        if (birthYear === 1959) return "66 and 10 months";
        return 67;
    };

    const userAge = calculateAge(dateOfBirth);
    const spouseAge = calculateAge(spouseDateOfBirth);
    const userFRA = calculateFRA(dateOfBirth);
    const spouseFRA = calculateFRA(spouseDateOfBirth);

    const handleChildrenCountChange = (count) => {
        setChildrenCount(count);
        const newDates = Array(count).fill('');
        childrenBirthDates.forEach((date, idx) => {
            if (idx < count) newDates[idx] = date;
        });
        setChildrenBirthDates(newDates);
    };

    const handleChildBirthDateChange = (index, value) => {
        const newDates = [...childrenBirthDates];
        newDates[index] = value;
        setChildrenBirthDates(newDates);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMessage('');

        try {
            const displayName = `${firstName} ${lastName}`.trim();
            const profileUpdate = {
                // API expects camelCase; keep snake_case fields for backward compatibility where used
                firstName: firstName,
                lastName: lastName,
                relationshipStatus: relationshipStatus,
                dateOfBirth: dateOfBirth,
                // legacy keys (ignored by API but kept to avoid breaking dev-mode paths)
                display_name: displayName,
                first_name: firstName,
                last_name: lastName,
                relationship_status: relationshipStatus,
                ever_divorced: everDivorced,
                divorce_count: everDivorced ? divorceCount : 0,
                ever_widowed: everWidowed,
                widowed_count: everWidowed ? widowedCount : 0,
                // SS fields - map to database column names
                alreadyReceivingBenefits: hasStartedSS,
                already_receiving_benefits: hasStartedSS,
                currentMonthlyBenefit: hasStartedSS ? parseFloat(currentSSBenefit) || null : null,
                current_monthly_benefit: hasStartedSS ? parseFloat(currentSSBenefit) || null : null,
                piaAtFra: ownPIA ? parseFloat(ownPIA) : null,
                pia_at_fra: ownPIA ? parseFloat(ownPIA) : null,
                // Other Planning fields
                employment_status: employmentStatus,
                expected_retirement_date: expectedRetirementDate || null,
                longevity_age: longevityAge,
                inflation_rate: inflationRate,
                divorce_date: relationshipStatus === 'divorced' ? divorceDate : null,
                marriage_duration_years: relationshipStatus === 'divorced' ? parseInt(marriageDurationYears) || null : null,
                death_date: relationshipStatus === 'widowed' ? deathDate : null,
                remarried: remarried,
                remarriage_date: remarried ? remarriageDate : null,
            };

            if (isDevMode) {
                updateDevProfile(profileUpdate);
            } else {
                await updateProfile(profileUpdate);
            }

            // Handle spouse/partner data
            if (relationshipStatus === 'married' || relationshipStatus === 'divorced' || relationshipStatus === 'widowed') {
                // Parse the spouse name into first and last
                const nameParts = spouseName.trim().split(' ');
                const spouseFirstName = nameParts[0] || '';
                const spouseLastName = nameParts.slice(1).join(' ') || '';

                const partnerData = {
                    firstName: spouseFirstName,
                    lastName: spouseLastName,
                    dateOfBirth: spouseDateOfBirth || null,
                    relationshipType: relationshipStatus === 'married' ? 'spouse' :
                        relationshipStatus === 'divorced' ? 'ex_spouse' : 'deceased_spouse',
                    marriage_date: marriageDate || null,
                    alreadyReceivingBenefits: spouseHasStartedSS,
                    currentMonthlyBenefit: spouseHasStartedSS ? parseFloat(spouseSSBenefit) || null : null,
                    piaAtFra: spousePIA ? parseFloat(spousePIA) : null,
                    email: spouseEmail || null,
                    // Divorced specific
                    divorceDate: relationshipStatus === 'divorced' ? divorceDate : null,
                    marriageLengthYears: relationshipStatus === 'divorced' ? parseInt(marriageDurationYears) || null : null,
                    // Widowed specific
                    dateOfDeath: relationshipStatus === 'widowed' ? deathDate : null,
                };

                if (isDevMode) {
                    updateDevPartner(0, partnerData);
                } else if (partners && partners.length > 0) {
                    // Update existing partner
                    await updatePartner(partners[0].id, partnerData);
                } else if (spouseName || spouseDateOfBirth) {
                    // Create new partner if we have spouse info but no partner exists
                    await addPartner(partnerData);
                }
            }

            setSaveMessage('✓ Profile updated successfully');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setSaveMessage('Error saving settings. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const isMarried = relationshipStatus === 'married';
    const isDivorced = relationshipStatus === 'divorced';
    const isWidowed = relationshipStatus === 'widowed';
    const hasSpouse = isMarried || isDivorced || isWidowed;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12">
            <div className="max-w-5xl mx-auto px-6">
                <div className="mb-8">
                    <h1 className="text-4xl font-light text-gray-800 mb-2">Your Profile</h1>
                    <p className="text-gray-500 text-lg">Manage your personal information and preferences</p>
                </div>

                {isDevTools && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm font-medium text-yellow-800">Dev Mode Active - Changes saved to browser only</span>
                        </div>
                    </div>
                )}

                <div className="space-y-6">
                    {/* Personal Information */}
                    <div className="bg-white rounded-2xl shadow-sm p-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-6">Personal Information</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="First name"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Last name"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                    <span>Email Address</span>
                                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-600 cursor-not-allowed"
                                />
                                <p className="mt-2 text-xs text-gray-500">
                                    🔒 Email is your account identifier and cannot be changed
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                    <span>Your Date of Birth</span>
                                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                </label>
                                <input
                                    type="date"
                                    value={dateOfBirth}
                                    onChange={(e) => setDateOfBirth(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                />
                                {userAge && <div className="mt-1 text-sm text-gray-500">Age: {userAge} years | FRA: {userFRA}</div>}
                                <p className="mt-2 text-xs text-gray-500">You can update your DOB here. We use it to calculate FRA and age in all views.</p>
                            </div>
                        </div>
                    </div>

                    {/* Relationship Information */}
                    <div className="bg-white rounded-2xl shadow-sm p-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-6">Relationship Information</h2>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">Current Relationship Status</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {['single', 'married', 'divorced', 'widowed'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setRelationshipStatus(status)}
                                            className={`px-4 py-3 rounded-xl border-2 transition-all ${relationshipStatus === status
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                                                }`}
                                        >
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                <div className="bg-gray-50 rounded-xl p-5">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={everDivorced}
                                            onChange={(e) => setEverDivorced(e.target.checked)}
                                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-400"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Have you ever been divorced?</span>
                                    </label>
                                    {everDivorced && (
                                        <div className="mt-4 ml-8">
                                            <label className="block text-xs text-gray-600 mb-2">How many times?</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={divorceCount}
                                                onChange={(e) => setDivorceCount(Number(e.target.value))}
                                                className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-5">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={everWidowed}
                                            onChange={(e) => setEverWidowed(e.target.checked)}
                                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-400"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Have you ever been widowed?</span>
                                    </label>
                                    {everWidowed && (
                                        <div className="mt-4 ml-8">
                                            <label className="block text-xs text-gray-600 mb-2">How many times?</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={widowedCount}
                                                onChange={(e) => setWidowedCount(Number(e.target.value))}
                                                className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Spouse Information */}
                    {hasSpouse && (
                        <div className="bg-white rounded-2xl shadow-sm p-8">
                            <h2 className="text-xl font-semibold text-gray-800 mb-6">
                                {isMarried ? 'Spouse' : isDivorced ? 'Former Spouse' : 'Deceased Spouse'} Information
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                    <input
                                        type="text"
                                        value={spouseName}
                                        onChange={(e) => setSpouseName(e.target.value)}
                                        placeholder="Full name"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                        <span>Date of Birth</span>
                                        {spouseDateOfBirth && (
                                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </label>
                                    <input
                                        type="date"
                                        value={spouseDateOfBirth}
                                        onChange={(e) => setSpouseDateOfBirth(e.target.value)}
                                        disabled={!!spouseDateOfBirth && !isDevMode}
                                        className={`w-full px-4 py-3 border border-gray-200 rounded-xl ${spouseDateOfBirth && !isDevMode ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'
                                            }`}
                                    />
                                    {spouseAge && <div className="mt-1 text-sm text-gray-500">Age: {spouseAge} | FRA: {spouseFRA}</div>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Marriage Date</label>
                                    <input
                                        type="date"
                                        value={marriageDate}
                                        onChange={(e) => setMarriageDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                                    <input
                                        type="email"
                                        value={spouseEmail}
                                        onChange={(e) => setSpouseEmail(e.target.value)}
                                        placeholder="spouse@email.com"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">For inviting them to their own SS K.I.N.D. account</p>
                                </div>
                                {isDivorced && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Divorce Date</label>
                                            <input
                                                type="date"
                                                value={divorceDate}
                                                onChange={(e) => setDivorceDate(e.target.value)}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Marriage Duration (years)</label>
                                            <input
                                                type="number"
                                                value={marriageDurationYears}
                                                onChange={(e) => setMarriageDurationYears(e.target.value)}
                                                placeholder="10+ for benefits"
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                            />
                                        </div>
                                    </>
                                )}
                                {isWidowed && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Date of Death</label>
                                        <input
                                            type="date"
                                            value={deathDate}
                                            onChange={(e) => setDeathDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                )}
                                {(isDivorced || isWidowed) && (
                                    <div className="md:col-span-2">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={remarried}
                                                onChange={(e) => setRemarried(e.target.checked)}
                                                className="w-5 h-5 text-blue-600 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Have you remarried?</span>
                                        </label>
                                        {remarried && (
                                            <div className="mt-3 ml-8">
                                                <input
                                                    type="date"
                                                    value={remarriageDate}
                                                    onChange={(e) => setRemarriageDate(e.target.value)}
                                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="md:col-span-2 bg-gray-50 rounded-xl p-5">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={spouseHasStartedSS}
                                            onChange={(e) => setSpouseHasStartedSS(e.target.checked)}
                                            className="w-5 h-5 text-blue-600 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700">
                                            {isMarried ? 'Has spouse started' : 'Had spouse started'} collecting Social Security?
                                        </span>
                                    </label>
                                    {spouseHasStartedSS && (
                                        <div className="mt-4 ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-2">Monthly Benefit</label>
                                                <input
                                                    type="number"
                                                    value={spouseSSBenefit}
                                                    onChange={(e) => setSpouseSSBenefit(e.target.value)}
                                                    placeholder="$0"
                                                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-2">PIA (optional)</label>
                                                <input
                                                    type="number"
                                                    value={spousePIA}
                                                    onChange={(e) => setSpousePIA(e.target.value)}
                                                    placeholder="$0"
                                                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Your Social Security Status */}
                    <div className="bg-white rounded-2xl shadow-sm p-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-6">Your Social Security Status</h2>
                        <div className="bg-gray-50 rounded-xl p-5">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasStartedSS}
                                    onChange={(e) => setHasStartedSS(e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded"
                                />
                                <span className="text-sm font-medium text-gray-700">Have you started collecting Social Security?</span>
                            </label>
                            {hasStartedSS && (
                                <div className="mt-4 ml-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-2">Start Date</label>
                                        <input
                                            type="date"
                                            value={ssStartDate}
                                            onChange={(e) => setSSStartDate(e.target.value)}
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-2">Monthly Benefit</label>
                                        <input
                                            type="number"
                                            value={currentSSBenefit}
                                            onChange={(e) => setCurrentSSBenefit(e.target.value)}
                                            placeholder="$0"
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-2">PIA (optional)</label>
                                        <input
                                            type="number"
                                            value={ownPIA}
                                            onChange={(e) => setOwnPIA(e.target.value)}
                                            placeholder="$0"
                                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Children */}
                    <div className="bg-white rounded-2xl shadow-sm p-8">
                        <h2 className="text-xl font-semibold text-gray-800 mb-6">Children</h2>
                        <div className="bg-gray-50 rounded-xl p-5">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasChildrenUnder16}
                                    onChange={(e) => setHasChildrenUnder16(e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded"
                                />
                                <span className="text-sm font-medium text-gray-700">Do you have children under 16?</span>
                            </label>
                            {hasChildrenUnder16 && (
                                <div className="mt-4 ml-8 space-y-4">
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-2">How many?</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={childrenCount}
                                            onChange={(e) => handleChildrenCountChange(Number(e.target.value))}
                                            className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                    {Array.from({ length: childrenCount }).map((_, idx) => (
                                        <div key={idx}>
                                            <label className="block text-xs text-gray-600 mb-2">Child {idx + 1} Birth Date</label>
                                            <input
                                                type="date"
                                                value={childrenBirthDates[idx] || ''}
                                                onChange={(e) => handleChildBirthDateChange(idx, e.target.value)}
                                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="bg-white rounded-2xl shadow-sm p-8">
                        <div className="flex items-center justify-between">
                            <div>
                                {saveMessage && (
                                    <p className={`text-sm ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                                        {saveMessage}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
