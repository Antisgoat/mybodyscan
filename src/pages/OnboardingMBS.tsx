import React, { useMemo, useState } from 'react';
import { setDoc } from '../lib/dbWrite';
import { DemoWriteButton } from '../components/DemoWriteGuard';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthUserMBS } from '../hooks/useAuthUserMBS';
import ToastMBS from '../components/ToastMBS';
import { toFriendlyMBS } from '../lib/errors.mbs';
import ScanTipsMBS from '../components/ScanTipsMBS';
import HeightInputUS from '../components/HeightInputUS';
import { kgToLb, lbToKg } from '../lib/units';

type Step = 1|2|3|4;

export default function OnboardingMBS() {
  const { user } = useAuthUserMBS();
  const [step, setStep] = useState<Step>(1);
  const [msg, setMsg] = useState<string | null>(null);

  const [goals, setGoals] = useState<string[]>([]);
  const [targetWeightKg, setTargetWeightKg] = useState<number | undefined>();
  const [experience, setExperience] = useState<'Beginner'|'Intermediate'|'Advanced'|''>('');
  const [heightCm, setHeightCm] = useState<number | undefined>();
  const [weightKg, setWeightKg] = useState<number | undefined>();
  const [age, setAge] = useState<number | undefined>();
  const [sexAtBirth, setSexAtBirth] = useState<'M'|'F'|'Prefer not'|''>('');
  const [activityLevel, setActivityLevel] = useState<'Low'|'Med'|'High'|''>('');
  const [scanMode, setScanMode] = useState<'photos'|'video'>('photos');
  const [reminderDays, setReminderDays] = useState<7|10|14>(10);
  const [reminderTime, setReminderTime] = useState<'morning'|'afternoon'|'evening'>('morning');
  const [consent, setConsent] = useState<boolean>(false);

  const userDocRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [user]);
  const meRef = useMemo(() => user ? doc(db, 'users', user.uid, 'profile', 'profile') : null, [user]);
  const settingsRef = useMemo(() => user ? doc(db, 'users', user.uid, 'settings', 'settings') : null, [user]);
  const prefsRef = useMemo(() => user ? doc(db, 'users', user.uid, 'preferences', 'preferences') : null, [user]);
  const onboardingRef = useMemo(() => user ? doc(db, `users/${user.uid}/meta/onboarding`) : null, [user]);

  async function load() {
    if (!user || !onboardingRef) return;
    const snap = await getDoc(onboardingRef);
    if (snap.exists() && snap.data()?.completed) {
      setMsg('Onboarding already completed.');
    }
  }

  React.useEffect(() => { load().catch(()=>{}); }, [onboardingRef]);

  function toggle(arr: string[], v: string) {
    return arr.includes(v) ? arr.filter(x=>x!==v) : [...arr, v];
  }

  async function finish() {
    try {
      if (!user || !userDocRef || !meRef || !settingsRef || !prefsRef || !onboardingRef) throw new Error('AUTH_REQUIRED');
      if (!consent) throw new Error('Please grant consent to continue.');

      const profile = {
        sexAtBirth: sexAtBirth || undefined,
        heightCm: heightCm ?? undefined,
        weightKg: weightKg ?? undefined,
        age: age ?? undefined,
        units: 'Imperial',
        experience: experience || undefined,
        goals,
        targetWeightKg: targetWeightKg ?? undefined,
        activityLevel: activityLevel || undefined,
      };
      const settings = { reminderDays, reminderTime };
      const preferences = { scanMode };

      const timestamp = serverTimestamp();
      await Promise.all([
        setDoc(meRef, profile, { merge: true }),
        setDoc(settingsRef, settings, { merge: true }),
        setDoc(prefsRef, preferences, { merge: true }),
        setDoc(onboardingRef, { completed: true, updatedAt: timestamp }, { merge: true }),
        setDoc(
          userDocRef,
          {
            onboarding: {
              ...profile,
              goals,
              targetWeightKg: targetWeightKg ?? undefined,
              consent,
              completedAt: timestamp,
            },
          },
          { merge: true }
        ),
      ]);
      setMsg('Onboarding saved.');
    } catch (e: any) {
      setMsg(toFriendlyMBS(e));
    }
  }

  return (
    <div className="max-w-xl mx-auto p-5 space-y-4">
      <ToastMBS msg={msg}/>
      {step === 1 && (
        <div className="rounded-2xl border p-5 bg-white space-y-2">
          <h1 className="text-xl font-semibold">Welcome to MyBodyScan</h1>
          <p className="text-slate-600">We'll personalize your plan in under a minute.</p>
          <button className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={()=>setStep(2)}>Let's go</button>
        </div>
      )}
      {step === 2 && (
        <div className="rounded-2xl border p-5 bg-white space-y-3">
          <h2 className="font-medium">Your goals</h2>
          <div className="flex flex-wrap gap-2">
            {['Weight loss','Muscle gain','Recomposition','Track health metrics','Athletic performance','Post-injury comeback'].map(g=>(
              <button key={g} onClick={()=>setGoals(toggle(goals,g))}
                className={`px-3 py-1 rounded-full border ${goals.includes(g) ? 'bg-blue-600 text-white' : 'bg-white text-slate-800'}`}>
                {g}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Target weight (lb)
              <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2"
                value={targetWeightKg != null ? Math.round(kgToLb(targetWeightKg)) : ''}
                onChange={e=>{
                  if (e.target.value === '') {
                    setTargetWeightKg(undefined);
                    return;
                  }
                  const value = Number(e.target.value);
                  if (Number.isNaN(value)) return;
                  setTargetWeightKg(lbToKg(value));
                }} />
            </label>
            <label className="text-sm">Experience
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={experience} onChange={e=>setExperience(e.target.value as any)}>
                <option value="">Select</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option>
              </select>
            </label>
          </div>
          <div className="flex justify-between">
            <button className="px-4 py-2 rounded-xl border" onClick={()=>setStep(1)}>Back</button>
            <button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={()=>setStep(3)}>Next</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="rounded-2xl border p-5 bg-white space-y-3">
          <h2 className="font-medium">Basics</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Height
              <div className="mt-1">
                <HeightInputUS valueCm={heightCm} onChangeCm={cm=>setHeightCm(cm ?? undefined)} />
              </div>
            </label>
            <label className="text-sm">Current weight (lb)
              <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2"
                value={weightKg != null ? Math.round(kgToLb(weightKg)) : ''}
                onChange={e=>{
                  if (e.target.value === '') {
                    setWeightKg(undefined);
                    return;
                  }
                  const value = Number(e.target.value);
                  if (Number.isNaN(value)) return;
                  setWeightKg(lbToKg(value));
                }} />
            </label>
            <label className="text-sm">Age
              <input type="number" className="mt-1 w-full border rounded-lg px-3 py-2" value={age ?? ''} onChange={e=>setAge(e.target.value?Number(e.target.value):undefined)} />
            </label>
            <label className="text-sm">Sex at birth
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={sexAtBirth} onChange={e=>setSexAtBirth(e.target.value as any)}>
                <option value="">Select</option><option value="M">M</option><option value="F">F</option><option>Prefer not</option>
              </select>
            </label>
            <label className="text-sm">Weekly activity
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={activityLevel} onChange={e=>setActivityLevel(e.target.value as any)}>
                <option value="">Select</option><option>Low</option><option>Med</option><option>High</option>
              </select>
            </label>
            <label className="text-sm">Preferred units
              <div className="mt-1 w-full border rounded-lg px-3 py-2 bg-slate-50 text-slate-600">
                US (lb, ft/in) — defaults for v1
              </div>
            </label>
            <label className="text-sm">Scan mode
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={scanMode} onChange={e=>setScanMode(e.target.value as any)}>
                <option value="photos">Photos (4 angles)</option>
              </select>
            </label>
          </div>
          <ScanTipsMBS />
          <div className="flex justify-between">
            <button className="px-4 py-2 rounded-xl border" onClick={()=>setStep(2)}>Back</button>
            <button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={()=>setStep(4)}>Next</button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="rounded-2xl border p-5 bg-white space-y-3">
          <h2 className="font-medium">Reminders & Consent</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Reminder cadence
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={reminderDays} onChange={e=>setReminderDays(Number(e.target.value) as any)}>
                <option value={7}>Every 7 days</option><option value={10}>Every 10 days</option><option value={14}>Every 14 days</option>
              </select>
            </label>
            <label className="text-sm">Time of day
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={reminderTime} onChange={e=>setReminderTime(e.target.value as any)}>
                <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
              </select>
            </label>
          </div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />
            <span>I consent to store my scans to track progress.</span>
          </label>
          <div className="flex justify-between">
            <button className="px-4 py-2 rounded-xl border" onClick={()=>setStep(3)}>Back</button>
            <DemoWriteButton asChild>
              <button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={finish}>Finish</button>
            </DemoWriteButton>
          </div>
        </div>
      )}
    </div>
  );
}