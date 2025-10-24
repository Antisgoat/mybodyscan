import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

const todayKey = () => new Date().toISOString().slice(0, 10);

export async function ensureDemoData(db: Firestore, uid: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(
      userRef,
      {
        displayName: "Demo User",
        createdAt: serverTimestamp(),
        isDemo: true,
        lastDemoVisitAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    const data = userSnap.data() as Record<string, unknown> | undefined;
    if (!data?.displayName || data.displayName === "") {
      await setDoc(userRef, { displayName: "Demo User" }, { merge: true });
    }
    if (data?.isDemo !== true) {
      await setDoc(userRef, { isDemo: true }, { merge: true });
    }
  }

  const coachProfileRef = doc(db, "users", uid, "coach", "profile");
  const coachProfileSnap = await getDoc(coachProfileRef);
  if (!coachProfileSnap.exists()) {
    await setDoc(
      coachProfileRef,
      {
        goal: "lose_fat",
        activity_level: "moderate",
        currentProgramId: "demo-balanced",
        activeProgramId: "demo-balanced",
        currentWeekIdx: 0,
        currentDayIdx: 1,
        isDemo: true,
        startedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const coachPlanRef = doc(db, "users", uid, "coachPlans", "current");
  const coachPlanSnap = await getDoc(coachPlanRef);
  if (!coachPlanSnap.exists()) {
    await setDoc(
      coachPlanRef,
      {
        days: 3,
        split: "Balanced strength",
        sessions: [
          {
            day: "Day 1",
            blocks: [
              {
                title: "Warm-up",
                focus: "Mobility",
                work: ["5 min incline walk", "World's greatest stretch 2×8/side"],
              },
              {
                title: "Strength",
                focus: "Full body",
                work: ["Back squat 3×8", "Bench press 3×10", "Plank 3×45s"],
              },
            ],
          },
          {
            day: "Day 2",
            blocks: [
              {
                title: "Lower body",
                focus: "Posterior chain",
                work: ["Romanian deadlift 3×10", "Walking lunge 3×12/side", "Glute bridge 3×15"],
              },
              {
                title: "Finisher",
                focus: "Core",
                work: ["Dead bug 3×12", "Side plank 2×45s"],
              },
            ],
          },
          {
            day: "Day 3",
            blocks: [
              {
                title: "Upper body",
                focus: "Push / pull",
                work: ["Overhead press 3×8", "Lat pull-down 3×12", "Face pull 3×15"],
              },
              {
                title: "Conditioning",
                focus: "Zone 2",
                work: ["20 min bike @ RPE 6", "3×12 kettlebell swings"],
              },
            ],
          },
        ],
        progression: { deloadEvery: 4 },
        calorieTarget: 2200,
        proteinFloor: 140,
        disclaimer: "Demo plan — educational only.",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const generalPlanRef = doc(db, "users", uid, "plans", "current");
  const generalPlanSnap = await getDoc(generalPlanRef);
  if (!generalPlanSnap.exists()) {
    await setDoc(
      generalPlanRef,
      {
        name: "Balanced 3-day split",
        summary: "Demo template to showcase progress tracking.",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const mealsRef = doc(db, "users", uid, "meals", todayKey());
  const mealsSnap = await getDoc(mealsRef);
  if (!mealsSnap.exists()) {
    await setDoc(
      mealsRef,
      {
        entries: [
          {
            id: "demo-breakfast",
            name: "Greek yogurt parfait",
            protein: 28,
            carbs: 34,
            fat: 9,
            calories: 360,
          },
          {
            id: "demo-lunch",
            name: "Chicken quinoa bowl",
            protein: 42,
            carbs: 48,
            fat: 12,
            calories: 520,
          },
          {
            id: "demo-dinner",
            name: "Salmon with roasted potatoes",
            protein: 38,
            carbs: 44,
            fat: 18,
            calories: 540,
          },
        ],
        totals: {
          calories: 1420,
          protein: 108,
          carbs: 126,
          fat: 39,
        },
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const workoutsRef = doc(db, "users", uid, "workouts", todayKey());
  const workoutsSnap = await getDoc(workoutsRef);
  if (!workoutsSnap.exists()) {
    await setDoc(
      workoutsRef,
      {
        session: "Full body strength",
        focus: "Build confidence with compound lifts.",
        exercises: [
          { name: "Back squat", sets: 3, reps: "8" },
          { name: "Bench press", sets: 3, reps: "10" },
          { name: "Bent-over row", sets: 3, reps: "10" },
        ],
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const chatMetaRef = doc(db, "users", uid, "coach", "chatMeta");
  const chatMetaSnap = await getDoc(chatMetaRef);
  if (!chatMetaSnap.exists()) {
    await setDoc(
      chatMetaRef,
      {
        welcomeDelivered: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await setDoc(userRef, { lastDemoVisitAt: serverTimestamp() }, { merge: true });

  const chatCollectionRef = collection(chatMetaRef, "chat");
  const chatSnapshot = await getDocs(query(chatCollectionRef, limit(1)));
  if (chatSnapshot.empty) {
    const messageRef = doc(chatCollectionRef);
    await setDoc(messageRef, {
      text: "",
      response:
        "Welcome to the MyBodyScan coach demo! Explore the plan, meals, and workouts we've preloaded. Create a free account when you're ready to save your own progress.",
      createdAt: serverTimestamp(),
      usedLLM: false,
    });
  }
}
