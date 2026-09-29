/**
 * Internship (OJT placement) use cases.
 *
 * A user has at most one *active* placement at a time, so creating a new one
 * archives the previous inside the same transaction.
 */

import type { Internship, NewInternship } from '@/types';
import { getDatabase } from '@/database/database';
import * as queries from '@/database/queries';
import { round2 } from '@/utils/timeCalculator';

export interface CreateInternshipInput {
  user_id: number;
  company_name: string;
  position: string;
  required_hours: number;
  start_date: string;
  end_date?: string | null;
}

export const createInternship = async (input: CreateInternshipInput): Promise<number> => {
  const db = await getDatabase();

  if (!(input.required_hours > 0)) {
    throw new Error('Required hours must be greater than zero.');
  }
  if (input.end_date && input.end_date < input.start_date) {
    throw new Error('The end date cannot be before the start date.');
  }

  const row: NewInternship = {
    user_id: input.user_id,
    company_name: input.company_name.trim(),
    position: input.position.trim(),
    required_hours: round2(input.required_hours),
    start_date: input.start_date,
    end_date: input.end_date || null,
  };

  // `withExclusiveTransactionAsync` takes a `Promise<void>` callback, so the new
  // id is captured in a closure rather than returned from the transaction.
  let newId = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await queries.archiveOtherInternships(txn, input.user_id);
    newId = await queries.insertInternship(txn, row);
  });

  return newId;
};

export const getActiveInternship = async (userId: number): Promise<Internship | null> => {
  const db = await getDatabase();
  return queries.getActiveInternship(db, userId);
};

export const listInternships = async (userId: number): Promise<Internship[]> => {
  const db = await getDatabase();
  return queries.listInternships(db, userId);
};

export const updateInternship = async (
  id: number,
  fields: Omit<CreateInternshipInput, 'user_id'>,
): Promise<void> => {
  const db = await getDatabase();

  if (!(fields.required_hours > 0)) {
    throw new Error('Required hours must be greater than zero.');
  }
  if (fields.end_date && fields.end_date < fields.start_date) {
    throw new Error('The end date cannot be before the start date.');
  }

  await queries.updateInternship(db, id, {
    company_name: fields.company_name.trim(),
    position: fields.position.trim(),
    required_hours: round2(fields.required_hours),
    start_date: fields.start_date,
    end_date: fields.end_date || null,
  });
};

/** Mark the placement finished without deleting its history. */
export const closeInternship = async (id: number, endDate: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE internships SET is_active = 0, end_date = ? WHERE id = ?',
    endDate,
    id,
  );
};

/** Cascade deletes every time record. Requires a confirmation step in the UI. */
export const deleteInternship = async (id: number): Promise<void> => {
  const db = await getDatabase();
  await queries.deleteInternship(db, id);
};
