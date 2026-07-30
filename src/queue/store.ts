import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { createLeadsRepo, type LeadsRepo } from "./leads-repo.js";

export { dedupeKey } from "./dedupe.js";
export type { Stats } from "./leads-repo.js";

/**
 * The bot's binding of the shared queue repository: opens the DB at config.dbPath
 * (relative to the bot's cwd) and delegates every query to createLeadsRepo, which the
 * dashboard also uses against the same file.
 */
let _repo: LeadsRepo | null = null;
function repo(): LeadsRepo {
  if (_repo) return _repo;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  _repo = createLeadsRepo(new Database(config.dbPath));
  return _repo;
}

export const upsertLeads: LeadsRepo["upsertLeads"] = (...a) => repo().upsertLeads(...a);
export const listLeads: LeadsRepo["listLeads"] = (...a) => repo().listLeads(...a);
export const getLead: LeadsRepo["getLead"] = (...a) => repo().getLead(...a);
export const setStatus: LeadsRepo["setStatus"] = (...a) => repo().setStatus(...a);
export const purgeOldRejects: LeadsRepo["purgeOldRejects"] = (...a) => repo().purgeOldRejects(...a);
export const stats: LeadsRepo["stats"] = (...a) => repo().stats(...a);
export const getCursor: LeadsRepo["getCursor"] = (...a) => repo().getCursor(...a);
export const setCursor: LeadsRepo["setCursor"] = (...a) => repo().setCursor(...a);
