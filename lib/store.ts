// In-memory database only. Nothing is ever written to disk: no db.json,
// no .data folder, no file on the server at all. The whole Db object lives
// in this module's memory for as long as the Node process runs, and is
// re-seeded from scratch whenever the process restarts or a new serverless
// instance is spun up. There is no route, file, or API that exposes it
// directly — every read/write goes through query()/mutate() below.
//
// This is fine for a demo or a single always-on server, but it means data
// does not survive a restart and is not shared between serverless instances.
// For real persistence, point query()/mutate() at a hosted database
// (Postgres, Supabase, Turso...) instead of the in-memory object; nothing
// elsewhere in the app needs to change, since callers only use query/mutate.
import { menuItems, type MenuItem } from '@/data/menu';
import { openingHours, type DayHours } from '@/data/hours';
import type { PayrollRecord, RestaurantSettings, StaffMember, StaffReview, Thread } from '@/lib/types';
import { team } from '@/data/site';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passHash: string;
  createdAt: string;
}

interface Db {
  menu: MenuItem[];
  hours: DayHours[];
  users: UserRecord[];
  threads: Thread[];
  staff: StaffMember[];
  staffReviews: StaffReview[];
  payroll: PayrollRecord[];
  settings: RestaurantSettings;
}

const FEATURED_SEED = new Set([4, 5, 1]);

const ALL_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SALARY_SEED: Record<string, number> = {
  'Head Chef & Co-founder': 4500,
  'General Manager & Co-founder': 4500,
  'Pastry Chef': 3000,
};

function seedStaff(): StaffMember[] {
  const dept = (role: string): StaffMember['department'] =>
    /manager/i.test(role) ? 'Management' : 'Kitchen';
  const base = team.map((t, i) => ({
    id: `staff-${i + 1}`,
    name: t.name,
    post: t.role,
    department: dept(t.role),
    email: `${t.name.split(' ')[0].toLowerCase()}@crunchs.com`,
    phone: '',
    baseSalary: SALARY_SEED[t.role] ?? 2500,
    shift: 'full' as const,
    workDays: ALL_WEEK.slice(0, 6),
    hiredAt: '2014-06-01',
    active: true,
    managerScore: 4,
  }));
  return [
    ...base,
    { id: 'staff-w1', name: 'Amara Bello', post: 'Waiter', department: 'Service', email: 'amara@crunchs.com', phone: '', baseSalary: 1800, shift: 'evening', workDays: ALL_WEEK.slice(1, 7), hiredAt: '2021-03-15', active: true, managerScore: 4 },
    { id: 'staff-w2', name: 'Tobias Klein', post: 'Waiter', department: 'Service', email: 'tobias@crunchs.com', phone: '', baseSalary: 1800, shift: 'morning', workDays: ALL_WEEK.slice(0, 5), hiredAt: '2022-09-01', active: true, managerScore: 3 },
    { id: 'staff-b1', name: 'Lena Fischer', post: 'Barista', department: 'Bar', email: 'lena@crunchs.com', phone: '', baseSalary: 1900, shift: 'morning', workDays: ALL_WEEK.slice(0, 6), hiredAt: '2020-01-20', active: true, managerScore: 4 },
  ];
}

function seed(): Db {
  return {
    menu: menuItems.map((m) => ({
      ...m,
      available: true,
      featured: FEATURED_SEED.has(m.id),
    })),
    hours: openingHours.map((h) => ({ ...h })),
    users: [],
    threads: [],
    staff: seedStaff(),
    staffReviews: [],
    payroll: [],
    settings: { serviceOpen: true, notice: '' },
  };
}

// The single in-memory store. Using `global` keeps it stable across Next.js
// dev-server hot reloads (which re-run this module); it is still only ever
// held in process memory, never written anywhere.
const globalForDb = globalThis as unknown as { __crunchsDb?: Db };
const db: Db = globalForDb.__crunchsDb ?? (globalForDb.__crunchsDb = seed());

// Serialises all writes so two requests can't race each other.
let lock: Promise<unknown> = Promise.resolve();

export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = lock.then(() => fn(db));
  lock = run.catch(() => undefined);
  return run;
}

export async function query<T>(fn: (db: Db) => T): Promise<T> {
  await lock;
  return fn(db);
}

// Convenience readers used by the public pages
export const getMenu = () => query((db) => db.menu);
export const getHours = () => query((db) => db.hours);
