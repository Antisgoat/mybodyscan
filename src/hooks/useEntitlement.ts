import { useState, useEffect } from 'react';
import { useCredits } from './useCredits.ts';

interface Entitlement {
  subscribed: boolean;
  plan: string | null;
  credits: number;
}

export function useEntitlement() {
  const { credits, uid } = useCredits();
  const [entitlement, setEntitlement] = useState<Entitlement>({
    subscribed: false,
    plan: null,
    credits: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setEntitlement({ subscribed: false, plan: null, credits: 0 });
      setLoading(false);
      return;
    }

    // In a real app, this would call the backend entitlement() function
    // For now, we'll simulate based on credits
    const fetchEntitlement = async () => {
      try {
        // Simulated entitlement logic
        const subscribed = credits > 0;
        const plan = subscribed ? 'pro' : null;
        
        setEntitlement({
          subscribed,
          plan,
          credits
        });
      } catch (error) {
        console.error('Failed to fetch entitlement:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntitlement();
  }, [uid, credits]);

  return {
    ...entitlement,
    loading,
    hasAccess: (feature: 'scan' | 'coach' | 'nutrition') => {
      if (feature === 'scan') {
        return entitlement.credits > 0 || entitlement.subscribed;
      }
      return entitlement.subscribed; // Coach and Nutrition require subscription
    }
  };
}