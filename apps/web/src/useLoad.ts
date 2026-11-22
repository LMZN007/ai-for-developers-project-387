import { useCallback, useEffect, useState } from "react";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; data: T };

/**
 * Runs `load` when the component mounts and whenever `load` changes (keep it stable: a module-level
 * function or `useCallback`). Resolving `undefined` or rejecting marks a failure; `retry` repeats
 * the request («Повторить»), `update` changes the loaded data in place without a loading screen.
 */
export function useLoad<T>(load: () => Promise<T | undefined>) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  // Bumping the attempt re-runs the request effect.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) {
          setState(data === undefined ? { status: "failed" } : { status: "loaded", data });
        }
      },
      () => {
        if (current) {
          setState({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  const update = useCallback((change: (data: T) => T) => {
    setState((current) =>
      current.status === "loaded" ? { status: "loaded", data: change(current.data) } : current,
    );
  }, []);

  return { state, retry, update };
}
