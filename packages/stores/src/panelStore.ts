import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { immer } from 'zustand/middleware/immer';

/* ---------- Types ---------- */

interface PanelItem {
  id: string;
  nodeId: string;
  name: string;
}

interface PanelContainer {
  id: string;
  panelIds: string[];
  focusedPanelId?: string;
}

type ContainerId = string;
type PanelId = string;
type LayoutContainerId = string;

interface LayoutContainer {
  id: LayoutContainerId;
  axis: 'vertical' | 'horizontal';
  children: Array<LayoutContainerId | ContainerId>;
}
interface PanelsState {
  rootLayout: LayoutContainer | null;
  layout: Record<LayoutContainerId, LayoutContainer>;
  // containerId -> layoutContainerIds
  containerOwnership: Record<ContainerId, LayoutContainerId>;

  panelEntities: Record<PanelId, PanelItem>;
  containers: Record<ContainerId, PanelContainer>;
  // panelId -> containerId
  panelOwnership: Record<PanelId, ContainerId>;

  activePanelId: PanelId | null;

  // layout actions
  getOrCreateLayoutId: () => LayoutContainerId;
  removeLayoutAndChildren: (layoutId: LayoutContainerId) => void;
  removeContainerFromLayout: (containerId: ContainerId) => void;

  // container actions
  addContainer: (layoutId?: LayoutContainerId) => ContainerId;
  removeContainer: (containerId: ContainerId) => void;
  moveContainerIntoLayout: (
    containerId: ContainerId,
    layoutId: LayoutContainerId,
    index: number | null,
  ) => void;
  splitContainer: (containerId: ContainerId, axis: 'vertical' | 'horizontal') => ContainerId;

  // panel actions
  addPanel: (containerId: ContainerId, panel: Omit<PanelItem, 'id'> & { id?: PanelId }) => void;
  removePanel: (panelId: PanelId) => void;
  updatePanel: (change: Partial<Omit<PanelItem, 'id'>> & { id: PanelId }) => void;
  movePanel: (
    targetIds: PanelId[],
    destinationContainerId: ContainerId,
    destinationIndex: number,
  ) => void;
  addPanelWithoutContainer: (panel: Omit<PanelItem, 'id'> & { id?: PanelId }) => void;
  splitPanel: (panelId: PanelId, axis: 'vertical' | 'horizontal') => void;

  // selectors
  setActivePanel: (panelId: PanelId | null) => void;
  getFocusedContainerId: () => ContainerId | null;
}

/* ---------- Helpers ---------- */
const createNewId = () => uuidv4();

/* ---------- Store ---------- */

