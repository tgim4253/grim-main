const removeNodes = <T extends { id: string; children?: T[] }>(
  tree: readonly T[],
  idsToRemove: string[],
): T[] => {
  return tree
    .filter(node => {
      return !idsToRemove.includes(node.id);
    })
    .map(node => ({
      ...node,
      children: node.children ? removeNodes(node.children, idsToRemove) : undefined,
    }));
};

const insertNodes = <T>(
  tree: T[],
  nodesToInsert: T[],
  parentId: string | null,
  index: number,
): T[] => {
  if (parentId === null) {
    const before = tree.slice(0, index);
    const after = tree.slice(index);
    return [...before, ...nodesToInsert, ...after];
  }
  return tree.map(node => {
    const nodeAny = node as any;

    if (nodeAny?.id === parentId) {
      const children = Array.isArray(nodeAny.children) ? nodeAny.children : [];
      const before = children.slice(0, index);
      const after = children.slice(index);

      return {
        ...node,
        children: [...before, ...nodesToInsert, ...after],
      };
    }
    if (Array.isArray(nodeAny.children)) {
      return {
        ...node,
        children: insertNodes(nodeAny.children, nodesToInsert, parentId, index),
      };
    }

    return node;
  });
};

export { removeNodes, insertNodes };
