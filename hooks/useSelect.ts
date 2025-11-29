import { useState } from 'react';
import { RecipeOption } from 'types/recipe';
import { Nullable } from '../types/common';

export function useSelect<Option extends RecipeOption>(initialValue: Nullable<Option>) {
  const [state, setState] = useState<Nullable<Option>>(initialValue);

  const toggleState = (newOption: Option) => {
    if (state === newOption) {
      setState(null);
    } else {
      setState(newOption);
    }
  };

  return [state, toggleState] as const;
}
