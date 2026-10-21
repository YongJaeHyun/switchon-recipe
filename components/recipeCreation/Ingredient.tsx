import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import React from 'react';
import { RecipeType } from 'types/database';
import { Ingredient as IngredientType } from 'types/recipe';
import IngredientTile from './IngredientTile';

interface IngredientProps extends IngredientType {
  isSelected: boolean;
  disabled: boolean;
}

function Ingredient({ name, image, week, isSelected, isCarbohydrate, disabled }: IngredientProps) {
  const type = useLastPathname() as RecipeType;
  const { toggleIngredient } = useSelectedIngredients({ type });

  const isZeroAndCarboHydrate = type === 'zero' && isCarbohydrate;

  const toggleSelect = () => {
    toggleIngredient({ name, image, week });
  };
  return (
    <IngredientTile
      name={name}
      image={image}
      isSelected={isSelected}
      disabled={disabled || !!isZeroAndCarboHydrate}
      tone={type === 'zero' ? 'zero' : 'low'}
      overlayLabel={isZeroAndCarboHydrate ? '저탄수' : undefined}
      onPress={toggleSelect}
    />
  );
}

export default React.memo(Ingredient);
