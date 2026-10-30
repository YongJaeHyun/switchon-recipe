/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createRecipeHandler } from '../_shared/createRecipe.ts';

serve(createRecipeHandler('create-recipe-by-gemini-test'));
