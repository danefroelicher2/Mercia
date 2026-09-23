import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// The app-wide side drawer (swipe right on any tab). Holds whether it's open
// and which Routine-tab section it last picked: Routine, Gym or Streaks.

export type DrawerSection = 'routine' | 'gym' | 'streaks';

interface DrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  section: DrawerSection;
  // Close the drawer, show this section, and switch to the Routine tab.
  selectSection: (section: DrawerSection) => void;
  // Lets a horizontal pager inside a tab (the Today card) drag the drawer
  // open itself: on its first page, a right swipe on the pager goes here
  // instead of being lost to the pager's own scrolling.
  drag: React.MutableRefObject<DrawerDrag>;
}

export interface DrawerDrag {
  begin: () => void;
  update: (translationX: number) => void;
  end: (velocityX: number) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export const DrawerProvider: React.FC<{
  children: React.ReactNode;
  // Switches the bottom tabs to Routine; supplied by the tab host.
  onShowRoutineTab: () => void;
}> = ({ children, onShowRoutineTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<DrawerSection>('routine');
  // Filled in by SideDrawer, which owns the animation.
  const drag = useRef<DrawerDrag>({ begin: () => {}, update: () => {}, end: () => {} });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const selectSection = useCallback(
    (next: DrawerSection) => {
      setSection(next);
      setIsOpen(false);
      onShowRoutineTab();
    },
    [onShowRoutineTab],
  );

  const value = useMemo(
    () => ({ isOpen, open, close, section, selectSection, drag }),
    [isOpen, open, close, section, selectSection],
  );
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
};

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used inside DrawerProvider');
  return ctx;
}
