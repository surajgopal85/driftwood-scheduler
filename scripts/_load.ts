import fs from "node:fs";
import type { Rule, Cost } from "../src/domain/types";
import { DEFAULT_WEIGHT, FOREVER } from "../src/domain/types";

export interface RuleFile {
  version: string;
  effectiveFrom: string;
  rules: Array<Omit<Rule, "id" | "supersedes" | "weight" | "effective" | "createdAt"> & { weight?: number; effectiveTo?: string }>;
}

export function readRuleFile(path: string): RuleFile {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/** The content signature: what makes two versions of a key "the same rule". */
export function contentSig(r: Pick<Rule, "kind" | "scope" | "pattern" | "bindingness" | "cost" | "overridableBy" | "weight" | "workerId">) {
  return JSON.stringify({ k: r.kind, s: r.scope, p: r.pattern ?? null, b: r.bindingness, c: r.cost, o: r.overridableBy, w: r.weight, wid: r.workerId });
}

export function materialize(entry: RuleFile["rules"][number], id: string, from: string, supersedes: string | null): Rule {
  return {
    id, key: entry.key, workerId: entry.workerId, supersedes,
    kind: entry.kind, scope: entry.scope, pattern: entry.pattern,
    bindingness: entry.bindingness, cost: entry.cost, overridableBy: entry.overridableBy,
    weight: entry.weight ?? DEFAULT_WEIGHT[entry.cost as Cost],
    effective: { from, to: entry.effectiveTo ?? FOREVER },
    source: entry.source, createdAt: new Date().toISOString(),
  };
}
