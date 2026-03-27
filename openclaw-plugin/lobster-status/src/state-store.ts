import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { LobsterSnapshot } from "./types.js";

export class StateStore {
  private snapshot: LobsterSnapshot | null = null;
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath || path.join(os.homedir(), ".openclaw", "lobster-status", "state.json");
    this.load();
  }

  private ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.snapshot = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
    } catch {
      this.snapshot = null;
    }
  }

  get(): LobsterSnapshot | null {
    return this.snapshot;
  }

  set(snapshot: LobsterSnapshot) {
    this.snapshot = snapshot;
    try {
      this.ensureDir();
      fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
    } catch {
      // ignore for v1
    }
  }
}
