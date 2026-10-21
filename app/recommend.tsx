import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Chip } from 'components/common/Chip';
import RippleButton from 'components/common/RippleButton';
import { SearchInput } from 'components/common/SearchInput';
import { Text } from 'components/common/Text';
import { RecipeCard } from 'components/explore/RecipeCard';
import CreationLoadingOverlay from 'components/recipeCreation/CreationLoadingOverlay';
import IngredientTile from 'components/recipeCreation/IngredientTile';
import { IngredientsLoadError } from 'components/recipeCreation/IngredientsLoadError';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { router, useLocalSearchParams } from 'expo-router';
import { useIngredients } from 'hooks/useIngredients';
import { useRecipeCreation } from 'hooks/useRecipeCreation';
import { useExcludedIngredients, useRecommend } from 'hooks/useRecommend';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { IngredientRecord } from 'types/recipe';
import {
  type Cuisine,
  type MaxMinutes,
  type Meal,
  type Method,
  RECOMMEND_LOCKED_MESSAGE,
  type RecommendConditions,
} from 'types/recommend';
import { getWeekAndDay } from 'utils/date';
import { searchIngredients } from 'utils/ingredientSearch';
import { requireOnline } from 'utils/network';
import {
  availableMeals,
  buildRecipeCommand,
  CUISINE_OPTIONS,
  isRecommendLocked,
  isZeroCarbMeal,
  MAX_EXCLUDE,
  MAX_MINUTES_OPTIONS,
  MAX_MUST_INCLUDE,
  MEAL_LABELS,
  mergeSavedExclude,
  METHOD_OPTIONS,
  parseMealParam,
  recipeWeekOf,
  removeCarbMustInclude,
  SPICY_OPTIONS,
  toRecommendRequest,
} from 'utils/recommendForm';
import { showInfoToast } from 'utils/showToast';

type PickerMode = 'must' | 'exclude';

const ANY_LABEL = '상관없음';

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

const Header = () => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">맞춤 레시피 추천</Text>
  </View>
);

