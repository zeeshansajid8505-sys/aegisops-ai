import { wouldCreateCycle } from './cycle-detector';

describe('Dependency Cycle Detector (DAG)', () => {
  it('should allow adding an edge to an empty graph', () => {
    const existingEdges: Array<{ sourceServiceId: string; targetServiceId: string }> = [];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-A', 'svc-B');
    expect(hasCycle).toBe(false);
  });

  it('should detect a self-dependency (A -> A)', () => {
    const existingEdges: Array<{ sourceServiceId: string; targetServiceId: string }> = [];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-A', 'svc-A');
    expect(hasCycle).toBe(true);
  });

  it('should detect a direct 2-node cycle (A -> B, adding B -> A)', () => {
    const existingEdges = [{ sourceServiceId: 'svc-A', targetServiceId: 'svc-B' }];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-B', 'svc-A');
    expect(hasCycle).toBe(true);
  });

  it('should detect a 3-node transitive cycle (A -> B -> C, adding C -> A)', () => {
    const existingEdges = [
      { sourceServiceId: 'svc-A', targetServiceId: 'svc-B' },
      { sourceServiceId: 'svc-B', targetServiceId: 'svc-C' },
    ];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-C', 'svc-A');
    expect(hasCycle).toBe(true);
  });

  it('should allow valid branching DAGs without cycles (diamond pattern)', () => {
    // A -> B -> D
    // A -> C -> D
    const existingEdges = [
      { sourceServiceId: 'svc-A', targetServiceId: 'svc-B' },
      { sourceServiceId: 'svc-A', targetServiceId: 'svc-C' },
      { sourceServiceId: 'svc-B', targetServiceId: 'svc-D' },
    ];
    // Adding C -> D creates diamond, not a cycle
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-C', 'svc-D');
    expect(hasCycle).toBe(false);
  });

  it('should detect a cycle in a complex multi-node graph', () => {
    // A -> B -> C -> D -> E
    // adding E -> B
    const existingEdges = [
      { sourceServiceId: 'svc-A', targetServiceId: 'svc-B' },
      { sourceServiceId: 'svc-B', targetServiceId: 'svc-C' },
      { sourceServiceId: 'svc-C', targetServiceId: 'svc-D' },
      { sourceServiceId: 'svc-D', targetServiceId: 'svc-E' },
    ];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-E', 'svc-B');
    expect(hasCycle).toBe(true);
  });

  it('should allow adding unconnected edges', () => {
    const existingEdges = [
      { sourceServiceId: 'svc-A', targetServiceId: 'svc-B' },
      { sourceServiceId: 'svc-C', targetServiceId: 'svc-D' },
    ];
    const hasCycle = wouldCreateCycle(existingEdges, 'svc-B', 'svc-C');
    expect(hasCycle).toBe(false);
  });
});

