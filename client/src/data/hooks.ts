import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepository } from './DataProvider';
import type { DateRange } from './repository';
import type { BodyweightEntry, Exercise, Goal, ID, Plan, PlannedBlock, WorkoutSession } from './types';

// Writes. Each one refreshes the reads it affects.

export function useSaveSession() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (session: WorkoutSession) => repo.saveSession(session),
    onSuccess: () =>
      Promise.all(['sessions', 'occurrences', 'personalRecords', 'streak'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useUpdatePlanWorkout() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { planId: ID; workoutId: ID; blocks: PlannedBlock[] }) => repo.updatePlanWorkout(input.planId, input.workoutId, input.blocks),
    onSuccess: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useSavePlan() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (plan: Plan) => repo.savePlan(plan),
    onSuccess: () => Promise.all(['plans', 'occurrences'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useDeletePlan() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (planId: ID) => repo.deletePlan(planId),
    onSuccess: () => Promise.all(['plans', 'occurrences'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useSaveExercise() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (exercise: Exercise) => repo.saveExercise(exercise),
    onSuccess: () => client.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

export function useSaveGoal() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (goal: Goal) => repo.saveGoal(goal),
    onSuccess: () => Promise.all(['goals', 'streak'].map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useDeleteGoal() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (goalId: ID) => repo.deleteGoal(goalId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useSaveBodyweight() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entry: BodyweightEntry) => repo.saveBodyweight(entry),
    onSuccess: () => client.invalidateQueries({ queryKey: ['bodyweight'] }),
  });
}

export function useDeleteBodyweight() {
  const repo = useRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entryId: ID) => repo.deleteBodyweight(entryId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['bodyweight'] }),
  });
}

// Reads. One hook per repository read; screens use these and never touch the repository directly.

export function usePreferences() {
  const repo = useRepository();
  return useQuery({ queryKey: ['preferences'], queryFn: () => repo.getPreferences() });
}

export function useExercises() {
  const repo = useRepository();
  return useQuery({ queryKey: ['exercises'], queryFn: () => repo.listExercises() });
}

export function useExercise(id: ID) {
  const repo = useRepository();
  return useQuery({ queryKey: ['exercises', id], queryFn: async () => (await repo.getExercise(id)) ?? null });
}

export function usePlans() {
  const repo = useRepository();
  return useQuery({ queryKey: ['plans'], queryFn: () => repo.listPlans() });
}

export function usePlan(id: ID) {
  const repo = useRepository();
  return useQuery({ queryKey: ['plans', id], queryFn: async () => (await repo.getPlan(id)) ?? null });
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

export function useBadges() {
  const repo = useRepository();
  return useQuery({ queryKey: ['badges'], queryFn: () => repo.listBadges() });
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
