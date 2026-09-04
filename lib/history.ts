import { ViewportState } from './types';

export interface HistoryEntry {
  fileContent: string;
  viewport: ViewportState;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
  }

  public push(entry: HistoryEntry): void {
    // Avoid pushing duplicate identical states
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.fileContent === entry.fileContent) {
      return;
    }

    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(current: HistoryEntry): HistoryEntry | null {
    if (!this.canUndo()) return null;
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(current);
    return previous;
  }

  public redo(current: HistoryEntry): HistoryEntry | null {
    if (!this.canRedo()) return null;
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    return next;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
