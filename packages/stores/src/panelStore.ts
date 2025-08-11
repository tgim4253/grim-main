import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { immer } from 'zustand/middleware/immer';
import { PanelType } from '@tgim/types/index';
/* ---------- Types ---------- */

interface PanelItem {
  id: string;
  name: string;
  path: string;
  type: PanelType;
}

interface PanelContainer {
  id: string;
  panelIds: string[];
  focusedPanelId?: string;
}

interface PanelsState {
  panelEntities: Record<string, PanelItem>;
  containers: Record<string, PanelContainer>;
  // panelId -> containerId
  panelOwnership: Record<string, string>;

  activePanelId: string | null;

  // action Container
  addContainer: () => string;
  removeContainer: (containerId: string) => void;

  //action Panel
  addPanel: (containerId: string, panel: Omit<PanelItem, 'id'> & { id?: string }) => void;
  removePanel: (panelId: string) => void;
  updatePanel: (change: Partial<Omit<PanelItem, 'id'>> & { id: string }) => void;
  movePanel: (
    targetIds: string[],
    destinationContainerId: string,
    destinationIndex: number,
  ) => void;
  addPanelWithoutContainer: (panel: Omit<PanelItem, 'id'> & { id?: string }) => void;

  //Selectors
  setActivePanel: (panelId: string | null) => void;
  getFocusedContainerId: () => string | null;
}

/* ---------- Helpers ---------- */
const createNewId = () => uuidv4();

/* ---------- Store ---------- */

const usePanelsStore = create<PanelsState>()(
  immer((set, get) => ({
    panelEntities: {},
    containers: {},
    panelOwnership: {},
    activePanelId: null,

    /* ----- Actions ----- */

    // Container
    addContainer: () => {
      const id = createNewId();
      set(state => {
        state.containers[id] = { id, panelIds: [] };
      });
      return id;
    },

    removeContainer: containerId => {
      set(state => {
        const container: PanelContainer = state.containers[containerId];
        if (!container) return;

        //container에 속한 Panel 삭제
        container.panelIds.forEach(pid => {
          delete state.panelEntities[pid];
          delete state.panelOwnership[pid];
        });
        delete state.containers[containerId];

        //만약 삭제된 컨테이너에 active인 Panel이 있다면
        if (state.activePanelId && !state.panelOwnership[state.activePanelId]) {
          const firstContainer = Object.values(state.containers)[0] as PanelContainer;
          state.activePanelId = firstContainer?.focusedPanelId ?? null;
        }
      });
    },

    //Panel
    addPanel: (containerId, panelInput) => {
      const id = createNewId();
      const panel: PanelItem = {
        id,
        name: panelInput.name,
        path: panelInput.path,
        type: panelInput.type ?? 'Note', // todo
      };
      set(state => {
        const container: PanelContainer = state.containers[containerId];
        if (!container) return;

        // 컨테이너에 이미 존재하면 포커싱 & active
        const existingPanel = container.panelIds.find(
          pid =>
            state.panelEntities[pid].path === panel.path &&
            state.panelEntities[pid].name === panel.name,
        );
        if (existingPanel) {
          container.focusedPanelId = existingPanel;
          state.activePanelId = existingPanel;
          return;
        }

        // Panel entity 및 ownership 추가
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

        // container panelIds 배열에서 해당 panelId 삭제
        const idx = container.panelIds.indexOf(panelId);
        if (idx !== -1) container.panelIds.splice(idx, 1);
        delete state.panelEntities[panelId];
        delete state.panelOwnership[panelId];

        // panel이 아예 없을시 container 삭제
        if (container.panelIds.length === 0) {
          delete state.containers[containerId];

          // activePanelId와 삭제된 panel이 동일하다면
          if (state.activePanelId === panelId) {
            state.activePanelId =
              (Object.values(state.containers)[0] as PanelContainer)?.focusedPanelId ?? null;
          }
        } else {
          // focusedPanel update
          if (container.focusedPanelId === panelId) {
            container.focusedPanelId = container.panelIds[container.panelIds.length - 1];
          }
          // activePanelId와 삭제된 panel이 동이라하다면
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

        // --- targetIds에 해당하는 패널들을 기존 위치에서 제거하고 targetPanels에 저장 ---
        targetIds.forEach(pid => {
          const sourceContainerId = state.panelOwnership[pid];
          const sourceContainer = state.containers[sourceContainerId];
          if (!sourceContainer) return;
          affectedContainers.add(sourceContainerId);

          // soucrceContainer에서 삭제 후 targetPanels에 저장
          const idx = sourceContainer.panelIds.indexOf(pid);
          if (idx !== -1) sourceContainer.panelIds.splice(idx, 1);

          panelsToInsert.push(pid);
          state.panelOwnership[pid] = destinationContainerId;
        });

        // --- 대상 컨테이너에 패널들을 삽입 ---
        destContainer.panelIds.splice(destinationIndex, 0, ...panelsToInsert);
        if (panelsToInsert.some(pid => pid == state.activePanelId)) {
          destContainer.focusedPanelId = state.activePanelId ?? undefined;
        } else if (
          destContainer.focusedPanelId &&
          state.panelOwnership[destContainer.focusedPanelId] !== destinationContainerId
        ) {
          destContainer.focusedPanelId = panelsToInsert[panelsToInsert.length - 1];
        }

        // 영향 받은 컨테이너 수정
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
