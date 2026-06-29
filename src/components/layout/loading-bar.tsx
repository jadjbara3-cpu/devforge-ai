"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

type LoadingState = "idle" | "loading" | "complete";

interface LoadingBarContextValue {
  start: () => void;
  done: () => void;
}

const LoadingBarContext = React.createContext<LoadingBarContextValue | null>(
  null
);

export function useLoadingBar() {
  const ctx = React.useContext(LoadingBarContext);
  return ctx ?? { start: () => {}, done: () => {} };
}

export function LoadingBarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<LoadingState>("idle");
  const [progress, setProgress] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const completeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCount = React.useRef(0);

  const clearTimers = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (completeTimer.current) {
      clearTimeout(completeTimer.current);
      completeTimer.current = null;
    }
  }, []);

  const start = React.useCallback(() => {
    activeCount.current++;
    if (activeCount.current === 1) {
      clearTimers();
      setProgress(15);
      setState("loading");
      // Incrementally advance toward 90% but never complete until done()
      timerRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          return p + Math.max(1, (90 - p) * 0.08);
        });
      }, 250);
    }
  }, [clearTimers]);

  const done = React.useCallback(() => {
    activeCount.current = Math.max(0, activeCount.current - 1);
    if (activeCount.current === 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setProgress(100);
      setState("complete");
      completeTimer.current = setTimeout(() => {
        setState("idle");
        setProgress(0);
      }, 400);
    }
  }, []);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  const value = React.useMemo(() => ({ start, done }), [start, done]);

  return (
    <LoadingBarContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {state !== "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed left-0 top-0 z-[200] h-0.5 w-full"
          >
            <div
              className="h-full bg-gradient-to-r from-primary via-chart-2 to-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </LoadingBarContext.Provider>
  );
}
