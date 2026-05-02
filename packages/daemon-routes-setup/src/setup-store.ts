import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CreateSetupRunInput,
  SetupChapter,
  SetupCommentInput,
  SetupPhase,
  SetupQuestion,
  SetupRun,
  SetupRunMode,
  SetupRunStatus,
  ReadinessVerdict,
} from "./setup-types.ts";
import { SetupRunNotFoundError, SetupRunNotActiveError } from "./setup-types.ts";

const RUN_FILENAME = "run.json";

export type SetupStoreDeps = {
  readonly stateDir: string;
};

/**
 * Manages setup run lifecycle persisted to disk under stateDir/setup_runs/<id>/.
 * Follows the setup.md contract: state is durable across daemon restarts.
 */
export class SetupStore {
  private readonly runsDir: string;

  constructor(private readonly deps: SetupStoreDeps) {
    this.runsDir = join(deps.stateDir, "setup_runs");
    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }
  }

  private runDir(id: string): string {
    return join(this.runsDir, id);
  }

  private runPath(id: string): string {
    return join(this.runDir(id), RUN_FILENAME);
  }

  private read(id: string): SetupRun {
    const p = this.runPath(id);
    if (!existsSync(p)) throw new SetupRunNotFoundError(id);
    return JSON.parse(readFileSync(p, "utf-8")) as SetupRun;
  }

  private write(run: SetupRun): void {
    const dir = this.runDir(run.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.runPath(run.id), JSON.stringify(run, null, 2), "utf-8");
  }

  create(input: CreateSetupRunInput): SetupRun {
    const id = `setup_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const mode: SetupRunMode = input.mode ?? "standalone";
    const run: SetupRun = {
      id,
      projectId: null,
      absPath: input.absPath,
      mode,
      status: "active",
      phase: "discovery",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      verdict: "unresolved",
      findings: {},
      questions: [],
      chapters: [],
      nonInteractive: input.nonInteractive ?? false,
      flags: input.flags ?? {},
    };
    this.write(run);
    return run;
  }

  list(): SetupRun[] {
    if (!existsSync(this.runsDir)) return [];
    const entries = readdirSync(this.runsDir);
    const runs: SetupRun[] = [];
    for (const entry of entries) {
      if (!entry.startsWith("setup_")) continue;
      try {
        runs.push(this.read(entry));
      } catch {
        // corrupted — skip
      }
    }
    // Most recently updated first
    return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): SetupRun {
    return this.read(id);
  }

  updatePhase(id: string, phase: SetupPhase): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = { ...run, phase, updatedAt: now };
    this.write(updated);
    return updated;
  }

  updateVerdict(id: string, verdict: ReadinessVerdict): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = { ...run, verdict, updatedAt: now };
    this.write(updated);
    return updated;
  }

  addQuestion(id: string, question: SetupQuestion): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = {
      ...run,
      questions: [...run.questions, question],
      updatedAt: now,
    };
    this.write(updated);
    return updated;
  }

  answerQuestion(id: string, questionId: string, value: string): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const questions = run.questions.map((q) =>
      q.id === questionId ? { ...q, answer: value, answeredAt: now } : q,
    );
    const updated: SetupRun = { ...run, questions, updatedAt: now };
    this.write(updated);
    return updated;
  }

  addChapter(id: string, chapter: SetupChapter): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = {
      ...run,
      chapters: [...run.chapters, chapter],
      updatedAt: now,
    };
    this.write(updated);
    return updated;
  }

  addComment(id: string, comment: SetupCommentInput): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    // Comments are stored in the chapters array by appending a synthetic chapter entry.
    // In a fuller implementation this would be a separate comments array.
    const chapter: SetupChapter = {
      id: `comment_${crypto.randomUUID().slice(0, 8)}`,
      title: `Comment on ${comment.target_type}: ${comment.target_id}`,
      body: comment.body,
      status: "draft",
      artifactRefs: comment.artifact_refs ?? [],
    };
    const updated: SetupRun = { ...run, chapters: [...run.chapters, chapter], updatedAt: now };
    this.write(updated);
    return updated;
  }

  setProjectId(id: string, projectId: string): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = { ...run, projectId, updatedAt: now };
    this.write(updated);
    return updated;
  }

  complete(id: string): SetupRun {
    const run = this.read(id);
    if (run.status !== "active") throw new SetupRunNotActiveError(id, run.status);
    const now = new Date().toISOString();
    const updated: SetupRun = {
      ...run,
      status: "completed",
      phase: "completed",
      verdict: "resolved",
      completedAt: now,
      updatedAt: now,
    };
    this.write(updated);
    return updated;
  }

  fail(id: string): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = {
      ...run,
      status: "failed",
      completedAt: now,
      updatedAt: now,
    };
    this.write(updated);
    return updated;
  }

  abandon(id: string): SetupRun {
    const run = this.read(id);
    const now = new Date().toISOString();
    const updated: SetupRun = {
      ...run,
      status: "abandoned",
      completedAt: now,
      updatedAt: now,
    };
    this.write(updated);
    return updated;
  }

  delete(id: string): void {
    const dir = this.runDir(id);
    if (!existsSync(dir)) return;
    const p = this.runPath(id);
    if (existsSync(p)) unlinkSync(p);
  }
}
