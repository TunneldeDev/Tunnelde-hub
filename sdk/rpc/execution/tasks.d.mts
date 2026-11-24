export type TaskStatus =
  "running" | "completed" | "cancelled" | "timedOut" | "failed" | "interrupted";

export interface TaskSnapshot {
  taskId: string;
  status: TaskStatus;
  exitCode: number | null;
  error: string | null;
  seq: number;
}

export interface TaskOutputEvent {
  taskId: string;
  seq: number;
  stream: "stdout" | "stderr" | "status";
  data: string;
  status: TaskStatus;
  exitCode: number | null;
}

export interface TaskOutput {
  taskId: string;
  events: TaskOutputEvent[];
  nextSeq: number;
  status: TaskStatus;
  exitCode: number | null;
  /** Host failure detail from the same snapshot; absent on older hosts. */
  error?: string | null;
  truncated: boolean;
}
