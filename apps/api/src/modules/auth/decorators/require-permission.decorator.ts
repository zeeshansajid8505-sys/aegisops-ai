import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@aegisops/types';

export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);