import { useState } from 'react';

export function useSelect<T>(initialValue: T | null) {
  const [state, setState] = useState<T>(initialValue);

  const toggleState = (newState: T) => {
    if (state === newState) {
      setState(null);
    } else {
      setState(newState);
    }
  };

  return [state, toggleState] as const;
}
