import React from 'react';

import FolderImportModal, {
  FolderImportModalProps,
  FolderImportModalSubmitData,
} from './FolderImportModal';

export type { FolderImportModalSubmitData as NewFolderModalSubmitData };

export interface NewFolderModalProps extends FolderImportModalProps {}

const NewFolderModal: React.FC<NewFolderModalProps> = ({
  title = '새 폴더 만들기',
  cancelLabel = '취소',
  nextLabel = '다음',
  backLabel = '이전',
  submitLabel = '업서트',
  browseLabel = '찾기',
  ...rest
}) => {
  return (
    <FolderImportModal
      {...rest}
      title={title}
      cancelLabel={cancelLabel}
      nextLabel={nextLabel}
      backLabel={backLabel}
      submitLabel={submitLabel}
      browseLabel={browseLabel}
    />
  );
};

export default NewFolderModal;
