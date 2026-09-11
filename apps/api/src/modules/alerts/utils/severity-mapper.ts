import { AlertSeverity } from '@prisma/client';
import { SeverityLevel } from '@aegisops/types';

export function mapPrismaSeverityToType(severity: AlertSeverity): SeverityLevel {
  switch (severity) {
    case 'SEV_1':
      return 'SEV-1';
    case 'SEV_2':
      return 'SEV-2';
    case 'SEV_3':
      return 'SEV-3';
    case 'SEV_4':
      return 'SEV-4';
    default:
      return 'SEV-3';
  }
}

export function mapTypeSeverityToPrisma(severity: SeverityLevel): AlertSeverity {
  switch (severity) {
    case 'SEV-1':
      return 'SEV_1';
    case 'SEV-2':
      return 'SEV_2';
    case 'SEV-3':
      return 'SEV_3';
    case 'SEV-4':
      return 'SEV_4';
    default:
      return 'SEV_3';
  }
}

