import "server-only";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLeadsRepo, type LeadsRepo } from "@bot/queue/leads-repo";

// Domain types and every query live in the bot's src/ (single source of truth); the
// dashboard only supplies the DB path. Re-exported so existing `@/lib/db` imports work.
export type { LeadStatus, QueuedLead } from "@bot/types";
export type { Stats } from "@bot/queue/leads-repo";

// The dashboard reads the SAME queue the bot writes: ../data/thc-bot.sqlite
const DB_PATH = process.env.THC_DB_PATH || join(process.cwd(), "..", "data", "thc-bot.sqlite");

let _repo: LeadsRepo | null = null;
function repo(): LeadsRepo {
  if (_repo) return _repo;
  // fileMustExist: false — the dashboard may start before the bot's first ingest;
  // createLeadsRepo applies the shared schema so the pages work against an empty DB.
  _repo = createLeadsRepo(new Database(DB_PATH, { fileMustExist: false }));
  return _repo;
}

export const listLeads: LeadsRepo["listLeads"] = (...a) => repo().listLeads(...a);
export const getLead: LeadsRepo["getLead"] = (...a) => repo().getLead(...a);
export const setStatus: LeadsRepo["setStatus"] = (...a) => repo().setStatus(...a);
export const purgeOldRejects: LeadsRepo["purgeOldRejects"] = (...a) => repo().purgeOldRejects(...a);
export const stats: LeadsRepo["stats"] = (...a) => repo().stats(...a);
