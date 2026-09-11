import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { TeamSummary, TeamMemberSummary } from '@aegisops/types';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Teams')
@Controller('v1/organizations/:organizationId/teams')
@UseGuards(SessionAuthGuard, OrganizationMemberGuard, PermissionGuard)
@ApiCookieAuth()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @RequirePermission('teams.read')
  @ApiOperation({ summary: 'List all teams in organization' })
  @ApiResponse({ status: 200, description: 'List of team summaries' })
  async listTeams(@Param('organizationId') organizationId: string): Promise<TeamSummary[]> {
    return this.teamsService.listTeams(organizationId);
  }

  @Post()
  @RequirePermission('teams.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new engineering team' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  async createTeam(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamSummary> {
    return this.teamsService.createTeam(organizationId, dto);
  }

  @Get(':teamId')
  @RequirePermission('teams.read')
  @ApiOperation({ summary: 'Get team details by ID' })
  @ApiResponse({ status: 200, description: 'Team details' })
  async getTeam(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamSummary> {
    return this.teamsService.getTeam(organizationId, teamId);
  }

  @Patch(':teamId')
  @RequirePermission('teams.update')
  @ApiOperation({ summary: 'Update team details' })
  @ApiResponse({ status: 200, description: 'Team updated' })
  async updateTeam(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamSummary> {
    return this.teamsService.updateTeam(organizationId, teamId, dto);
  }

  @Delete(':teamId')
  @RequirePermission('teams.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a team (rejects if team owns active services)' })
  @ApiResponse({ status: 200, description: 'Team deleted' })
  async deleteTeam(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.teamsService.deleteTeam(organizationId, teamId);
  }

  @Get(':teamId/members')
  @RequirePermission('teams.read')
  @ApiOperation({ summary: 'List members belonging to a team' })
  @ApiResponse({ status: 200, description: 'List of team members' })
  async listTeamMembers(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamMemberSummary[]> {
    return this.teamsService.listTeamMembers(organizationId, teamId);
  }

  @Post(':teamId/members')
  @RequirePermission('teams.members.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an organization member to a team' })
  @ApiResponse({ status: 201, description: 'Member added to team' })
  async addTeamMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
  ): Promise<TeamMemberSummary> {
    return this.teamsService.addTeamMember(organizationId, teamId, dto);
  }

  @Delete(':teamId/members/:membershipId')
  @RequirePermission('teams.members.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from a team' })
  @ApiResponse({ status: 200, description: 'Member removed from team' })
  async removeTeamMember(
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.teamsService.removeTeamMember(organizationId, teamId, membershipId);
  }
}

