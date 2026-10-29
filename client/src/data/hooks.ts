import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useRepository } from './DataProvider';
import { invalidateAfter, invalidateKeys, preferencesSaveInvalidates } from './invalidation';
import type { DateRange } from './repository';
import type { BodyweightEntry, Exercise, Goal, ID, Plan, PlannedBlock, Preferences, WorkoutSession } from './types';

// Writes. Each one refreshes the reads it affects, as listed in invalidation.ts. A failed write shows
// its `meta.errorMessage` as an error toast (see SaveErrorToasts), so call sites only decide whether
// to carry on.

/** Awaits a write and reports whether it worked. The error toast is already handled. */
export async function succeeded(write: Promise<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch {
    return false;
  }
}

export function useSaveSession() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save your workout. It's still open, so nothing is lost. Try again." },
    mutationFn: (session: WorkoutSession) => repo.saveSession(session),
    onSuccess: () => invalidateAfter(client, 'saveSession'),
  });
}

export function useDeleteSession() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the workout. Try again." },
    mutationFn: (sessionId: ID) => repo.deleteSession(sessionId),
    onSuccess: () => invalidateAfter(client, 'deleteSession'),
  });
}

export function useUpdatePlanWorkout() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't update your plan. Try again." },
    mutationFn: (input: { planId: ID; workoutId: ID; blocks: PlannedBlock[] }) => repo.updatePlanWorkout(input.planId, input.workoutId, input.blocks),
    onSuccess: () => invalidateAfter(client, 'updatePlanWorkout'),
  });
}

export function useSavePlan() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save your plan. Try again." },
    mutationFn: (plan: Plan) => repo.savePlan(plan),
    onSuccess: () => invalidateAfter(client, 'savePlan'),
  });
}

export function useDeletePlan() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the plan. Try again." },
    mutationFn: (planId: ID) => repo.deletePlan(planId),
    onSuccess: () => invalidateAfter(client, 'deletePlan'),
  });
}

export function useSaveExercise() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save the exercise. Try again." },
    mutationFn: (exercise: Exercise) => repo.saveExercise(exercise),
    onSuccess: () => invalidateAfter(client, 'saveExercise'),
  });
}

export function useSaveGoal() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save your goal. Try again." },
    mutationFn: (goal: Goal) => repo.saveGoal(goal),
    onSuccess: () => invalidateAfter(client, 'saveGoal'),
  });
}

export function useDeleteGoal() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the goal. Try again." },
    mutationFn: (goalId: ID) => repo.deleteGoal(goalId),
    onSuccess: () => invalidateAfter(client, 'deleteGoal'),
  });
}

export function useSaveBodyweight() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save your weight. Try again." },
    mutationFn: (entry: BodyweightEntry) => repo.saveBodyweight(entry),
    onSuccess: () => invalidateAfter(client, 'saveBodyweight'),
  });
}

export function useDeleteBodyweight() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the weigh-in. Try again." },
    mutationFn: (entryId: ID) => repo.deleteBodyweight(entryId),
    onSuccess: () => invalidateAfter(client, 'deleteBodyweight'),
  });
}

export function useDeleteRecordingVideo() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the video. Try again." },
    mutationFn: (recordingId: ID) => repo.deleteRecordingVideo(recordingId),
    onSuccess: () => invalidateAfter(client, 'deleteRecordingVideo'),
  });
}

export function useDeleteFormReport() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't delete the report. Try again." },
    mutationFn: (reportId: ID) => repo.deleteFormReport(reportId),
    onSuccess: () => invalidateAfter(client, 'deleteFormReport'),
  });
}

export function useSavePreferences() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save your settings. Try again." },
    mutationFn: (preferences: Preferences) => repo.savePreferences(preferences),
    // Optimistic: settings screens update instantly, and roll back if the save fails.
    onMutate: async (preferences) => {
      await client.cancelQueries({ queryKey: ['preferences'] });
      const previous = client.getQueryData<Preferences>(['preferences']);
      client.setQueryData(['preferences'], preferences);
      return { previous };
    },
    onError: (_error, _preferences, context) => context?.previous && client.setQueryData(['preferences'], context.previous),
    // The streak and badges only when the week start or units changed (not for a remembered rest).
    onSettled: (_data, _error, preferences, context) => invalidateKeys(client, preferencesSaveInvalidates(context?.previous, preferences)),
  });
}

// Reads. One hook per repository read; screens use these and never touch the repository directly.

export function usePreferences() {
  const repo = useRepository();
  return useQuery({ queryKey: ['preferences'], queryFn: () => repo.getPreferences() });
}

