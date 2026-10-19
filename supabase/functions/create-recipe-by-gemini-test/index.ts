/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCreateRecipe } from '../_shared/createRecipe.ts';

serve(handleCreateRecipe);
