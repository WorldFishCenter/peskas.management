import React, { createContext, useCallback, useContext, useState } from 'react';
import { useAuth } from '../components/Auth/AuthContext';

type SurveyOption = { asset_id: string; has_records?: boolean };

interface SurveyContextValue {
  selectedSurveyId: string | null;
  setSelectedSurveyId: (id: string | null) => void;
  /**
   * The survey to open when none is selected: the one this account last showed in this browser,
   * if it still has it, else the first with submissions, else the first.
   */
  pickSurvey: <T extends SurveyOption>(surveys: T[]) => T | undefined;
}

const SurveyContext = createContext<SurveyContextValue>({
  selectedSurveyId: null,
  setSelectedSurveyId: () => {},
  pickSurvey: surveys => surveys[0]
});

export const SurveyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const username = user?.username ?? '';
  // Keyed by account: another account signing in on the same tab starts from its own surveys.
  return <AccountSurveyProvider key={username} username={username}>{children}</AccountSurveyProvider>;
};

const AccountSurveyProvider: React.FC<{ username: string; children: React.ReactNode }> = ({ username, children }) => {
  const [selectedSurveyId, setSelected] = useState<string | null>(null);
  // Per account, so the next person on a shared laptop does not open the last one's form.
  const storageKey = `lastSurveyId:${username}`;

  const setSelectedSurveyId = useCallback((id: string | null) => {
    setSelected(id);
    if (!id) return;
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      // Storage blocked: the choice lasts until the page is reloaded.
    }
  }, [storageKey]);

  const pickSurvey = useCallback(<T extends SurveyOption>(surveys: T[]): T | undefined => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(storageKey);
    } catch {
      // Storage blocked: fall back to the first survey with data.
    }
    return surveys.find(s => s.asset_id === last) ?? surveys.find(s => s.has_records !== false) ?? surveys[0];
  }, [storageKey]);

  return (
    <SurveyContext.Provider value={{ selectedSurveyId, setSelectedSurveyId, pickSurvey }}>
      {children}
    </SurveyContext.Provider>
  );
};

export const useSurveyContext = () => useContext(SurveyContext);