/**
 * Reads the preferences as the app has them this moment (with any optimistic save), or undefined
 * before they load. For a change built after an await or a timer: a render's `data` may be older
 * by then, and saving on top of it would undo whatever was saved in between.
 */
export function useLatestPreferences(): () => Preferences | undefined {
  const client = useQueryClient();
  return useCallback(() => client.getQueryData<Preferences>(['preferences']), [client]);
}

export function useExercises() {
  const repo = useRepository();
  return useQuery({ queryKey: ['exercises'], queryFn: () => repo.listExercises() });
}

export function useExercise(id: ID) {
  const repo = useRepository();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['exercises', id],
    queryFn: async () => (await repo.getExercise(id)) ?? null,
    // Start from the cached list when it has the item, so the screen opens without a loading flash.
    initialData: () => client.getQueryData<Exercise[]>(['exercises'])?.find((x) => x.id === id),
  });
}

export function usePlans() {
  const repo = useRepository();
  return useQuery({ queryKey: ['plans'], queryFn: () => repo.listPlans() });
}

export function usePlan(id: ID) {
  const repo = useRepository();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['plans', id],
    queryFn: async () => (await repo.getPlan(id)) ?? null,
    // Start from the cached list when it has the item, so the screen opens without a loading flash.
    initialData: () => client.getQueryData<Plan[]>(['plans'])?.find((x) => x.id === id),
  });
}

/** Pushes forward that haven't been undone (spec 2.5). */
export function usePlanShifts() {
  const repo = useRepository();
  return useQuery({ queryKey: ['planShifts'], queryFn: () => repo.listPlanShifts() });
}

export function usePushPlanForward() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't move your plan. Try again." },
    mutationFn: ({ occurrenceId, shiftId }: { occurrenceId: ID; shiftId: ID }) => repo.pushPlanForward(occurrenceId, shiftId),
    onSuccess: () => invalidateAfter(client, 'pushPlanForward'),
  });
}

export function useUndoPlanShift() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't undo the move. Try again." },
    mutationFn: (shiftId: ID) => repo.undoPlanShift(shiftId),
    onSuccess: () => invalidateAfter(client, 'undoPlanShift'),
  });
}

export function usePlanVersions() {
  const repo = useRepository();
  return useQuery({ queryKey: ['planVersions'], queryFn: () => repo.listPlanVersions() });
}

export function useTemplates() {
  const repo = useRepository();
  return useQuery({ queryKey: ['templates'], queryFn: () => repo.listTemplates() });
}

export function useOccurrences(range: DateRange) {
  const repo = useRepository();
  return useQuery({ queryKey: ['occurrences', range.from, range.to], queryFn: () => repo.listOccurrences(range) });
}

export function useSessions(range?: DateRange) {
  const repo = useRepository();
  return useQuery({ queryKey: ['sessions', range?.from, range?.to], queryFn: () => repo.listSessions(range) });
}

export function useSession(id: ID) {
  const repo = useRepository();
  return useQuery({ queryKey: ['sessions', 'byId', id], queryFn: async () => (await repo.getSession(id)) ?? null });
}

export function useBodyweight() {
  const repo = useRepository();
  return useQuery({ queryKey: ['bodyweight'], queryFn: () => repo.listBodyweight() });
}

export function usePersonalRecords(filter?: { exerciseId?: ID; since?: string }) {
  const repo = useRepository();
  return useQuery({ queryKey: ['personalRecords', filter?.exerciseId, filter?.since], queryFn: () => repo.listPersonalRecords(filter) });
}

export function useGoals() {
  const repo = useRepository();
  return useQuery({ queryKey: ['goals'], queryFn: () => repo.listGoals() });
}

/** Badges earned, progress toward the rest, and Next up, in one read. */
export function useBadges() {
  const repo = useRepository();
  return useQuery({ queryKey: ['badges'], queryFn: () => repo.getBadges() });
}

export function useStreak() {
  const repo = useRepository();
  return useQuery({ queryKey: ['streak'], queryFn: () => repo.getStreak() });
}

export function useFormReports(filter?: { exerciseId?: ID }) {
  const repo = useRepository();
  return useQuery({ queryKey: ['formReports', filter?.exerciseId], queryFn: () => repo.listFormReports(filter) });
}

export function useFormReport(id: ID) {
  const repo = useRepository();
  return useQuery({ queryKey: ['formReports', 'byId', id], queryFn: async () => (await repo.getFormReport(id)) ?? null });
}

export function useRecording(id: ID) {
  const repo = useRepository();
  return useQuery({ queryKey: ['recordings', id], queryFn: async () => (await repo.getRecording(id)) ?? null });
}
