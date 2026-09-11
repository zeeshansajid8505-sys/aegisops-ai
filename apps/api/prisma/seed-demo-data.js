const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('================================================================');
  console.log('   AEGISOPS AI --- DEMO DATASET SEEDER (DETERMINISTIC)');
  console.log('================================================================');

  // 1. Locate primary user via DEMO_OWNER_EMAIL env var or --email CLI argument
  const args = process.argv.slice(2);
  let emailArg = process.env.DEMO_OWNER_EMAIL;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      emailArg = args[i + 1];
    } else if (args[i].startsWith('--email=')) {
      emailArg = args[i].split('=')[1];
    }
  }

  if (!emailArg) {
    console.error('ERROR: DEMO_OWNER_EMAIL environment variable or --email CLI argument is required.');
    console.error('Usage: DEMO_OWNER_EMAIL=user@example.com pnpm demo:seed');
    console.error('   or: pnpm demo:seed --email=user@example.com');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: emailArg.toLowerCase().trim() },
  });

  if (!user) {
    console.error(`ERROR: User with email "${emailArg}" was not found in the database.`);
    console.error('Please register this user first via the web console or API before seeding demo data.');
    process.exit(1);
  }
  console.log('Using configured demo owner:', user.email, '(', user.id, ')');

  // 2. Find or create Synthetic Demo Org
  let org = await prisma.organization.findFirst({
    where: {
      name: 'AegisOps Synthetic Demo Organization',
      memberships: {
        some: { userId: user.id, role: 'OWNER' }
      }
    }
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'AegisOps Synthetic Demo Organization',
        slug: 'aegisops-synthetic-demo-org',
        memberships: {
          create: {
            userId: user.id,
            role: 'OWNER',
          }
        }
      }
    });
    console.log('Created Synthetic Demo Org:', org.id);
  } else {
    console.log('Found Synthetic Demo Org:', org.name, '(', org.id, ')');
  }

  const membership = await prisma.membership.findFirst({
    where: { organizationId: org.id, userId: user.id }
  });

  // 3. Ensure Services exist
  const serviceDefs = [
    { name: 'checkout-api', type: 'API', tier: 'TIER_1', desc: 'Customer checkout processing service' },
    { name: 'payment-gateway', type: 'API', tier: 'TIER_1', desc: 'Payment integration service' },
    { name: 'orders-worker', type: 'WORKER', tier: 'TIER_2', desc: 'Async order fulfillment and queue processing' },
    { name: 'inventory-api', type: 'API', tier: 'TIER_2', desc: 'Stock allocation and warehouse catalog' },
    { name: 'notification-service', type: 'INTERNAL_SERVICE', tier: 'TIER_3', desc: 'Email, SMS and push notifications' },
  ];

  const services = {};
  for (const s of serviceDefs) {
    let svc = await prisma.service.findFirst({
      where: { organizationId: org.id, name: s.name },
      include: { environments: true }
    });

    if (!svc) {
      svc = await prisma.service.create({
        data: {
          organizationId: org.id,
          name: s.name,
          slug: s.name + '-' + Date.now().toString().slice(-6),
          description: s.desc,
          serviceType: s.type,
          tier: s.tier,
          lifecycleStatus: 'ACTIVE',
          environments: {
            create: [
              { organizationId: org.id, name: 'Production', key: 'prod', isProduction: true },
              { organizationId: org.id, name: 'Staging', key: 'stage', isProduction: false },
            ]
          }
        },
        include: { environments: true }
      });
      console.log('  + Created service:', svc.name);
    } else {
      console.log('  * Found service:', svc.name);
    }
    services[s.name] = svc;
  }

  const checkoutApi = services['checkout-api'];
  const paymentGw = services['payment-gateway'];
  const prodEnv = checkoutApi.environments.find(e => e.isProduction) || checkoutApi.environments[0];

  // 4. Metric Definitions
  let metricDef = await prisma.metricDefinition.findFirst({
    where: { organizationId: org.id, name: 'http.server.request.duration' }
  });
  if (!metricDef) {
    metricDef = await prisma.metricDefinition.create({
      data: {
        organizationId: org.id,
        serviceId: checkoutApi.id,
        name: 'http.server.request.duration',
        type: 'HISTOGRAM',
        unit: 'ms',
        description: 'HTTP server inbound request duration in milliseconds'
      }
    });
    console.log('  + Created metric definition: http.server.request.duration');
  }

  // 5. Seed Runbook:  Investigate Upstream Latency
  let runbook = await prisma.runbook.findFirst({
    where: { organizationId: org.id, name: 'Investigate Upstream Latency' }
  });

  if (!runbook) {
    runbook = await prisma.runbook.create({
      data: {
        organizationId: org.id,
        name: 'Investigate Upstream Latency',
        description: 'Standard SRE operational runbook for diagnosing upstream latency propagation in checkout services',
        serviceId: checkoutApi.id,
        severity: 'CRITICAL',
        tags: ['latency', 'checkout', 'payments', 'p99'],
        isActive: true,
        createdByMembershipId: membership.id,
        steps: {
          create: [
            {
              order: 1,
              title: 'Check upstream latency',
              instruction: 'Inspect payment-gateway P99 response time in Telemetry Explorer; check if upstream exceeds 1000ms SLA.',
              stepType: 'CHECK',
              requiresConfirmation: true,
            },
            {
              order: 2,
              title: 'Review health probes',
              instruction: 'Review active synthetic probe health graphs on payment-gateway and checkout-api for consecutive failure spikes.',
              stepType: 'CHECK',
              requiresConfirmation: false,
            },
            {
              order: 3,
              title: 'Review saturation',
              instruction: 'Check database connection pool exhaustion, worker queue depth, and container CPU/Memory saturation.',
              stepType: 'CHECK',
              requiresConfirmation: true,
            },
            {
              order: 4,
              title: 'Validate downstream impact',
              instruction: 'Confirm whether checkout-api circuit breaker has tripped and fallbacks are actively absorbing load.',
              stepType: 'VALIDATION',
              requiresConfirmation: true,
            },
            {
              order: 5,
              title: 'Confirm recovery',
              instruction: 'Monitor rolling 5-minute P99 latency. Once stable below 150ms for 3 consecutive windows, mark incident resolved.',
              stepType: 'VALIDATION',
              requiresConfirmation: true,
            },
          ]
        }
      }
    });
    console.log('  + Created Runbook: Investigate Upstream Latency (5 steps)');
  } else {
    console.log('  * Found Runbook: Investigate Upstream Latency');
  }

  // 6. Seed Anomaly Detector & Finding
  let detector = await prisma.anomalyDetector.findFirst({
    where: { organizationId: org.id, name: 'Checkout P99 Latency Anomaly Detector' }
  });

  if (!detector) {
    detector = await prisma.anomalyDetector.create({
      data: {
        organizationId: org.id,
        serviceId: checkoutApi.id,
        environmentId: prodEnv.id,
        metricDefinitionId: metricDef.id,
        name: 'Checkout P99 Latency Anomaly Detector',
        description: 'Unsupervised Isolation Forest anomaly detector for customer checkout latency regressions',
        status: 'ENABLED',
        evaluationMode: 'AGGREGATE_SERIES',
        windowSeconds: 300,
        evaluationIntervalSeconds: 60,
        trainingLookbackHours: 24,
        minimumTrainingWindows: 30,
        sensitivity: 'BALANCED',
        contamination: 0.02,
        currentModelVersion: 1,
        currentModelStatus: 'READY',
        lastEvaluatedAt: new Date(),
        lastTrainedAt: new Date(Date.now() - 3600000),
        createdByMembershipId: membership.id,
        models: {
          create: {
            organizationId: org.id,
            version: 1,
            status: 'READY',
            algorithm: 'IsolationForest',
            algorithmVersion: '1.9.0',
            featureSchemaVersion: 'anomaly-feature-v1',
            featureNames: ['mean_latency', 'p99_latency', 'rate_per_sec', 'variance'],
            sampleCount: 1440,
            contamination: 0.02,
            artifactHash: 'a7f39b8210c49e29f12d83b9c02e5b7a',
            trainedAt: new Date(Date.now() - 3600000),
          }
        },
        findings: {
          create: {
            organizationId: org.id,
            serviceId: checkoutApi.id,
            environmentId: prodEnv.id,
            metricDefinitionId: metricDef.id,
            fingerprint: 'fp_checkout_p99_latency_spike',
            state: 'RESOLVED',
            firstDetectedAt: new Date(Date.now() - 7200000),
            anomalousSince: new Date(Date.now() - 7000000),
            lastAnomalousAt: new Date(Date.now() - 3600000),
            resolvedAt: new Date(Date.now() - 1800000),
            currentScore: 0.12,
            peakScore: 0.88,
          }
        }
      }
    });
    console.log('  + Created Anomaly Detector: Checkout P99 Latency Anomaly Detector (with Model v1 and Finding)');
  } else {
    console.log('  * Found Anomaly Detector: Checkout P99 Latency Anomaly Detector');
  }

  // 7. Seed Incident with Postmortem & Action Items
  let incident = await prisma.incident.findFirst({
    where: { organizationId: org.id, status: 'RESOLVED' },
    include: { postmortem: true }
  });

  if (!incident) {
    incident = await prisma.incident.create({
      data: {
        organizationId: org.id,
        incidentKey: 'INC-DEMO-' + Date.now().toString().slice(-4),
        title: '[checkout-api] Upstream Payment Gateway Latency Degradation',
        summary: 'P99 checkout latency spiked to 1420ms due to upstream payment-gateway timeouts during peak traffic.',
        severity: 'CRITICAL',
        status: 'RESOLVED',
        primaryServiceId: checkoutApi.id,
        environmentId: prodEnv.id,
        commanderMembershipId: membership.id,
        declaredAt: new Date(Date.now() - 7200000),
        acknowledgedAt: new Date(Date.now() - 7000000),
        mitigatedAt: new Date(Date.now() - 3600000),
        resolvedAt: new Date(Date.now() - 1800000),
      }
    });
    console.log('  + Created Resolved Incident:', incident.incidentKey);
  } else {
    console.log('  * Found Resolved Incident:', incident.title);
  }

  // Ensure Postmortem exists on this resolved incident
  let postmortem = await prisma.incidentPostmortem.findFirst({
    where: { incidentId: incident.id },
    include: { actionItems: true }
  });

  if (!postmortem) {
    postmortem = await prisma.incidentPostmortem.create({
      data: {
        organizationId: org.id,
        incidentId: incident.id,
        title: 'Postmortem: Checkout P99 Latency Degradation (INC-DEMO)',
        status: 'APPROVED',
        summary: 'On ' + new Date().toISOString().slice(0,10) + ', customer checkout transactions experienced a severe P99 latency spike (reaching 1420ms against a 120ms baseline). Root cause analysis identified upstream payment-gateway thread pool saturation triggered by an unannounced provider database maintenance. The issue was mitigated by tightening the payment client socket timeout to 3s and enabling circuit breaker fallbacks.',
        impact: 'Between 14:02 UTC and 15:30 UTC, approximately 1,840 checkout requests experienced elevated latency (> 1000ms). Approximately 42 payment attempts encountered transient errors before fallback routing engaged.',
        rootCause: 'Upstream payment-gateway provider unannounced database lock escalation caused connection timeouts, holding open connection pool threads on checkout-api workers.',
        contributingFactors: '1. Payment client connection timeout was configured at 15s rather than 3s.\n2. Circuit breaker trip threshold required 50 consecutive failures before opening.\n3. Health probes did not inspect upstream third-party status API.',
        detection: 'AegisOps AI Anomaly Detector detected P99 divergence (+1100%) within 90 seconds. Alert Rule Payment Gateway High Latency fired at 14:03 UTC, and AI Incident Correlation automatically grouped 4 related alerts into INC-DEMO.',
        response: 'On-call SRE acknowledged incident within 3 minutes. AI Incident Analyst RCA generated hypothesis with 92% confidence pointing to payment-gateway upstream stalls. Runbook Investigate Upstream Latency was executed.',
        resolution: 'SRE reduced client timeout to 3s and manually verified fallback payment processor absorbed 100% of diverted transactions. P99 latency normalized to 118ms at 15:30 UTC.',
        lessonsLearned: '1. Upstream dependencies must be bounded by aggressive timeouts (max 3s).\n2. Circuit breakers must incorporate latency degradation in addition to error rates.\n3. Synthetic health probes must validate third-party sandbox heartbeat.',
        whatWentWell: '1. AegisOps AI Anomaly Detector flagged the regression 4 minutes before customer escalation.\n2. Root Cause Analysis correctly identified payment-gateway connection pool stalls.\n3. Automated Runbook execution guided responder through step-by-step verification.',
        whatWentPoorly: '1. Manual intervention was required to adjust client timeout setting.\n2. Initial alert notification reached primary on-call but secondary escalation was not triggered.',
        evidenceFingerprint: 'ev_fp_checkout_p99_latency_demo',
        generatedBy: 'AI_AND_HUMAN',
        createdByMembershipId: membership.id,
        approvedByMembershipId: membership.id,
        approvedAt: new Date(Date.now() - 900000),
        actionItems: {
          create: [
            {
              organizationId: org.id,
              title: 'Reduce Payment Gateway Client Socket Timeout to 3s',
              description: 'Update checkout-api HTTP client configuration to enforce 3000ms connect and read timeouts on payment provider endpoints.',
              priority: 'HIGH',
              status: 'COMPLETED',
              ownerMembershipId: membership.id,
              completedAt: new Date(Date.now() - 1200000),
            },
            {
              organizationId: org.id,
              title: 'Implement Latency-Sensitive Circuit Breaker with Secondary Fallback',
              description: 'Configure Resilience4j / Opossum circuit breaker to trip when P95 latency exceeds 800ms over a 30s window and route to backup provider.',
              priority: 'HIGH',
              status: 'IN_PROGRESS',
              ownerMembershipId: membership.id,
              dueAt: new Date(Date.now() + 86400000 * 3),
            },
            {
              organizationId: org.id,
              title: 'Add External Health Probe for Third-Party Payment Sandbox',
              description: 'Configure synthetic probe checking payment gateway status page and API health endpoint every 30s.',
              priority: 'MEDIUM',
              status: 'OPEN',
              ownerMembershipId: membership.id,
              dueAt: new Date(Date.now() + 86400000 * 7),
            },
          ]
        },
        revisions: {
          create: {
            organizationId: org.id,
            version: 1,
            changeReason: 'Initial approved postmortem publication with executive sign-off',
            changedByMembershipId: membership.id,
            contentSnapshot: {
              status: 'APPROVED',
              summary: 'Approved postmortem for INC-DEMO P99 latency regression',
              approvedAt: new Date().toISOString(),
            }
          }
        }
      }
    });
    console.log('  + Created Postmortem for incident:', postmortem.title, 'with 3 Action Items and Revision v1');
  } else {
    console.log('  * Found Postmortem:', postmortem.title);
  }

  // 8. Record Runbook Execution on this incident
  let execution = await prisma.runbookExecution.findFirst({
    where: { incidentId: incident.id, runbookId: runbook.id }
  });

  if (!execution) {
    const steps = await prisma.runbookStep.findMany({
      where: { runbookId: runbook.id },
      orderBy: { order: 'asc' }
    });

    execution = await prisma.runbookExecution.create({
      data: {
        organizationId: org.id,
        incidentId: incident.id,
        runbookId: runbook.id,
        status: 'COMPLETED',
        startedByMembershipId: membership.id,
        startedAt: new Date(Date.now() - 5400000),
        completedAt: new Date(Date.now() - 3600000),
        steps: {
          create: steps.map(s => ({
            runbookStepId: s.id,
            status: 'COMPLETED',
            completedByMembershipId: membership.id,
            completedAt: new Date(Date.now() - 4000000),
            note: 'Verified: ' + s.title + ' executed successfully according to standard procedure.',
          }))
        }
      }
    });
    console.log('  + Created Runbook Execution on incident (5/5 steps completed)');
  } else {
    console.log('  * Found Runbook Execution on incident');
  }

  console.log('================================================================');
  console.log('   DEMO DATASET SEEDING COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());