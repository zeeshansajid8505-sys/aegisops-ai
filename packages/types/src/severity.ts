export type SeverityLevel = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

export interface SeverityDefinition {
  level: SeverityLevel;
  label: string;
  description: string;
  targetMttaMinutes: number;
  targetMttrMinutes: number;
}
