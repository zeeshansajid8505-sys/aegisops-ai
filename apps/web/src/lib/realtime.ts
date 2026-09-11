'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  RealtimeConnectionState,
  RealtimeEventEnvelope,
} from '@aegisops/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Singleton socket instance across the client session
let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(API_BASE, {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });
  }
  return globalSocket;
}

/**
 * Hook or helper to retrieve the shared realtime socket
 */
export function useRealtimeSocket(): Socket {
  return getSocket();
}

/**
 * Hook to observe the live WebSocket connection status
 */
export function useRealtimeStatus() {
  const [status, setStatus] = useState<RealtimeConnectionState>('connecting');

  useEffect(() => {
    const socket = getSocket();

    const updateStatus = () => {
      if (socket.connected) {
        setStatus('connected');
      } else {
        setStatus('connecting');
      }
    };

    updateStatus();

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    });
    socket.on('connect_error', () => setStatus('error'));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  return {
    status,
    isConnected: status === 'connected',
  };
}

/**
 * Hook to subscribe to an organization's real-time events and invalidate TanStack Query caches.
 */
export function useRealtimeOrganization(organizationId?: string | null) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!organizationId) return;
    const socket = getSocket();

    const joinRoom = () => {
      socket.emit('subscribe:organization', { organizationId });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);

    // Event handlers for real-time cache invalidation
    const handleRealtimeEvent = (envelope: RealtimeEventEnvelope) => {
      const qc = queryClientRef.current;
      const eventType = envelope.type;

      // Invalidate operations overview
      qc.invalidateQueries({ queryKey: ['operations-overview', organizationId] });

      if (eventType.startsWith('incident.')) {
        qc.invalidateQueries({ queryKey: ['incidents', organizationId] });
        if (envelope.payload?.id || envelope.payload?.incidentId) {
          const incId = envelope.payload.id || envelope.payload.incidentId;
          qc.invalidateQueries({ queryKey: ['incident', organizationId, incId] });
          qc.invalidateQueries({ queryKey: ['incident-timeline', organizationId, incId] });
        }
      } else if (eventType.startsWith('alert.')) {
        qc.invalidateQueries({ queryKey: ['alerts', organizationId] });
      } else if (eventType.startsWith('service.')) {
        qc.invalidateQueries({ queryKey: ['services', organizationId] });
      }
    };

    socket.on('realtime:event', handleRealtimeEvent);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('realtime:event', handleRealtimeEvent);
      socket.emit('unsubscribe:organization', { organizationId });
    };
  }, [organizationId]);
}

/**
 * Hook to subscribe to a specific incident's real-time room for live timeline updates.
 */
export function useRealtimeIncident(organizationId?: string | null, incidentId?: string | null) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!organizationId || !incidentId) return;
    const socket = getSocket();

    const joinRoom = () => {
      socket.emit('subscribe:incident', { organizationId, incidentId });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);

    const handleIncidentEvent = (envelope: RealtimeEventEnvelope) => {
      const qc = queryClientRef.current;
      qc.invalidateQueries({ queryKey: ['incident', organizationId, incidentId] });
      qc.invalidateQueries({ queryKey: ['incident-timeline', organizationId, incidentId] });
      qc.invalidateQueries({ queryKey: ['incident-alerts', organizationId, incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents', organizationId] });
      qc.invalidateQueries({ queryKey: ['operations-overview', organizationId] });
    };

    socket.on('incident.updated', handleIncidentEvent);
    socket.on('incident.timeline.updated', handleIncidentEvent);
    socket.on('incident.severity.updated', handleIncidentEvent);
    socket.on('incident.resolved', handleIncidentEvent);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('incident.updated', handleIncidentEvent);
      socket.off('incident.timeline.updated', handleIncidentEvent);
      socket.off('incident.severity.updated', handleIncidentEvent);
      socket.off('incident.resolved', handleIncidentEvent);
      socket.emit('unsubscribe:incident', { organizationId, incidentId });
    };
  }, [organizationId, incidentId]);
}

/**
 * Hook to subscribe to a specific service's real-time room for live health probe and alert updates.
 */
export function useRealtimeService(organizationId?: string | null, serviceId?: string | null) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    if (!organizationId || !serviceId) return;
    const socket = getSocket();

    const joinRoom = () => {
      socket.emit('subscribe:service', { organizationId, serviceId });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);

    const handleServiceEvent = (envelope: RealtimeEventEnvelope) => {
      const qc = queryClientRef.current;
      qc.invalidateQueries({ queryKey: ['service', organizationId, serviceId] });
      qc.invalidateQueries({ queryKey: ['health-probes', organizationId, serviceId] });
      qc.invalidateQueries({ queryKey: ['service-alerts', organizationId, serviceId] });
      qc.invalidateQueries({ queryKey: ['operations-overview', organizationId] });
    };

    socket.on('service.health.updated', handleServiceEvent);
    socket.on('alert.fired', handleServiceEvent);
    socket.on('alert.resolved', handleServiceEvent);
    socket.on('alert.state.updated', handleServiceEvent);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('service.health.updated', handleServiceEvent);
      socket.off('alert.fired', handleServiceEvent);
      socket.off('alert.resolved', handleServiceEvent);
      socket.off('alert.state.updated', handleServiceEvent);
      socket.emit('unsubscribe:service', { organizationId, serviceId });
    };
  }, [organizationId, serviceId]);
}

