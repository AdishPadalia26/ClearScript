import { useCallback, useInsertionEffect, useRef } from "react";

/** A callback with a stable identity that always sees the latest props/state (à la useEffectEvent). */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
