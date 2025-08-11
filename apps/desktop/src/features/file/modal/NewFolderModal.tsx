import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@tgim/ui/index';
import { Input } from '@tgim/ui/Input';
import React, { useState } from 'react';

interface Props {
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const NewFolderModal: React.FC<Props> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const handleSubmit = () => {
    if (!name.trim()) {
      alert('폴더 이름을 입력하세요.');
      return;
    }
    onSubmit({ name, path });
    onClose();
  };

  const pickFolder = async () => {
    const result = await open({ directory: true });
    setPath(result ?? '');
  };

  return (
    <div className="text-modal-text">
      <div className="" onClick={onClose}></div>
      <div className="">
        <h2>새 폴더 만들기</h2>
        <Input
          className="bg-modal-input-bg hover:bg-modal-input-hover shadow-lg mt-5"
          placeholder="폴더 이름"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex mt-3">
          <Input
            className="read-only:bg-transparent shadow-lg truncate"
            readOnly
            placeholder="실제 폴더 경로"
            value={path}
            onChange={e => setName(e.target.value)}
          />
          <Button
            variant="default"
            className="whitespace-nowrap bg-modal-input-bg hover:bg-modal-input-hover ml-4"
            onClick={pickFolder}
          >
            찾기
          </Button>
        </div>
        <div className="w-full flex justify-end mt-5">
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={handleSubmit}>
            생성
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewFolderModal;