const usePanelsStore = create<PanelsState>()(
  immer((set, get) => ({
    rootLayout: null,
    layout: {},
    containerOwnership: {},
    panelEntities: {},
    containers: {},
    panelOwnership: {},
    activePanelId: null,

    /* ----- Actions ----- */

    //layout
    getOrCreateLayoutId: () => {
      const rl = get().rootLayout;
      if (rl) return rl.id;

      const id = createNewId();
      set(state => {
        state.rootLayout = { id, axis: 'horizontal', children: [] };
        state.layout[id] = state.rootLayout;
      });
      return id;
    },

    removeLayoutAndChildren: layoutId => {
      set(state => {
        const layout = state.layout[layoutId];
        if (!layout) return;
        layout.children.forEach(child => {
          if (state.layout[child]) {
            state.removeLayoutAndChildren(child);
          } else if (state.containers[child]) {
            state.removeContainer(child);
          }
        });
        delete state.layout[layoutId];
        delete state.containerOwnership[layoutId];
      });
    },

    removeContainerFromLayout(containerId) {
      set(state => {
        const layoutId = state.containerOwnership[containerId];
        if (!layoutId) return;
        const layout = state.layout[layoutId];
        if (!layout) return;
        const idx = layout.children.indexOf(containerId);
        if (idx === -1) return;
        layout.children.splice(idx, 1);
        delete state.containerOwnership[containerId];

        // if the layout becomes empty, remove it
        if (layout.children.length === 0) {
          state.removeLayoutAndChildren(layoutId);
        }
      });
    },

    // Container
    addContainer: (layoutId?: LayoutContainerId) => {
      const id = createNewId();
      layoutId = layoutId ?? get().getOrCreateLayoutId();

      set(state => {
        const layout = state.layout[layoutId];
        state.containers[id] = { id, panelIds: [] };
        state.containerOwnership[id] = layoutId;
        layout.children = [...layout.children, id];
      });
      return id;
    },

    removeContainer: containerId => {
      set(state => {
        state.removeContainerFromLayout(containerId);
        const container: PanelContainer = state.containers[containerId];
        if (!container) return;

        // remove all panels in the container
        container.panelIds.forEach(pid => {
          delete state.panelEntities[pid];
          delete state.panelOwnership[pid];
        });
        delete state.containers[containerId];

        // if the active panel was inside the deleted container
        if (state.activePanelId && !state.panelOwnership[state.activePanelId]) {
          const firstContainer = Object.values(state.containers)[0] as PanelContainer;
          state.activePanelId = firstContainer?.focusedPanelId ?? null;
        }
      });
    },

    moveContainerIntoLayout: (containerId, layoutId, index) => {
      set(state => {
        const oldLayoutId = state.containerOwnership[containerId];
        if (oldLayoutId === layoutId) return;

        const oldLayout = state.layout[oldLayoutId];
        if (oldLayout) {
          state.removeContainerFromLayout(containerId);
        }

        const layout = state.layout[layoutId];
        if (!layout) return;
        index = index ?? layout.children.length;
        layout.children.splice(index, 0, containerId);
        state.containerOwnership[containerId] = layoutId;
      });
    },

    splitContainer: (containerId, axis) => {
      let newContainerId = createNewId();

      set(state => {
        const container = state.containers[containerId];
        if (!container) return;

        const parentLayoutId = state.containerOwnership[containerId] ?? state.getOrCreateLayoutId();
        const parentLayout = state.layout[parentLayoutId];

        // insert a new layout container
        const newLayoutId = createNewId();
        const index = parentLayout.children.indexOf(containerId);

        if (index === -1) return;

        state.containers[newContainerId] = { id: newContainerId, panelIds: [] };

        state.layout[newLayoutId] = {
          id: newLayoutId,
          axis,
          children: [containerId, newContainerId],
        };
        state.containerOwnership[containerId] = newLayoutId;
        state.containerOwnership[newContainerId] = newLayoutId;

        parentLayout.children[index] = newLayoutId;
      });

      return newContainerId;
    },

    // Panel
    addPanel: (containerId, panelInput) => {
      const id = createNewId();
      const panel: PanelItem = {
        id,
        nodeId: panelInput.nodeId,
        name: panelInput.name,
      };
      set(state => {
        const container: PanelContainer = state.containers[containerId];
        if (!container) return;

        // If panel already exists in container, focus & set active
        const existingPanel = container.panelIds.find(
          pid => state.panelEntities[pid].nodeId === panel.nodeId,
        );
        if (existingPanel) {
          container.focusedPanelId = existingPanel;
          state.activePanelId = existingPanel;
          return;
        }

        // Add new panel entity and ownership
        state.panelEntities[id] = panel;
        state.panelOwnership[id] = containerId;

        container.panelIds.push(id);
        container.focusedPanelId = id;
        state.activePanelId = id;
      });
    },

    addPanelWithoutContainer: panelInput => {
      let containerId = get().getFocusedContainerId();
      if (!containerId) {
        containerId = get().addContainer();
      }
      get().addPanel(containerId, panelInput);
    },

    removePanel: panelId => {
      set(state => {
        const containerId = state.panelOwnership[panelId];
        if (!containerId) return;
        const container: PanelContainer = state.containers[containerId];
        if (!container) return;

        // remove panelId from container.panelIds
        const idx = container.panelIds.indexOf(panelId);
        if (idx !== -1) container.panelIds.splice(idx, 1);
        delete state.panelEntities[panelId];
        delete state.panelOwnership[panelId];

        // if container has no panels left, remove the container
        if (container.panelIds.length === 0) {
          delete state.containers[containerId];

          // if active panel was deleted
          if (state.activePanelId === panelId) {
            state.activePanelId =
              (Object.values(state.containers)[0] as PanelContainer)?.focusedPanelId ?? null;
          }
        } else {
          // update focused panel
          if (container.focusedPanelId === panelId) {
            container.focusedPanelId = container.panelIds[container.panelIds.length - 1];
          }
          // if active panel was deleted
          if (state.activePanelId === panelId) {
            state.activePanelId = container.panelIds[0] ?? null;
          }
        }
      });
    },

    updatePanel: changes => {
      set(state => {
        const panel = state.panelEntities[changes.id];
        if (!panel) return;
        Object.assign(panel, changes);
      });
    },

    movePanel: (targetIds, destinationContainerId, destinationIndex) => {
      set(state => {
        const destContainer = state.containers[destinationContainerId];
        if (!destContainer) return;
        const panelsToInsert: string[] = [];
        const affectedContainers = new Set<string>();

        // remove target panels from their source containers
        targetIds.forEach(pid => {
          const sourceContainerId = state.panelOwnership[pid];
          const sourceContainer = state.containers[sourceContainerId];
          if (!sourceContainer) return;
          affectedContainers.add(sourceContainerId);

          // remove from source container
          const idx = sourceContainer.panelIds.indexOf(pid);
          if (idx !== -1) sourceContainer.panelIds.splice(idx, 1);

          panelsToInsert.push(pid);
          state.panelOwnership[pid] = destinationContainerId;
        });

        // insert into destination container
        destContainer.panelIds.splice(destinationIndex, 0, ...panelsToInsert);
        if (panelsToInsert.some(pid => pid == state.activePanelId)) {
          destContainer.focusedPanelId = state.activePanelId ?? undefined;
        } else if (
          destContainer.focusedPanelId &&
          state.panelOwnership[destContainer.focusedPanelId] !== destinationContainerId
        ) {
          destContainer.focusedPanelId = panelsToInsert[panelsToInsert.length - 1];
        }

        // update affected containers
        affectedContainers.forEach(cid => {
          const cont = state.containers[cid];
          if (cont && cont.panelIds.length === 0) {
            delete state.containers[cid];
          } else if (cont.focusedPanelId !== cid) {
            cont.focusedPanelId = cont.panelIds[cont.panelIds.length - 1] ?? null;
          }
        });
      });
    },

    splitPanel: (panelId, axis) => {
      set(state => {
        const panel = state.panelEntities[panelId];
        if (!panel) return;

        const containerId = state.panelOwnership[panelId];
        if (!containerId) return;

        const newContainerId = state.splitContainer(containerId, axis);

        state.addPanel(newContainerId, {
          nodeId: panel.nodeId,
          name: panel.name,
          id: createNewId(),
        });
      });
    },

    getFocusedContainerId: () => {
      const panelId = get().activePanelId;
      return panelId ? (get().panelOwnership[panelId] ?? null) : null;
    },

    setActivePanel: id =>
      set(state => {
        if (id === null) return;
        const containerId = state.panelOwnership[id];
        if (!containerId) return;

        state.containers[containerId].focusedPanelId = id;
        state.activePanelId = id;
      }),
  })),
);

export default usePanelsStore;
