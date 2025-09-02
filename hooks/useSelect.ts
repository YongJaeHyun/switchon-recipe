import { useState } from 'react';
import { RecipeOption } from 'types/recipe';

export function useSelect<Option extends RecipeOption>(initialValue: Option | null) {
  const [state, setState] = useState<Option | null>(initialValue);

  const toggleState = (newOption: Option) => {
    if (state === newOption) {
      setState(null);
    } else {
      setState(newOption);
    }
  };

  return [state, toggleState] as const;
}
