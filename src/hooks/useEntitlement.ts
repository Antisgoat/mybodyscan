import { useState, useEffect } from 'react';
import { useCredits } from './useCredits';

interface Entitlement {
  subscribed: boolean;
  plan: string | null;
  credits: number;
  unlimited: boolean;
}

export function useEntitlement() {
  const { credits, uid, unlimited } = useCredits();
  const [entitlement, setEntitlement] = useState<Entitlement>({
    subscribed: false,
    plan: null,
    credits: 0,
    unlimited: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setEntitlement({ subscribed: false, plan: null, credits: 0, unlimited: false });
      setLoading(false);
      return;
    }

    // In a real app, this would call the backend entitlement() function
    // For now, we'll simulate based on credits
    const fetchEntitlement = async () => {
      try {
        // Simulated entitlement logic - unlimited users are always subscribed
        const subscribed = unlimited || credits > 0;
        const plan = subscribed ? (unlimited ? 'unlimited' : 'pro') : null;
        
        setEntitlement({
          subscribed,
          plan,
          credits,
          unlimited
        });
      } catch (error) {
        console.error('Failed to fetch entitlement:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntitlement();
  }, [uid, credits, unlimited]);

  return {
    ...entitlement,
    loading,
    hasAccess: (feature: 'scan' | 'coach' | 'nutrition') => {
      if (unlimited) {
        return true; // Unlimited users have access to everything
      }
      
      if (feature === 'scan') {
        return entitlement.credits > 0 || entitlement.subscribed;
      }
      return entitlement.subscribed; // Coach and Nutrition require subscription
    }
  };
}