// 하나만 고르는 조건 칩 줄. "상관없음"(null) 포함
function OptionChips<T extends string | number | boolean>({
  title,
  options,
  value,
  onChange,
  disabled,
}: {
  title: string;
  options: { value: T; label: string; enabled?: boolean }[];
  value: T | null;
  onChange(value: T | null): void;
  disabled: boolean;
}) {
  const items: { value: T | null; label: string; enabled: boolean }[] = [
    { value: null, label: ANY_LABEL, enabled: true },
    ...options.map((o) => ({ value: o.value, label: o.label, enabled: o.enabled !== false })),
  ];
  return (
    <View className="gap-2">
      <Text className="font-bold text-neutral-700">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => {
          const selected = item.value === value;
          const off = disabled || !item.enabled;
          return (
            <TouchableOpacity
              key={String(item.value)}
              disabled={off}
              onPress={() => onChange(item.value)}
              className={`rounded-full border px-3.5 py-2 ${
                selected ? 'border-green-600 bg-green-600' : 'border-neutral-300 bg-white'
              } ${!item.enabled ? 'opacity-40' : ''}`}>
              <Text className={selected ? 'font-bold text-white' : 'text-neutral-600'}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// 고른 재료 칩 (누르면 뺀다) + [추가]
function SelectedIngredients({
  names,
  tone,
  onRemove,
  onAdd,
  disabled,
}: {
  names: string[];
  tone: PickerMode;
  onRemove(name: string): void;
  onAdd(): void;
  disabled: boolean;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {names.map((name) => (
        <Chip
          key={name}
          value={name}
          rippleColor={colors.transparent}
          outerClassName={tone === 'must' ? 'border-green-600' : 'border-red-400'}
          onPress={disabled ? undefined : () => onRemove(name)}
        />
      ))}
      <TouchableOpacity
        disabled={disabled}
        onPress={onAdd}
        className="flex-row items-center gap-1 rounded-full border border-dashed border-neutral-400 px-3 py-2">
        <MaterialIcons name="add" size={16} color={colors.neutral[500]} />
        <Text className="text-neutral-500">재료 고르기</Text>
      </TouchableOpacity>
    </View>
  );
}

// 재료 고르기 모달 (제작 화면과 같은 재료 동그라미 + 검색)
function IngredientPicker({
  mode,
  ingredients,
  selected,
  blocked,
  userWeek,
  zeroCarb,
  isLoading,
  isError,
  onRetry,
  onToggle,
  onClose,
}: {
  mode: PickerMode | null;
  ingredients: IngredientRecord[];
  selected: string[];
  // 다른 목록에서 이미 고른 재료 (꼭 넣을 재료와 뺄 재료는 겹칠 수 없다)
  blocked: string[];
  userWeek: number;
  zeroCarb: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry(): void;
  onToggle(ingredient: IngredientRecord): void;
  onClose(): void;
}) {
  const [keyword, setKeyword] = useState('');
  const list = useMemo(() => searchIngredients(ingredients, keyword), [ingredients, keyword]);

  useEffect(() => {
    if (!mode) setKeyword('');
  }, [mode]);

  const isMust = mode === 'must';

  return (
    <Modal transparent visible={!!mode} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="h-[80%] w-full gap-3 rounded-2xl bg-white p-5">
          <Text className="text-center text-lg font-semibold">
            {isMust ? `꼭 넣을 재료 (최대 ${MAX_MUST_INCLUDE}개)` : '빼고 싶은 재료'}
          </Text>
          <SearchInput
            keyword={keyword}
            onChangeText={setKeyword}
            placeholder="재료를 검색하세요!"
          />
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={colors.green[600]} />
            </View>
          ) : isError && ingredients.length === 0 ? (
            <IngredientsLoadError onRetry={onRetry} />
          ) : (
            <FlatList
              className="flex-1"
              data={list}
              numColumns={3}
              keyExtractor={(item) => item.name}
              columnWrapperClassName="justify-around"
              keyboardShouldPersistTaps="handled"
              extraData={`${selected.join(',')}|${blocked.join(',')}`}
              ListEmptyComponent={
                <Text className="py-6 text-center text-neutral-400">찾는 재료가 없어요</Text>
              }
              renderItem={({ item }) => {
                const isCarbBlocked = isMust && zeroCarb && !!item.isCarbohydrate;
                return (
                  <IngredientTile
                    name={item.name}
                    image={item.image}
                    isSelected={selected.includes(item.name)}
                    disabled={
                      blocked.includes(item.name) ||
                      isCarbBlocked ||
                      (isMust && item.week > userWeek)
                    }
                    tone={isMust ? 'zero' : 'exclude'}
                    overlayLabel={isCarbBlocked ? '저탄수' : undefined}
                    onPress={() => onToggle(item)}
                  />
                );
              }}
            />
          )}
          <RippleButton
            className="w-full rounded-lg bg-green-600 py-3"
            rippleColor={colors.green[700]}
            onPress={onClose}>
            <Text className="text-center text-base font-semibold text-white">
              완료 ({selected.length})
            </Text>
          </RippleButton>
        </View>
      </View>
    </Modal>
  );
}

export default function RecommendScreen() {
  const startDate = useUserStore((state) => state.start_date);
  const { week, day } = getWeekAndDay(startDate);
  const locked = isRecommendLocked(week, day);
  const mealOptions = availableMeals(week, day);

  // Plan C 주간 리포트의 [추천 보기]가 /recommend?meal=dinner로 들어온다
  const { meal: mealParam } = useLocalSearchParams<{ meal?: string }>();
  const initialMeal = parseMealParam(mealParam);

  const [spicy, setSpicy] = useState<boolean | null>(null);
  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [maxMinutes, setMaxMinutes] = useState<MaxMinutes | null>(null);
  const [meal, setMeal] = useState<Meal | null>(null);
  // 끼니 미리 채우기. 오늘 쉐이크인 끼니면 채우지 않는다 (화면이 열린 채 다시 들어와도 반영)
  useEffect(() => {
    if (!initialMeal) return;
    if (availableMeals(week, day).find((m) => m.meal === initialMeal)?.enabled) {
      setMeal(initialMeal);
    }
  }, [initialMeal, week, day]);
  const [mustInclude, setMustInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [picker, setPicker] = useState<PickerMode | null>(null);

  const {
    ingredients,
    isLoading: isIngredientsLoading,
    isError: isIngredientsError,
    refetch: refetchIngredients,
  } = useIngredients();
  const excluded = useExcludedIngredients();
  const { result, isLoading: isRecommending, recommend } = useRecommend();

  // 저장된 빼고 싶은 재료가 오면 한 번 채운다. 그 전에 고쳤으면 합집합 (고친 것을 덮지 않는다)
  const excludeTouched = useRef(false);
  const savedMerged = useRef(false);
  useEffect(() => {
    if (!excluded.isLoaded || !excluded.saved || savedMerged.current) return;
    savedMerged.current = true;
    const saved = excluded.saved;
    setExclude((current) => mergeSavedExclude(current, saved, excludeTouched.current));
  }, [excluded.isLoaded, excluded.saved]);

  // 무탄수 끼니가 되면 꼭 넣을 재료에서 탄수화물 재료를 뺀다
  const zeroCarb = isZeroCarbMeal(meal, week, day);
  useEffect(() => {
    const { kept, removed } = removeCarbMustInclude(mustInclude, ingredients, zeroCarb);
    if (removed.length === 0) return;
    setMustInclude(kept);
    showInfoToast({ textType: 'CUSTOM', title: '무탄수 끼니라 탄수화물 재료는 뺐어요' });
  }, [zeroCarb, ingredients, mustInclude]);

  const conditions: RecommendConditions = {
    spicy,
    cuisine,
    method,
    maxMinutes,
    meal,
    mustInclude,
    exclude,
  };

  // [이 조건으로 새로 만들기]: 누를 때의 주차·일차로 명령문을 만든다
  const creation = useRecipeCreation(() => {
    const now = getWeekAndDay(useUserStore.getState().start_date);
    const { command, isZeroCarb } = buildRecipeCommand(conditions, now);
    return { command, week: recipeWeekOf(now.week), isZeroCarb };
  });
  const { quotaGate } = creation;

  const busy = isRecommending || creation.isCreating;
  // [저장]은 "다음에도 기억"만 뜻한다. 저장 목록을 받기 전에는 덮어쓰지 않도록 막는다
  const excludeDirty = excluded.isLoaded && !sameList(exclude, excluded.saved ?? []);
  const saveDisabled = !excludeDirty || excluded.isSaving || busy;

  // 추천·새로 만들기 모두 화면의 목록을 쓴다. 저장 목록을 받기 전에는 손댔으면 서버가 합치고(mergeSaved),
  // 손대지 않았으면 서버의 저장 목록에 맡긴다
  const handleRecommend = requireOnline(async () => {
    const outcome = await recommend(
      toRecommendRequest(conditions, {
        savedLoaded: excluded.isLoaded,
        touched: excludeTouched.current,
      })
    );
    if (outcome === 'shake') setMeal(null);
  });

  const handleSaveExclude = requireOnline(() => excluded.save(exclude));

  const toggleIngredient = (ingredient: IngredientRecord) => {
    const name = ingredient.name;
    if (picker === 'must') {
      if (mustInclude.includes(name)) {
        setMustInclude(mustInclude.filter((n) => n !== name));
      } else if (mustInclude.length >= MAX_MUST_INCLUDE) {
        showInfoToast({
          textType: 'CUSTOM',
          title: `꼭 넣을 재료는 최대 ${MAX_MUST_INCLUDE}개까지 고를 수 있어요`,
        });
      } else {
        setMustInclude([...mustInclude, name]);
      }
    } else if (picker === 'exclude') {
      excludeTouched.current = true;
      if (exclude.includes(name)) {
        setExclude(exclude.filter((n) => n !== name));
      } else if (exclude.length >= MAX_EXCLUDE) {
        showInfoToast({
          textType: 'CUSTOM',
          title: `빼고 싶은 재료는 최대 ${MAX_EXCLUDE}개까지 고를 수 있어요`,
        });
      } else {
        setExclude([...exclude, name]);
      }
    }
  };

  if (locked) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-50">
        <Header />
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <MaterialIcons name="lock-clock" size={32} color={colors.green[600]} />
          </View>
          <Text className="text-center text-lg font-bold text-neutral-800">
            {RECOMMEND_LOCKED_MESSAGE}
          </Text>
          <Text className="text-center text-neutral-500">지금은 모든 끼니가 프로틴쉐이크예요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const disabledMeals = mealOptions.filter((m) => !m.enabled);
  const noMatches = result !== null && result.recipes.length === 0;

  const createButton = (
    <View className="gap-1">
      <RippleButton
        outerClassName={noMatches ? 'bg-green-600' : 'border border-green-600 bg-white'}
        rounded="lg"
        className={noMatches ? 'w-full py-5' : 'w-full py-3.5'}
        rippleColor={noMatches ? colors.green[700] : colors.green[100]}
        disabled={busy}
        onPress={creation.create}>
        <Text
          className={
            noMatches ? 'text-lg font-bold text-white' : 'text-base font-bold text-green-600'
          }>
          이 조건으로 새로 만들기
        </Text>
      </RippleButton>
      {quotaGate.remainingText && (
        <View className="items-center gap-0.5">
          <Text className="text-sm text-neutral-500">{quotaGate.remainingText}</Text>
          {quotaGate.adBonusText && (
            <Text className="text-xs text-green-600">{quotaGate.adBonusText}</Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <Header />
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
        <Text className="text-base text-neutral-600">
          먹고 싶은 것을 고르면 지금 주차에 맞는 레시피를 골라 드려요.
        </Text>

        <View className="gap-5">
          <View className="gap-2">
            <OptionChips<Meal>
              title="끼니"
              options={mealOptions.map((m) => ({
                value: m.meal,
                label: MEAL_LABELS[m.meal],
                enabled: m.enabled,
              }))}
              value={meal}
              onChange={setMeal}
              disabled={busy}
            />
            {disabledMeals.length > 0 && (
              <Text className="text-xs text-neutral-400">
                {disabledMeals.map((m) => MEAL_LABELS[m.meal]).join('·')}: {disabledMeals[0].reason}
              </Text>
            )}
          </View>
          <OptionChips<boolean>
            title="맛"
            options={SPICY_OPTIONS}
            value={spicy}
            onChange={setSpicy}
            disabled={busy}
          />
          <OptionChips<Cuisine>
            title="종류"
            options={CUISINE_OPTIONS}
            value={cuisine}
            onChange={setCuisine}
            disabled={busy}
          />
          <OptionChips<Method>
            title="요리 방식"
            options={METHOD_OPTIONS}
            value={method}
            onChange={setMethod}
            disabled={busy}
          />
          <OptionChips<MaxMinutes>
            title="조리 시간"
            options={MAX_MINUTES_OPTIONS}
            value={maxMinutes}
            onChange={setMaxMinutes}
            disabled={busy}
          />

          <View className="gap-2">
            <Text className="font-bold text-neutral-700">
              꼭 넣을 재료{' '}
              <Text className="text-sm font-normal text-neutral-400">
                최대 {MAX_MUST_INCLUDE}개
              </Text>
            </Text>
            <SelectedIngredients
              names={mustInclude}
              tone="must"
              disabled={busy}
              onAdd={() => setPicker('must')}
              onRemove={(name) => setMustInclude(mustInclude.filter((n) => n !== name))}
            />
          </View>

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-neutral-700">빼고 싶은 재료</Text>
              <RippleButton
                outerClassName={`bg-green-600 ${saveDisabled ? 'opacity-40' : ''}`}
                rounded="lg"
                className="px-3 py-1.5"
                disabled={saveDisabled}
                onPress={handleSaveExclude}>
                <Text className="text-sm font-bold text-white">저장</Text>
              </RippleButton>
            </View>
            <SelectedIngredients
              names={exclude}
              tone="exclude"
              disabled={busy}
              onAdd={() => setPicker('exclude')}
              onRemove={(name) => {
                excludeTouched.current = true;
                setExclude(exclude.filter((n) => n !== name));
              }}
            />
            <Text className="text-xs text-neutral-400">저장하면 다음에도 빼고 추천해요</Text>
          </View>
        </View>

        <RippleButton
          outerClassName={`bg-green-600 ${busy ? 'opacity-50' : ''}`}
          rounded="lg"
          className="w-full py-4"
          disabled={busy}
          onPress={handleRecommend}>
          <Text className="text-lg font-bold text-white">추천 받기</Text>
        </RippleButton>

        {result && (
          <View className="gap-4">
            {noMatches ? (
              <View className="items-center gap-1 py-4">
                <Text className="text-base font-bold text-neutral-700">
                  조건에 맞는 레시피가 없어요
                </Text>
                <Text className="text-sm text-neutral-500">
                  같은 조건으로 새 레시피를 만들어 보세요
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-lg font-bold text-neutral-800">
                  추천 레시피{' '}
                  <Text className="text-sm font-normal text-neutral-400">
                    맞는 레시피 {result.totalMatches}개 중
                  </Text>
                </Text>
                {result.recipes.map((recipe) => (
                  <RecipeCard key={recipe.id} {...recipe} />
                ))}
                <RippleButton
                  outerClassName="border border-neutral-300 bg-white"
                  rounded="lg"
                  className="w-full flex-row gap-1 py-3.5"
                  rippleColor={colors.neutral[200]}
                  disabled={busy}
                  onPress={handleRecommend}>
                  <MaterialIcons name="refresh" size={20} color={colors.neutral[600]} />
                  <Text className="text-base font-bold text-neutral-600">다른 추천 보기</Text>
                </RippleButton>
              </>
            )}
            {createButton}
          </View>
        )}
      </ScrollView>

      {isRecommending && (
        <View className="absolute inset-0 z-50 items-center justify-center gap-3 bg-black/40">
          <ActivityIndicator size={56} color={colors.white} />
          <Text className="font-bold text-white">추천 레시피를 고르는 중...</Text>
        </View>
      )}
      {creation.isCreating && <CreationLoadingOverlay showTabTip={false} />}

      <IngredientPicker
        mode={picker}
        ingredients={ingredients}
        selected={picker === 'must' ? mustInclude : exclude}
        blocked={picker === 'must' ? exclude : mustInclude}
        userWeek={week}
        zeroCarb={zeroCarb}
        isLoading={isIngredientsLoading}
        isError={isIngredientsError}
        onRetry={refetchIngredients}
        onToggle={toggleIngredient}
        onClose={() => setPicker(null)}
      />
      <QuotaExceededModal {...creation.quotaModalProps} />
    </SafeAreaView>
  );
}
