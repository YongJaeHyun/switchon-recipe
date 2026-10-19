import { describe, expect, it } from 'vitest';
import { getCreationLoadingKind } from './creationLoading';

describe('getCreationLoadingKind', () => {
  it('shows the recipe-making overlay only while a recipe is being made', () => {
    expect(getCreationLoadingKind({ isRecipeLoading: true, isDataLoading: true })).toBe('recipe');
    expect(getCreationLoadingKind({ isRecipeLoading: true, isDataLoading: false })).toBe('recipe');
  });

  it('shows a plain data spinner while ingredients are loading', () => {
    expect(getCreationLoadingKind({ isRecipeLoading: false, isDataLoading: true })).toBe('data');
  });

  it('shows nothing when idle', () => {
    expect(getCreationLoadingKind({ isRecipeLoading: false, isDataLoading: false })).toBeNull();
  });
});
