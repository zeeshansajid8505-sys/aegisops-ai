export interface DependencyEdgeRaw {
  sourceServiceId: string;
  targetServiceId: string;
}

/**
 * Validates whether adding an edge `source -> target` would create a cycle in a directed graph.
 * In AegisOps: edge A -> B means "A depends on B".
 * A cycle is formed if there already exists a path from `target` to `source`.
 *
 * @param existingEdges Array of existing directed edges in the organization
 * @param proposedSource The source node of the proposed edge (dependent)
 * @param proposedTarget The target node of the proposed edge (dependency)
 * @returns true if adding the edge creates a cycle; false otherwise
 */
export function wouldCreateCycle(
  existingEdges: DependencyEdgeRaw[],
  proposedSource: string,
  proposedTarget: string,
): boolean {
  // Self dependency check
  if (proposedSource === proposedTarget) {
    return true;
  }

  // Build adjacency list for the directed graph: u -> [v1, v2, ...]
  const adjacencyList = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const list = adjacencyList.get(edge.sourceServiceId) || [];
    list.push(edge.targetServiceId);
    adjacencyList.set(edge.sourceServiceId, list);
  }

  // BFS / DFS from proposedTarget to check if proposedSource can be reached
  const queue: string[] = [proposedTarget];
  const visited = new Set<string>([proposedTarget]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === proposedSource) {
      return true;
    }

    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

