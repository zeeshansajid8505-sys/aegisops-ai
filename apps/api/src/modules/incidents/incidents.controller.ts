import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type {
  IncidentSummary,
  IncidentDetail,
  IncidentAlertSummary,
  IncidentTimelineEventSummary,
  IncidentResponderSummary,
} from '@aegisops/types';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  TransitionIncidentDto,
  AcknowledgeIncidentDto,
  ResolveIncidentDto,
  ReopenIncidentDto,
  AssignCommanderDto,
  AddResponderDto,
  AddIncidentNoteDto,
  AttachAlertDto,
  UnlinkAlertDto,
  UpdateSeverityDto,
} from './dto/incident-actions.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentMembership } from '../auth/decorators/current-membership.decorator';

@ApiTags('Incidents')
@Controller('v1/organizations/:organizationId/incidents')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @RequirePermission('incidents.create')
  @ApiOperation({ summary: 'Create a new operational incident manually' })
  @ApiResponse({ status: 201, description: 'Incident created' })
  async createIncident(
    @Param('organizationId') organizationId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.createIncident(organizationId, membership.id, dto);
  }

  @Get()
  @RequirePermission('incidents.read')
  @ApiOperation({ summary: 'List and filter operational incidents' })
  @ApiResponse({ status: 200, description: 'List of incidents' })
  async listIncidents(
    @Param('organizationId') organizationId: string,
    @Query() query: QueryIncidentsDto,
  ): Promise<{ incidents: IncidentSummary[]; total: number }> {
    return this.incidentsService.listIncidents(organizationId, query);
  }

  @Get(':incidentId')
  @RequirePermission('incidents.read')
  @ApiOperation({ summary: 'Get full incident details with alerts, timeline, and responders' })
  @ApiResponse({ status: 200, description: 'Incident details' })
  async getIncident(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentDetail> {
    return this.incidentsService.getIncident(organizationId, incidentId);
  }

  @Post(':incidentId/acknowledge')
  @RequirePermission('incidents.acknowledge')
  @ApiOperation({ summary: 'Acknowledge an incident idempotently' })
  @ApiResponse({ status: 200, description: 'Incident acknowledged' })
  async acknowledgeIncident(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: AcknowledgeIncidentDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.acknowledgeIncident(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Post(':incidentId/transition')
  @RequirePermission('incidents.update')
  @ApiOperation({ summary: 'Execute a valid state machine transition' })
  @ApiResponse({ status: 200, description: 'Incident transitioned' })
  async transitionStatus(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: TransitionIncidentDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.transitionStatus(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Post(':incidentId/resolve')
  @RequirePermission('incidents.resolve')
  @ApiOperation({ summary: 'Resolve an incident with a mandatory remediation summary' })
  @ApiResponse({ status: 200, description: 'Incident resolved' })
  async resolveIncident(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: ResolveIncidentDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.resolveIncident(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Post(':incidentId/reopen')
  @RequirePermission('incidents.update')
  @ApiOperation({ summary: 'Explicitly reopen a resolved incident' })
  @ApiResponse({ status: 200, description: 'Incident reopened to INVESTIGATING' })
  async reopenIncident(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: ReopenIncidentDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.reopenIncident(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Patch(':incidentId/commander')
  @RequirePermission('incidents.assign')
  @ApiOperation({ summary: 'Assign or reassign the incident commander' })
  @ApiResponse({ status: 200, description: 'Commander assigned' })
  async assignCommander(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: AssignCommanderDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.assignCommander(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Post(':incidentId/responders')
  @RequirePermission('incidents.respond')
  @ApiOperation({ summary: 'Add a responder to the incident command roster' })
  @ApiResponse({ status: 201, description: 'Responder added' })
  async addResponder(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: AddResponderDto,
  ): Promise<IncidentResponderSummary> {
    return this.incidentsService.addResponder(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Delete(':incidentId/responders/:membershipId')
  @RequirePermission('incidents.respond')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a responder from the active roster' })
  @ApiResponse({ status: 204, description: 'Responder removed' })
  async removeResponder(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Param('membershipId') targetMembershipId: string,
  ): Promise<void> {
    return this.incidentsService.removeResponder(
      organizationId,
      incidentId,
      membership.id,
      targetMembershipId,
    );
  }

  @Post(':incidentId/notes')
  @RequirePermission('incidents.notes.create')
  @ApiOperation({ summary: 'Add an investigation note to the incident timeline' })
  @ApiResponse({ status: 201, description: 'Note added' })
  async addNote(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: AddIncidentNoteDto,
  ): Promise<IncidentTimelineEventSummary> {
    return this.incidentsService.addNote(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Get(':incidentId/timeline')
  @RequirePermission('incidents.read')
  @ApiOperation({ summary: 'Get the audit timeline events for an incident' })
  @ApiResponse({ status: 200, description: 'Timeline events' })
  async getTimeline(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ events: IncidentTimelineEventSummary[]; total: number }> {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.incidentsService.getTimeline(
      organizationId,
      incidentId,
      parsedLimit,
      parsedOffset,
    );
  }

  @Get(':incidentId/alerts')
  @RequirePermission('incidents.read')
  @ApiOperation({ summary: 'Get linked alert episodes for an incident' })
  @ApiResponse({ status: 200, description: 'Linked alerts' })
  async getAlerts(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentAlertSummary[]> {
    return this.incidentsService.getAlerts(organizationId, incidentId);
  }

  @Post(':incidentId/alerts')
  @RequirePermission('incidents.alerts.manage')
  @ApiOperation({ summary: 'Manually attach an alert episode to an incident' })
  @ApiResponse({ status: 201, description: 'Alert attached' })
  async attachAlert(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: AttachAlertDto,
  ): Promise<IncidentAlertSummary> {
    return this.incidentsService.attachAlert(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }

  @Delete(':incidentId/alerts/:incidentAlertId')
  @RequirePermission('incidents.alerts.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink an alert episode from an incident with a reason' })
  @ApiResponse({ status: 204, description: 'Alert unlinked' })
  async unlinkAlert(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @Param('incidentAlertId') incidentAlertId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: UnlinkAlertDto,
  ): Promise<void> {
    return this.incidentsService.unlinkAlert(
      organizationId,
      incidentId,
      incidentAlertId,
      membership.id,
      dto,
    );
  }

  @Patch(':incidentId/severity')
  @RequirePermission('incidents.severity.manage')
  @ApiOperation({ summary: 'Manually adjust the incident severity with an explanation' })
  @ApiResponse({ status: 200, description: 'Severity updated' })
  async updateSeverity(
    @Param('organizationId') organizationId: string,
    @Param('incidentId') incidentId: string,
    @CurrentMembership() membership: { id: string },
    @Body() dto: UpdateSeverityDto,
  ): Promise<IncidentSummary> {
    return this.incidentsService.updateSeverity(
      organizationId,
      incidentId,
      membership.id,
      dto,
    );
  }
}

