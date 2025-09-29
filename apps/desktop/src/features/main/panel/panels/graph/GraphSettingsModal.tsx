import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { GraphClause, GraphOption, GraphPreferences } from '@tgim/types/graph-settings';
import { RelationType } from '@tgim/types/graph';
import { Button, Modal, Switch } from '@tgim/ui';
import { Input as TextInput } from '@tgim/ui/Input';
import { GraphContext } from '@tgim/types/graph-panel';
import { createPreset } from '../../lib/graphPreferences';

interface Props {
  open: boolean;
  onClose: () => void;
  graphPreferences: GraphPreferences;
  graphOption: GraphOption;
  graphContext: GraphContext;
  onGraphOptionChange: (updater: (prev: GraphOption) => GraphOption) => void;
  onPreferencesChange: (updater: (prev: GraphPreferences) => GraphPreferences) => void;
  onSave: () => Promise<void> | void;
  saving: boolean;
  settingsLoaded: boolean;
}

const GraphSettingsModal: React.FC<Props> = ({
  open,
  onClose,
  graphPreferences,
  graphOption,
  graphContext,
  onGraphOptionChange,
  onPreferencesChange,
  onSave,
  saving,
  settingsLoaded,
}) => {
  const activePreset = useMemo(() => {
    return (
      graphPreferences.presets.find(preset => preset.id === graphPreferences.activePresetId) ??
      graphPreferences.presets[0]
    );
  }, [graphPreferences]);

  const [visibleLevelsInput, setVisibleLevelsInput] = useState('');
  const [perKindLevelsInput, setPerKindLevelsInput] = useState<Record<string, string>>({});
  const [clauseDraft, setClauseDraft] = useState<{
    type: GraphClause['type'];
    include: 'include' | 'exclude';
    value: string;
  }>({ type: 'linkedToNode', include: 'include', value: '' });

  useEffect(() => {
    setVisibleLevelsInput(graphOption.visibleLevels.join(', '));
  }, [graphOption.visibleLevels]);

  useEffect(() => {
    const next: Record<string, string> = {};
    graphContext.kindRuleIds.forEach(kindRuleId => {
      const levels = graphOption.perKindLevels[kindRuleId] ?? [];
      next[kindRuleId] = levels.length > 0 ? levels.join(', ') : '';
    });
    setPerKindLevelsInput(next);
  }, [graphContext.kindRuleIds, graphOption.perKindLevels]);

  const nodeOptions = useMemo(
    () =>
      Object.keys(graphContext.nodeLabels).map(nodeId => ({
        id: nodeId,
        label: graphContext.nodeLabels[nodeId] ?? nodeId,
      })),
    [graphContext.nodeLabels],
  );

  const relationOptions = useMemo(
    () => graphContext.connectionKinds.slice(),
    [graphContext.connectionKinds],
  );

  const nodeKindOptions = useMemo(
    () => Array.from(new Set(Object.values(graphContext.nodeTypes))),
    [graphContext.nodeTypes],
  );

  useEffect(() => {
    setClauseDraft(prev => {
      let value = prev.value;
      if (prev.type === 'linkedToNode') {
        if (!nodeOptions.some(option => option.id === value)) {
          value = nodeOptions[0]?.id ?? '';
        }
      } else if (prev.type === 'linkedViaKind') {
        if (!relationOptions.includes(value as RelationType)) {
          value = relationOptions[0] ?? '';
        }
      } else if (prev.type === 'linkedViaNodeKind') {
        if (!nodeKindOptions.includes(value)) {
          value = nodeKindOptions[0] ?? '';
        }
      }
      return { ...prev, value };
    });
  }, [nodeOptions, relationOptions, nodeKindOptions]);

  const handlePresetSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const presetId = event.target.value;
      onPreferencesChange(prev => ({ ...prev, activePresetId: presetId }));
    },
    [onPreferencesChange],
  );

  const handlePresetNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const name = event.target.value;
      if (!activePreset) return;

      onPreferencesChange(prev => ({
        ...prev,
        presets: prev.presets.map(preset =>
          preset.id === activePreset.id ? { ...preset, name } : preset,
        ),
      }));
    },
    [activePreset, onPreferencesChange],
  );

  const handlePresetCreate = useCallback(() => {
    const baseName = `프리셋 ${graphPreferences.presets.length + 1}`;
    const newPreset = createPreset(baseName, graphOption);
    onPreferencesChange(prev => ({
      presets: [...prev.presets, newPreset],
      activePresetId: newPreset.id,
    }));
  }, [graphOption, graphPreferences.presets.length, onPreferencesChange]);

  const handlePresetDelete = useCallback(() => {
    if (!activePreset || graphPreferences.presets.length <= 1) return;
    onPreferencesChange(prev => {
      const nextPresets = prev.presets.filter(preset => preset.id !== activePreset.id);
      const nextActiveId = nextPresets[0]?.id ?? prev.activePresetId;
      return {
        presets: nextPresets,
        activePresetId: nextActiveId,
      };
    });
  }, [activePreset, graphPreferences.presets.length, onPreferencesChange]);

  const handleVisibleLevelsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setVisibleLevelsInput(value);
      const levels = value
        .split(',')
        .map(entry => Number(entry.trim()))
        .filter(entry => Number.isFinite(entry));
      onGraphOptionChange(prev => ({ ...prev, visibleLevels: levels }));
    },
    [onGraphOptionChange],
  );

  const handlePerKindLevelsChange = useCallback(
    (kindRuleId: string, value: string) => {
      setPerKindLevelsInput(prev => ({ ...prev, [kindRuleId]: value }));
      const levels = value
        .split(',')
        .map(entry => Number(entry.trim()))
        .filter(entry => Number.isFinite(entry));
      onGraphOptionChange(prev => {
        const nextPerKind = { ...prev.perKindLevels };
        if (levels.length === 0) {
          delete nextPerKind[kindRuleId];
        } else {
          nextPerKind[kindRuleId] = levels;
        }
        return { ...prev, perKindLevels: nextPerKind };
      });
    },
    [onGraphOptionChange],
  );

  const handleMaxDepthChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const numeric = value === '' ? null : Number(value);
      if (numeric !== null && !Number.isFinite(numeric)) {
        return;
      }
      onGraphOptionChange(prev => ({ ...prev, maxDepth: numeric }));
    },
    [onGraphOptionChange],
  );

  const handleHideLevelTwoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onGraphOptionChange(prev => ({ ...prev, hideLevelTwoNodes: event.target.checked }));
    },
    [onGraphOptionChange],
  );

  const handleConnectionKindsChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>, type: 'include' | 'exclude') => {
      const selected = Array.from(event.target.selectedOptions).map(option => option.value);
      onGraphOptionChange(prev => ({
        ...prev,
        connectionKinds: {
          ...prev.connectionKinds,
          [type]: selected,
        },
      }));
    },
    [onGraphOptionChange],
  );

  const handleNodeKindsChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>, type: 'include' | 'exclude') => {
      const selected = Array.from(event.target.selectedOptions).map(option => option.value);
      onGraphOptionChange(prev => ({
        ...prev,
        nodeKinds: {
          ...prev.nodeKinds,
          [type]: selected,
        },
      }));
    },
    [onGraphOptionChange],
  );

  const handleClauseDraftTypeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const type = event.target.value as GraphClause['type'];
    setClauseDraft(prev => ({ ...prev, type }));
  }, []);

  const handleClauseDraftValueChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setClauseDraft(prev => ({ ...prev, value }));
    },
    [],
  );

  const handleAddClause = useCallback(() => {
    if (!clauseDraft.value) return;

    const include = clauseDraft.include === 'include';
    const nextClause: GraphClause =
      clauseDraft.type === 'linkedToNode'
        ? { type: 'linkedToNode', nodeId: clauseDraft.value, include }
        : clauseDraft.type === 'linkedViaKind'
          ? {
              type: 'linkedViaKind',
              relationKind: clauseDraft.value as RelationType,
              include,
            }
          : { type: 'linkedViaNodeKind', nodeKind: clauseDraft.value, include };

    onGraphOptionChange(prev => ({ ...prev, clauses: [...prev.clauses, nextClause] }));
  }, [clauseDraft, onGraphOptionChange]);

  const handleRemoveClause = useCallback(
    (index: number) => {
      onGraphOptionChange(prev => ({
        ...prev,
        clauses: prev.clauses.filter((_, idx) => idx !== index),
      }));
    },
    [onGraphOptionChange],
  );

  const describeClause = useCallback(
    (clause: GraphClause) => {
      switch (clause.type) {
        case 'linkedToNode':
          return `${clause.include ? '포함' : '제외'} · 노드 연결: ${
            graphContext.nodeLabels[clause.nodeId] ?? clause.nodeId
          }`;
        case 'linkedViaKind':
          return `${clause.include ? '포함' : '제외'} · 커넥션: ${clause.relationKind}`;
        case 'linkedViaNodeKind':
          return `${clause.include ? '포함' : '제외'} · 노드 타입: ${clause.nodeKind}`;
        default:
          return '';
      }
    },
    [graphContext.nodeLabels],
  );

  const handleSave = useCallback(async () => {
    await onSave();
  }, [onSave]);

  if (!open) return null;

  return (
    <Modal onClose={onClose} className="w-[720px] max-h-[80vh] overflow-y-auto">
      <div className="flex flex-col gap-6 p-6">
        <h2 className="text-lg font-semibold">그래프 설정</h2>
        {!settingsLoaded ? (
          <div className="text-sm text-text-soft">설정을 불러오는 중입니다…</div>
        ) : (
          <Fragment>
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium" htmlFor="graph-preset-select">
                  프리셋
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={handlePresetCreate}>
                    새 프리셋
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handlePresetDelete}
                    disabled={graphPreferences.presets.length <= 1 || !activePreset}
                  >
                    프리셋 삭제
                  </Button>
                </div>
              </div>
              <select
                id="graph-preset-select"
                className="input"
                value={graphPreferences.activePresetId}
                onChange={handlePresetSelect}
              >
                {graphPreferences.presets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <TextInput
                value={activePreset?.name ?? ''}
                onChange={handlePresetNameChange}
                placeholder="프리셋 이름"
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">허용 레벨</span>
                <TextInput
                  value={visibleLevelsInput}
                  onChange={handleVisibleLevelsChange}
                  placeholder="예: 1, 2, 3"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="graph-max-depth">
                  최대 깊이
                </label>
                <TextInput
                  id="graph-max-depth"
                  value={graphOption.maxDepth ?? ''}
                  onChange={handleMaxDepthChange}
                  placeholder="비우면 제한 없음"
                />
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={graphOption.hideLevelTwoNodes}
                  onChange={handleHideLevelTwoChange}
                />
                Level 2 노드 숨기기
              </label>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">커넥션 종류 포함</span>
                <select
                  multiple
                  value={graphOption.connectionKinds.include}
                  onChange={event => handleConnectionKindsChange(event, 'include')}
                  className="input h-32"
                >
                  {relationOptions.map(kind => (
                    <option key={`include-${kind}`} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">커넥션 종류 제외</span>
                <select
                  multiple
                  value={graphOption.connectionKinds.exclude}
                  onChange={event => handleConnectionKindsChange(event, 'exclude')}
                  className="input h-32"
                >
                  {relationOptions.map(kind => (
                    <option key={`exclude-${kind}`} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">노드 타입 포함</span>
                <select
                  multiple
                  value={graphOption.nodeKinds.include}
                  onChange={event => handleNodeKindsChange(event, 'include')}
                  className="input h-32"
                >
                  {nodeKindOptions.map(kind => (
                    <option key={`include-node-${kind}`} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">노드 타입 제외</span>
                <select
                  multiple
                  value={graphOption.nodeKinds.exclude}
                  onChange={event => handleNodeKindsChange(event, 'exclude')}
                  className="input h-32"
                >
                  {nodeKindOptions.map(kind => (
                    <option key={`exclude-node-${kind}`} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {graphContext.kindRuleIds.length ? (
              <section className="flex flex-col gap-3">
                <span className="text-sm font-medium">커넥션 규칙별 레벨</span>
                <div className="flex flex-col gap-3">
                  {graphContext.kindRuleIds.map(kindRuleId => (
                    <label key={kindRuleId} className="flex flex-col gap-2 text-sm">
                      <span className="font-medium">{kindRuleId}</span>
                      <TextInput
                        value={perKindLevelsInput[kindRuleId] ?? ''}
                        onChange={event => handlePerKindLevelsChange(kindRuleId, event.target.value)}
                        placeholder="예: 1, 2"
                      />
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <span className="text-sm font-medium">필터 조건 (AND)</span>
              {graphOption.clauses.length ? (
                <ul className="flex flex-col gap-2">
                  {graphOption.clauses.map((clause, index) => (
                    <li
                      key={`${clause.type}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2"
                    >
                      <span className="text-sm">{describeClause(clause)}</span>
                      <Button type="button" variant="secondary" onClick={() => handleRemoveClause(index)}>
                        제거
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-text-soft">등록된 필터가 없습니다.</div>
              )}
              <div className="grid gap-2 md:grid-cols-4">
                <select
                  value={clauseDraft.type}
                  onChange={handleClauseDraftTypeChange}
                  className="input"
                >
                  <option value="linkedToNode">특정 노드 연결</option>
                  <option value="linkedViaKind">커넥션 종류</option>
                  <option value="linkedViaNodeKind">연결된 노드 타입</option>
                </select>
                <Switch
                  current={clauseDraft.include}
                  options={[
                    { name: '포함', value: 'include' as const },
                    { name: '제외', value: 'exclude' as const },
                  ]}
                  onChanged={value =>
                    setClauseDraft(prev => ({ ...prev, include: value as 'include' | 'exclude' }))
                  }
                />
                <select
                  value={clauseDraft.value}
                  onChange={handleClauseDraftValueChange}
                  className="input md:col-span-2"
                >
                  {clauseDraft.type === 'linkedToNode'
                    ? nodeOptions.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))
                    : clauseDraft.type === 'linkedViaKind'
                      ? relationOptions.map(kind => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))
                      : nodeKindOptions.map(kind => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                </select>
                <Button type="button" variant="secondary" onClick={handleAddClause}>
                  추가
                </Button>
              </div>
            </section>
          </Fragment>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default GraphSettingsModal;
