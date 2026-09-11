export type RunbookStepType = 'CHECK' | 'MANUAL_ACTION' | 'VALIDATION' | 'REFERENCE';
export type RunbookExecutionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type RunbookExecutionStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface RunbookStep {
  id: string;
  runbookId: string;
  order: number;
  title: string;
  instruction: string;
  stepType: RunbookStepType;
  requiresConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Runbook {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  severity?: string | null;
  tags: string[];
  isActive: boolean;
  createdByMembershipId?: string | null;
  steps: RunbookStep[];
  createdAt: string;
  updatedAt: string;
}

export interface RunbookExecutionStep {
  id: string;
  executionId: string;
  runbookStepId: string;
  status: RunbookExecutionStepStatus;
  completedByMembershipId?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
  note?: string | null;
  step?: RunbookStep | null;
  runbookStep?: RunbookStep | null;
  completedBy?: any | null;
}

export interface RunbookExecution {
  id: string;
  organizationId: string;
  incidentId: string;
  runbookId: string;
  status: RunbookExecutionStatus;
  startedByMembershipId?: string | null;
  startedByName?: string | null;
  startedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  runbook?: Runbook | null;
  steps: RunbookExecutionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunbookDto {
  name: string;
  description?: string;
  serviceId?: string;
  severity?: string;
  tags?: string[];
  steps: {
    order: number;
    title: string;
    instruction: string;
    stepType?: RunbookStepType;
    requiresConfirmation?: boolean;
  }[];
}

export interface UpdateRunbookDto {
  name?: string;
  description?: string;
  serviceId?: string;
  severity?: string;
  tags?: string[];
  isActive?: boolean;
  steps?: {
    id?: string;
    order: number;
    title: string;
    instruction: string;
    stepType?: RunbookStepType;
    requiresConfirmation?: boolean;
  }[];
}

