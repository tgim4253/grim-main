import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '@/shared/types';

type UseReferenceCroquisLauncherOptions = {
  selectedAssetIds: readonly string[];
  onStarted?: () => void;
};

export function useReferenceCroquisLauncher({
  selectedAssetIds,
  onStarted,
}: UseReferenceCroquisLauncherOptions) {
  const { t } = useTranslation('common');
  const [croquisModalOpen, setCroquisModalOpen] = useState(false);
  const [croquisAssetIds, setCroquisAssetIds] = useState<string[]>([]);
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isCroquisConfigLoading, setIsCroquisConfigLoading] = useState(false);
  const [croquisConfigError, setCroquisConfigError] = useState<string | null>(null);
  const croquisConfigLoadSequenceRef = useRef(0);

  const loadCroquisConfiguration = useCallback(async () => {
    const loadSequence = croquisConfigLoadSequenceRef.current + 1;
    croquisConfigLoadSequenceRef.current = loadSequence;
    setIsCroquisConfigLoading(true);
    setCroquisConfigError(null);

    try {
      const [nextPresets, nextTimeStepPresets, nextTagIndex] = await Promise.all([
        ipc.session.listPresets(),
        ipc.session.listTimeStepPresets(),
        ipc.tag.loadIndex(),
      ]);

      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets(nextPresets);
      setTimeStepPresets(nextTimeStepPresets);
      setTagGroups(nextTagIndex.groups);
      setTags(nextTagIndex.tags);
      return true;
    } catch (nextError) {
      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets([]);
      setTimeStepPresets([]);
      setTagGroups([]);
      setTags([]);
      setCroquisConfigError(
        getErrorMessage(
          nextError,
          t('croquis.error.load_configuration', {
            defaultValue: 'Failed to load Croquis session configuration.',
          }),
        ),
      );
      return false;
    } finally {
      if (croquisConfigLoadSequenceRef.current === loadSequence) {
        setIsCroquisConfigLoading(false);
      }
    }
  }, [t]);

  const openCroquisForAssets = useCallback(
    (assetIds: string[]) => {
      if (assetIds.length === 0 || isCroquisConfigLoading) {
        return;
      }

      void loadCroquisConfiguration().then(configurationLoaded => {
        if (configurationLoaded) {
          setCroquisAssetIds(assetIds);
          setCroquisModalOpen(true);
        }
      });
    },
    [isCroquisConfigLoading, loadCroquisConfiguration],
  );

  const startCroquisForSelectedAssets = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    openCroquisForAssets([...selectedAssetIds]);
  }, [openCroquisForAssets, selectedAssetIds]);

  const closeCroquisModal = useCallback(() => {
    setCroquisModalOpen(false);
    setCroquisAssetIds([]);
  }, []);

  const handleCroquisStarted = useCallback(() => {
    setCroquisModalOpen(false);
    setCroquisAssetIds([]);
    onStarted?.();
  }, [onStarted]);

  return {
    croquisModalOpen,
    croquisAssetIds,
    sessionPresets,
    timeStepPresets,
    tags,
    tagGroups,
    isCroquisConfigLoading,
    croquisConfigError,
    openCroquisForAssets,
    startCroquisForSelectedAssets,
    closeCroquisModal,
    handleCroquisStarted,
  };
}
